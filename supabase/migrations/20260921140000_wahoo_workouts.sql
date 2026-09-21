-- Pkt 7 (docs/14): Bolt w obie stronie – wykonane treningi z Wahoo + stan wysyłki widoczny w aplikacji.

-- wahoo_pushes do odczytu przez klienta przez zwykłą synchronizację (kursor po server_updated_at)
alter table public.wahoo_pushes add column if not exists server_updated_at timestamptz not null default now();
alter table public.wahoo_pushes add column if not exists deleted_at timestamptz;
drop trigger if exists lww_guard on public.wahoo_pushes;
create trigger lww_guard before insert or update on public.wahoo_pushes for each row execute function private.lww_guard();

-- ---------------------------------------------------------------- wykonane treningi z Wahoo (workout_summary)
create table public.wahoo_workouts (
  id bigint primary key,                          -- wahoo workout id
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,                             -- data lokalna startu (Europe/Warsaw)
  starts timestamptz not null,
  name text,
  minutes_active integer not null default 0,
  distance_km numeric(6, 1),
  avg_hr smallint,
  avg_power smallint,
  np_w smallint,
  avg_cadence smallint,
  avg_speed_kmh numeric(5, 1),
  ascent_m integer,
  summary jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index wahoo_workouts_user_date_idx on public.wahoo_workouts (user_id, date);
create trigger lww_guard before insert or update on public.wahoo_workouts for each row execute function private.lww_guard();
alter table public.wahoo_workouts enable row level security;
create policy "wahoo_workouts: select own" on public.wahoo_workouts for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.wahoo_workouts from anon;

-- ---------------------------------------------------------------- log dnia z Wahoo, gdy nie ma jazdy ze Stravy (Strava ma pierwszeństwo)
create or replace function private.rebuild_bike_log_from_wahoo(p_user uuid, p_date date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  agg record;
  existing public.session_logs%rowtype;
begin
  if exists (select 1 from public.strava_activities where user_id = p_user and date = p_date and is_ride and deleted_at is null) then
    return;
  end if;
  select count(*) as n,
         sum(minutes_active) as minutes,
         sum(distance_km) as dist_km,
         sum(ascent_m) as ascent,
         (sum(avg_hr * minutes_active) filter (where avg_hr is not null))::numeric / nullif(sum(minutes_active) filter (where avg_hr is not null), 0) as avg_hr,
         (sum(avg_cadence * minutes_active) filter (where avg_cadence is not null))::numeric / nullif(sum(minutes_active) filter (where avg_cadence is not null), 0) as avg_cad,
         sum(distance_km) / nullif(sum(minutes_active), 0) * 60 as avg_kmh,
         string_agg(coalesce(name, 'trening'), ' + ' order by starts) as names
    into agg
    from public.wahoo_workouts
   where user_id = p_user and date = p_date and deleted_at is null;
  if agg.n = 0 then
    return;
  end if;
  select * into existing from public.session_logs
   where user_id = p_user and date = p_date and kind = 'bike' and deleted_at is null
   order by updated_at desc limit 1;
  if existing.id is null then
    insert into public.session_logs (user_id, date, kind, planned_workout_id, status, duration_min, distance_km, elevation_m, avg_hr, avg_cadence, avg_speed_kmh, notes, updated_at)
    values (p_user, p_date, 'bike', null, 'done', agg.minutes, round(agg.dist_km, 1), agg.ascent, round(agg.avg_hr), round(agg.avg_cad), round(agg.avg_kmh, 1), 'Wahoo: ' || agg.names, now());
  elsif existing.strava_activity_id is null then
    update public.session_logs
       set status = case when existing.status in ('planned', 'in_progress') then 'done' else existing.status end,
           duration_min = coalesce(existing.duration_min, agg.minutes),
           distance_km = coalesce(existing.distance_km, round(agg.dist_km, 1)),
           elevation_m = coalesce(existing.elevation_m, agg.ascent),
           avg_hr = coalesce(existing.avg_hr, round(agg.avg_hr)),
           avg_cadence = coalesce(existing.avg_cadence, round(agg.avg_cad)),
           avg_speed_kmh = coalesce(existing.avg_speed_kmh, round(agg.avg_kmh, 1)),
           notes = case when existing.notes is null or existing.notes like 'Wahoo: %' then 'Wahoo: ' || agg.names else existing.notes end,
           updated_at = now()
     where id = existing.id;
  end if;
end;
$$;
revoke all on function private.rebuild_bike_log_from_wahoo(uuid, date) from public;

create or replace function private.wahoo_workout_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.rebuild_bike_log_from_wahoo(new.user_id, new.date);
  return new;
end;
$$;
revoke all on function private.wahoo_workout_changed() from public;

create trigger wahoo_workout_changed
  after insert or update on public.wahoo_workouts
  for each row execute function private.wahoo_workout_changed();
