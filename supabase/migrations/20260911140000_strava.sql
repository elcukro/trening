-- Etap 3: Strava. Aktywności per jazda + agregacja do session_logs (dzień, kind='bike').

create table public.strava_activities (
  id bigint primary key,                         -- strava activity id
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,                            -- data lokalna (Europe/Warsaw) – można ręcznie zmienić (przypisanie)
  start_at timestamptz not null,
  name text,
  sport_type text,
  moving_time_s integer not null default 0,
  elapsed_time_s integer,
  distance_m numeric(9, 1),
  elevation_m numeric(7, 1),
  avg_hr smallint,
  max_hr smallint,
  avg_cadence smallint,
  avg_speed_ms numeric(6, 3),
  avg_watts smallint,
  /** histogram tętna: sekundy per bpm (indeks = bpm), z niego liczymy czas w strefach dla aktualnego LTHR */
  hr_histogram jsonb,
  is_ride boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index strava_activities_user_date_idx on public.strava_activities (user_id, date);
create trigger lww_guard before insert or update on public.strava_activities for each row execute function private.lww_guard();

alter table public.strava_activities enable row level security;
create policy "strava_activities: select own" on public.strava_activities for select to authenticated using ((select auth.uid()) = user_id);
-- klient może tylko przenieść aktywność na inny dzień (ręczne przypisanie) lub oznaczyć jako nie-jazdę
create policy "strava_activities: update own" on public.strava_activities for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.strava_activities from anon;

-- ---------------------------------------------------------------- agregacja: wszystkie jazdy dnia → jeden session_log (bike)
create or replace function private.rebuild_bike_log(p_user uuid, p_date date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  agg record;
  existing public.session_logs%rowtype;
begin
  select count(*) as n,
         sum(moving_time_s) as moving_s,
         sum(distance_m) as dist_m,
         sum(elevation_m) as elev_m,
         (sum(avg_hr * moving_time_s) filter (where avg_hr is not null))::numeric / nullif(sum(moving_time_s) filter (where avg_hr is not null), 0) as avg_hr,
         max(max_hr) as max_hr,
         (sum(avg_cadence * moving_time_s) filter (where avg_cadence is not null))::numeric / nullif(sum(moving_time_s) filter (where avg_cadence is not null), 0) as avg_cad,
         sum(distance_m) / nullif(sum(moving_time_s), 0) * 3.6 as avg_kmh,
         min(id) as first_id,
         string_agg(name, ' + ' order by start_at) as names
    into agg
    from public.strava_activities
   where user_id = p_user and date = p_date and is_ride and deleted_at is null;

  select * into existing from public.session_logs
   where user_id = p_user and date = p_date and kind = 'bike' and deleted_at is null
   order by updated_at desc limit 1;

  if agg.n = 0 then
    -- brak jazd: jeśli log pochodził ze Stravy (ma strava_activity_id) i nie był ręcznie edytowany, wyczyść dane Stravy
    if existing.id is not null and existing.strava_activity_id is not null then
      update public.session_logs
         set strava_activity_id = null, updated_at = now(),
             status = case when status in ('done', 'modified') then 'planned' else status end
       where id = existing.id;
    end if;
    return;
  end if;

  if existing.id is null then
    insert into public.session_logs (user_id, date, kind, planned_workout_id, status, duration_min, distance_km, elevation_m, avg_hr, max_hr, avg_cadence, avg_speed_kmh, strava_activity_id, notes, updated_at)
    values (p_user, p_date, 'bike', null, 'done', round(agg.moving_s / 60.0), round(agg.dist_m / 1000.0, 1), round(agg.elev_m), round(agg.avg_hr), agg.max_hr, round(agg.avg_cad), round(agg.avg_kmh, 1), agg.first_id, 'Strava: ' || agg.names, now());
  else
    update public.session_logs
       set status = case when existing.status in ('planned', 'in_progress') then 'done' else existing.status end,
           duration_min = round(agg.moving_s / 60.0),
           distance_km = round(agg.dist_m / 1000.0, 1),
           elevation_m = round(agg.elev_m),
           avg_hr = round(agg.avg_hr),
           max_hr = agg.max_hr,
           avg_cadence = round(agg.avg_cad),
           avg_speed_kmh = round(agg.avg_kmh, 1),
           strava_activity_id = agg.first_id,
           notes = case when existing.notes is null or existing.notes like 'Strava: %' then 'Strava: ' || agg.names else existing.notes end,
           updated_at = now()
     where id = existing.id;
  end if;
end;
$$;
revoke all on function private.rebuild_bike_log(uuid, date) from public;

-- po każdej zmianie aktywności przelicz log dnia (także starej daty przy ręcznym przeniesieniu)
create or replace function private.strava_activity_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (old.date <> new.date or old.user_id <> new.user_id) then
    perform private.rebuild_bike_log(old.user_id, old.date);
  end if;
  if tg_op = 'DELETE' then
    perform private.rebuild_bike_log(old.user_id, old.date);
    return old;
  end if;
  perform private.rebuild_bike_log(new.user_id, new.date);
  return new;
end;
$$;
revoke all on function private.strava_activity_changed() from public;

create trigger strava_activity_changed
  after insert or update or delete on public.strava_activities
  for each row execute function private.strava_activity_changed();
