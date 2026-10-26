-- docs/33: AI tylko na danych Wahoo, proweniencja, Wahoo ma pierwszeństwo przed Stravą.

-- ---------------------------------------------------------------- wahoo_workouts: metryki z pliku FIT i notatka trenera
alter table public.wahoo_workouts add column if not exists moving_time_s integer;
alter table public.wahoo_workouts add column if not exists max_hr smallint;
alter table public.wahoo_workouts add column if not exists hr_histogram jsonb;
alter table public.wahoo_workouts add column if not exists mmp_w jsonb;
alter table public.wahoo_workouts add column if not exists best_speed_kmh jsonb;
alter table public.wahoo_workouts add column if not exists decoupling_pct numeric;
alter table public.wahoo_workouts add column if not exists device_watts boolean;
alter table public.wahoo_workouts add column if not exists has_streams boolean not null default false;
alter table public.wahoo_workouts add column if not exists fit_error text;
alter table public.wahoo_workouts add column if not exists note text;
alter table public.wahoo_workouts add column if not exists note_source text check (note_source in ('ai', 'rules'));
alter table public.wahoo_workouts add column if not exists note_at timestamptz;
alter table public.wahoo_workouts add column if not exists note_facts jsonb;

-- próbki co 5 s z pliku FIT (ten sam kształt co strava_streams)
create table if not exists public.wahoo_streams (
  workout_id bigint primary key references public.wahoo_workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dt smallint not null,
  n integer not null,
  samples jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists wahoo_streams_user_idx on public.wahoo_streams (user_id);
alter table public.wahoo_streams enable row level security;
create policy "wahoo_streams: select own" on public.wahoo_streams for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.wahoo_streams from anon;

-- ---------------------------------------------------------------- proweniencja logu dnia
alter table public.session_logs add column if not exists source text check (source in ('strava', 'wahoo', 'manual'));
update public.session_logs set source = 'strava' where source is null and strava_activity_id is not null;
update public.session_logs set source = 'wahoo' where source is null and notes like 'Wahoo: %';
update public.session_logs set source = 'manual' where source is null;
alter table public.session_logs alter column source set default 'manual';

-- kiedy dane przyszły ze Stravy (retencja 7 dni liczona od pobrania, docs/33 § 5)
alter table public.strava_activities add column if not exists fetched_at timestamptz;
update public.strava_activities set fetched_at = coalesce(updated_at, created_at) where fetched_at is null;
alter table public.strava_activities alter column fetched_at set default now();

-- ---------------------------------------------------------------- jeden log dnia z obu źródeł: Wahoo wygrywa
create or replace function private.rebuild_day_log(p_user uuid, p_date date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  agg record;
  src text;
  existing public.session_logs%rowtype;
begin
  select count(*) as n,
         sum(coalesce(moving_time_s, minutes_active * 60)) as moving_s,
         sum(distance_km) * 1000 as dist_m,
         sum(ascent_m) as elev_m,
         (sum(avg_hr * minutes_active) filter (where avg_hr is not null))::numeric / nullif(sum(minutes_active) filter (where avg_hr is not null), 0) as avg_hr,
         max(max_hr) as max_hr,
         (sum(avg_cadence * minutes_active) filter (where avg_cadence is not null))::numeric / nullif(sum(minutes_active) filter (where avg_cadence is not null), 0) as avg_cad,
         sum(distance_km) * 1000 / nullif(sum(coalesce(moving_time_s, minutes_active * 60)), 0) * 3.6 as avg_kmh,
         null::bigint as first_id,
         string_agg(coalesce(name, 'trening'), ' + ' order by starts) as names
    into agg
    from public.wahoo_workouts
   where user_id = p_user and date = p_date and deleted_at is null;
  src := 'wahoo';

  if agg.n = 0 then
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
    src := 'strava';
  end if;

  select * into existing from public.session_logs
   where user_id = p_user and date = p_date and kind = 'bike' and deleted_at is null
   order by updated_at desc limit 1;

  if agg.n = 0 then
    -- brak jazd: log zbudowany z jazd (nie ręczny) wraca do planu, metryki znikają razem ze źródłem
    if existing.id is not null and existing.source in ('strava', 'wahoo') then
      update public.session_logs
         set strava_activity_id = null, source = 'manual', updated_at = now(),
             duration_min = null, distance_km = null, elevation_m = null, avg_hr = null, max_hr = null, avg_cadence = null, avg_speed_kmh = null,
             notes = case when notes like 'Strava: %' or notes like 'Wahoo: %' then null else notes end,
             status = case when status in ('done', 'modified') and rpe is null then 'planned' else status end
       where id = existing.id;
    end if;
    return;
  end if;

  if existing.id is null then
    insert into public.session_logs (user_id, date, kind, planned_workout_id, status, duration_min, distance_km, elevation_m, avg_hr, max_hr, avg_cadence, avg_speed_kmh, strava_activity_id, source, notes, updated_at)
    values (p_user, p_date, 'bike', null, 'done', round(agg.moving_s / 60.0), round(agg.dist_m / 1000.0, 1), round(agg.elev_m), round(agg.avg_hr), agg.max_hr, round(agg.avg_cad), round(agg.avg_kmh, 1), agg.first_id, src,
            case when src = 'wahoo' then 'Wahoo: ' else 'Strava: ' end || agg.names, now());
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
           notes = case when existing.notes is null or existing.notes like 'Strava: %' or existing.notes like 'Wahoo: %'
                        then case when src = 'wahoo' then 'Wahoo: ' else 'Strava: ' end || agg.names
                        else existing.notes end,
           updated_at = now()
     where id = existing.id;
  end if;
end;
$$;
revoke all on function private.rebuild_day_log(uuid, date) from public;

-- stare nazwy wołane przez triggery – teraz obie liczą to samo
create or replace function private.rebuild_bike_log(p_user uuid, p_date date)
returns void language sql set search_path = '' as $$ select private.rebuild_day_log(p_user, p_date) $$;
create or replace function private.rebuild_bike_log_from_wahoo(p_user uuid, p_date date)
returns void language sql set search_path = '' as $$ select private.rebuild_day_log(p_user, p_date) $$;

-- trigger Wahoo: także usunięcie i zmiana daty; zapis notatki albo metryk FIT nie przelicza logu (kolumny w „of”)
create or replace function private.wahoo_workout_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- „update of …” odpala się przy każdym upsercie (kolumna jest w SET), więc porównujemy wartości
  if tg_op = 'UPDATE' and (new.date, new.minutes_active, new.moving_time_s, new.distance_km, new.ascent_m, new.avg_hr, new.max_hr, new.avg_cadence, new.deleted_at)
     is not distinct from (old.date, old.minutes_active, old.moving_time_s, old.distance_km, old.ascent_m, old.avg_hr, old.max_hr, old.avg_cadence, old.deleted_at) then
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
revoke all on function private.wahoo_workout_changed() from public;
drop trigger if exists wahoo_workout_changed on public.wahoo_workouts;
create trigger wahoo_workout_changed
  after insert or delete or update of date, minutes_active, moving_time_s, distance_km, ascent_m, avg_hr, max_hr, avg_cadence, deleted_at on public.wahoo_workouts
  for each row execute function private.wahoo_workout_changed();

-- przelicz dni, w których są jazdy z Wahoo (dotąd Strava miała pierwszeństwo)
do $$
declare r record;
begin
  for r in select distinct user_id, date from public.wahoo_workouts where deleted_at is null loop
    perform private.rebuild_day_log(r.user_id, r.date);
  end loop;
end $$;

-- ---------------------------------------------------------------- zapis na Stravę wyłączony (docs/33 § 6)
update public.profiles set strava_write = false where strava_write;

-- ---------------------------------------------------------------- odpytanie Wahoo co 30 min (zapas dla webhooka)
create or replace function private.wahoo_poll_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text;
begin
  select decrypted_secret into key from vault.decrypted_secrets where name = 'push_cron_secret' limit 1;
  if key is null then
    raise notice 'brak sekretu push_cron_secret w vault – pomijam Wahoo';
    return;
  end if;
  perform net.http_post(
    url := 'https://kgllegvlnmchdvkkbitt.supabase.co/functions/v1/wahoo-push',
    headers := jsonb_build_object('content-type', 'application/json'),
    body := jsonb_build_object('mode', 'cron', 'secret', key),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function private.wahoo_poll_cron() from public;
select cron.schedule('trening-wahoo-poll', '*/30 * * * *', $$select private.wahoo_poll_cron()$$);
