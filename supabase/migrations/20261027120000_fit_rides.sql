-- Jazdy z wgranego pliku FIT (docs/33 § 7a): MyWhoosh wysyła jazdę tylko na Stravę, a jej danych nie wolno brać do AI.
-- Zawodnik pobiera plik (mywhoosh.com → Profil → Aktywności) i wgrywa go w aplikacji → Edge Function `fit-upload`
-- liczy metryki tym samym kodem co plik z Wahoo. Źródło `fit` – dozwolone dla AI, bez limitu 7 dni (nasze dane).

-- ---------------------------------------------------------------- jazdy (kolumny jak w strava_activities – wspólny RideRow)
create table if not exists public.fit_rides (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_sha256 text not null,                      -- ten sam plik drugi raz nie tworzy drugiej jazdy
  file_name text,
  date date not null,                             -- data lokalna startu (Europe/Warsaw)
  start_at timestamptz not null,
  name text,
  moving_time_s integer not null,
  elapsed_time_s integer not null,
  distance_m integer not null default 0,
  elevation_m integer not null default 0,
  avg_hr smallint,
  max_hr smallint,
  avg_cadence smallint,
  avg_watts smallint,
  np_w smallint,
  device_watts boolean not null default false,
  decoupling_pct numeric,
  mmp_w jsonb,
  best_speed_kmh jsonb,
  hr_histogram jsonb,
  has_streams boolean not null default true,
  note text,
  note_source text check (note_source in ('ai', 'rules')),
  note_at timestamptz,
  note_facts jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  unique (user_id, file_sha256)
);
create index if not exists fit_rides_user_date_idx on public.fit_rides (user_id, date);
create index if not exists fit_rides_user_sync_idx on public.fit_rides (user_id, server_updated_at);
drop trigger if exists lww_guard on public.fit_rides;
create trigger lww_guard before insert or update on public.fit_rides for each row execute function private.lww_guard();
alter table public.fit_rides enable row level security;
-- zapis tylko przez `fit-upload` (service role) – aplikacja czyta
drop policy if exists "fit_rides: select own" on public.fit_rides;
create policy "fit_rides: select own" on public.fit_rides for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.fit_rides from anon;

-- próbki co 5 s (ten sam kształt co strava_streams / wahoo_streams)
create table if not exists public.fit_streams (
  ride_id bigint primary key references public.fit_rides (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dt smallint not null,
  n integer not null,
  samples jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists fit_streams_user_idx on public.fit_streams (user_id);
alter table public.fit_streams enable row level security;
drop policy if exists "fit_streams: select own" on public.fit_streams;
create policy "fit_streams: select own" on public.fit_streams for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.fit_streams from anon;

-- ---------------------------------------------------------------- proweniencja logu dnia: nowe źródło
alter table public.session_logs drop constraint if exists session_logs_source_check;
alter table public.session_logs add constraint session_logs_source_check check (source in ('strava', 'wahoo', 'fit', 'manual'));

-- ---------------------------------------------------------------- log dnia: Wahoo + pliki (bez bliźniaków z Wahoo), Strava tylko bez nich
create or replace function private.rebuild_day_log(p_user uuid, p_date date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  agg record;
  src text;
  prefix text;
  existing public.session_logs%rowtype;
begin
  with r as (
    select coalesce(w.moving_time_s, w.minutes_active * 60) as mv, w.distance_km * 1000 as dist_m, w.ascent_m as elev,
           w.avg_hr, w.max_hr, w.avg_cadence as cad, coalesce(w.name, 'trening') as name, w.starts as st, 'wahoo' as kind
      from public.wahoo_workouts w
     where w.user_id = p_user and w.date = p_date and w.deleted_at is null
    union all
    -- plik z Bolta wgrany ręcznie to bliźniak kopii z Wahoo – liczy się raz; jak `sameRide`: start ≤ 10 min albo czas
    -- jazdy ±2 % i start ≤ 3 h (jazda z MyWhoosh przypięta w Wahoo do planu ma godzinę planu)
    select f.moving_time_s, f.distance_m, f.elevation_m, f.avg_hr, f.max_hr, f.avg_cadence, coalesce(f.name, 'trening'), f.start_at, 'fit'
      from public.fit_rides f
     where f.user_id = p_user and f.date = p_date and f.deleted_at is null
       and not exists (select 1 from public.wahoo_workouts w
                        where w.user_id = p_user and w.date = p_date and w.deleted_at is null
                          and (abs(extract(epoch from (w.starts - f.start_at))) <= 600
                               or (abs(extract(epoch from (w.starts - f.start_at))) <= 3 * 3600
                                   and greatest(f.moving_time_s, coalesce(w.moving_time_s, w.minutes_active * 60)) >= 600
                                   and abs(f.moving_time_s - coalesce(w.moving_time_s, w.minutes_active * 60))
                                       <= 0.02 * greatest(f.moving_time_s, coalesce(w.moving_time_s, w.minutes_active * 60)))))
  )
  -- typy pól `agg` jawnie i tak samo w obu zapytaniach – plan PL/pgSQL pamięta typy z pierwszego wywołania w sesji
  select count(*) as n,
         sum(mv)::numeric as moving_s,
         sum(dist_m)::numeric as dist_m,
         sum(elev)::numeric as elev_m,
         (sum(avg_hr * mv) filter (where avg_hr is not null))::numeric / nullif(sum(mv) filter (where avg_hr is not null), 0) as avg_hr,
         max(max_hr)::integer as max_hr,
         (sum(cad * mv) filter (where cad is not null))::numeric / nullif(sum(mv) filter (where cad is not null), 0) as avg_cad,
         (sum(dist_m) / nullif(sum(mv), 0) * 3.6)::numeric as avg_kmh,
         null::bigint as first_id,
         string_agg(name, ' + ' order by st) as names,
         bool_or(kind = 'wahoo') as any_wahoo
    into agg
    from r;
  src := case when agg.any_wahoo then 'wahoo' else 'fit' end;

  if agg.n = 0 then
    select count(*) as n,
           sum(moving_time_s)::numeric as moving_s,
           sum(distance_m)::numeric as dist_m,
           sum(elevation_m)::numeric as elev_m,
           (sum(avg_hr * moving_time_s) filter (where avg_hr is not null))::numeric / nullif(sum(moving_time_s) filter (where avg_hr is not null), 0) as avg_hr,
           max(max_hr)::integer as max_hr,
           (sum(avg_cadence * moving_time_s) filter (where avg_cadence is not null))::numeric / nullif(sum(moving_time_s) filter (where avg_cadence is not null), 0) as avg_cad,
           (sum(distance_m) / nullif(sum(moving_time_s), 0) * 3.6)::numeric as avg_kmh,
           min(id)::bigint as first_id,
           string_agg(name, ' + ' order by start_at) as names,
           false as any_wahoo
      into agg
      from public.strava_activities
     where user_id = p_user and date = p_date and is_ride and deleted_at is null;
    src := 'strava';
  end if;
  prefix := case src when 'wahoo' then 'Wahoo: ' when 'fit' then 'FIT: ' else 'Strava: ' end;

  select * into existing from public.session_logs
   where user_id = p_user and date = p_date and kind = 'bike' and deleted_at is null
   order by updated_at desc limit 1;

  if agg.n = 0 then
    -- brak jazd: log zbudowany z jazd (nie ręczny) wraca do planu, metryki znikają razem ze źródłem
    if existing.id is not null and existing.source in ('strava', 'wahoo', 'fit') then
      update public.session_logs
         set strava_activity_id = null, source = 'manual', updated_at = now(),
             duration_min = null, distance_km = null, elevation_m = null, avg_hr = null, max_hr = null, avg_cadence = null, avg_speed_kmh = null,
             notes = case when notes like 'Strava: %' or notes like 'Wahoo: %' or notes like 'FIT: %' then null else notes end,
             status = case when status in ('done', 'modified') and rpe is null then 'planned' else status end
       where id = existing.id;
    end if;
    return;
  end if;

  if existing.id is null then
    insert into public.session_logs (user_id, date, kind, planned_workout_id, status, duration_min, distance_km, elevation_m, avg_hr, max_hr, avg_cadence, avg_speed_kmh, strava_activity_id, source, notes, updated_at)
    values (p_user, p_date, 'bike', null, 'done', round(agg.moving_s / 60.0), round(agg.dist_m / 1000.0, 1), round(agg.elev_m), round(agg.avg_hr), agg.max_hr, round(agg.avg_cad), round(agg.avg_kmh, 1), agg.first_id, src,
            prefix || agg.names, now());
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
           source = src,
           notes = case when existing.notes is null or existing.notes like 'Strava: %' or existing.notes like 'Wahoo: %' or existing.notes like 'FIT: %'
                        then prefix || agg.names
                        else existing.notes end,
           updated_at = now()
     where id = existing.id;
  end if;
end;
$$;
revoke all on function private.rebuild_day_log(uuid, date) from public;

-- trigger pliku: wstawienie, usunięcie (deleted_at), zmiana daty; zapis notatki nie przelicza logu
create or replace function private.fit_ride_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.date, new.moving_time_s, new.distance_m, new.elevation_m, new.avg_hr, new.max_hr, new.avg_cadence, new.deleted_at)
     is not distinct from (old.date, old.moving_time_s, old.distance_m, old.elevation_m, old.avg_hr, old.max_hr, old.avg_cadence, old.deleted_at) then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.rebuild_day_log(old.user_id, old.date);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' or new.date is distinct from old.date then
    perform private.rebuild_day_log(new.user_id, new.date);
  end if;
  return new;
end;
$$;
revoke all on function private.fit_ride_changed() from public;
drop trigger if exists fit_ride_changed on public.fit_rides;
create trigger fit_ride_changed
  after insert or delete or update of date, moving_time_s, distance_m, elevation_m, avg_hr, max_hr, avg_cadence, deleted_at on public.fit_rides
  for each row execute function private.fit_ride_changed();
