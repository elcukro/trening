-- Jazdy z innych aplikacji w Wahoo „tylko czas” (27.10.2026, docs/33 § 7a): Wahoo pokazuje jazdę z MyWhoosh na liście
-- (nazwa, start, minuty), ale podsumowanie i plik oddaje tylko aplikacji, która ją wgrała (401). Zapisujemy, że się
-- odbyła (`foreign_app_id`), a wgrany plik FIT, który do niej pasuje, ją zastępuje – w logu dnia i w `mergeRides`.

alter table public.wahoo_workouts add column if not exists foreign_app_id integer;

-- ta sama jazda w dwóch źródłach – jak `sameRide` w _shared/rides.ts: start ≤ 10 min albo czas jazdy ±2 % (≥ 10 min)
-- przy starcie ≤ 3 h (jazda z MyWhoosh przypięta w Wahoo do planu ma godzinę planu)
create or replace function private.rides_match(a_st timestamptz, a_mv integer, b_st timestamptz, b_mv integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select abs(extract(epoch from (a_st - b_st))) <= 600
      or (abs(extract(epoch from (a_st - b_st))) <= 3 * 3600
          and greatest(a_mv, b_mv) >= 600
          and abs(a_mv - b_mv) <= 0.02 * greatest(a_mv, b_mv))
$$;
revoke all on function private.rides_match(timestamptz, integer, timestamptz, integer) from public;

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
       -- jazda z innej aplikacji „tylko czas” ustępuje pasującemu plikowi FIT (ten liczy się z mocą i tętnem)
       and not (w.foreign_app_id is not null and not coalesce(w.has_streams, false)
                and exists (select 1 from public.fit_rides f
                             where f.user_id = p_user and f.date = p_date and f.deleted_at is null
                               and private.rides_match(w.starts, coalesce(w.moving_time_s, w.minutes_active * 60), f.start_at, f.moving_time_s)))
    union all
    -- plik z Bolta wgrany ręcznie to bliźniak kopii z Wahoo – liczy się raz; jak `sameRide`: start ≤ 10 min albo czas
    -- jazdy ±2 % i start ≤ 3 h (jazda z MyWhoosh przypięta w Wahoo do planu ma godzinę planu)
    select f.moving_time_s, f.distance_m, f.elevation_m, f.avg_hr, f.max_hr, f.avg_cadence, coalesce(f.name, 'trening'), f.start_at, 'fit'
      from public.fit_rides f
     where f.user_id = p_user and f.date = p_date and f.deleted_at is null
       and not exists (select 1 from public.wahoo_workouts w
                        where w.user_id = p_user and w.date = p_date and w.deleted_at is null
                          and (w.foreign_app_id is null or coalesce(w.has_streams, false))
                          and private.rides_match(w.starts, coalesce(w.moving_time_s, w.minutes_active * 60), f.start_at, f.moving_time_s))
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
