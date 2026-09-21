-- Pkt 0 + 1 planu usprawnień (docs/14): strumienie ze Stravy, metryki jazdy, punkt wyjścia.

-- ---------------------------------------------------------------- metryki jazdy liczone przy imporcie (funkcja _shared/metrics.ts)
alter table public.strava_activities
  add column if not exists device_watts boolean not null default false,   -- moc z miernika (nie szacunek Stravy)
  add column if not exists np_w smallint,                                  -- Normalized Power
  add column if not exists mmp_w jsonb,                                    -- najlepsze średnie mocy: {"5":…, "60":…, "300":…, "1200":…, "3600":…}
  add column if not exists best_speed_kmh jsonb,                           -- najlepsze średnie prędkości (km/h): {"300":…, "1200":…, "3600":…}
  add column if not exists decoupling_pct numeric(5, 1),                   -- rozprzężenie Pw:HR (%), null bez mocy+tętna
  add column if not exists has_streams boolean not null default false;

-- ---------------------------------------------------------------- strumienie (próbki co 5 s) – tylko do odczytu przez klienta, na żądanie
create table public.strava_streams (
  activity_id bigint primary key references public.strava_activities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dt smallint not null default 5,
  n integer not null,
  samples jsonb not null,                        -- { hr: [...], watts: [...], cadence: [...], speed: [...], distance: [...], altitude: [...], moving: [...] }
  updated_at timestamptz not null default now()
);
create index strava_streams_user_idx on public.strava_streams (user_id);
alter table public.strava_streams enable row level security;
create policy "strava_streams: select own" on public.strava_streams for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.strava_streams from anon;

-- ---------------------------------------------------------------- punkt wyjścia: pomiary bazowe i ich kolejne odczyty
create table public.baseline_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  metric text not null check (metric in ('ftp_w', 'lthr_bpm', 'hr_max_bpm', 'weight_kg', 'resting_hr', 'best20_kmh', 'best60_kmh', 'mmp20_w', 'mmp60_w', 'ref_speed_kmh', 'ref_power_w', 'decoupling_pct', 'cadence_rpm')),
  value numeric(8, 2) not null,
  source text not null default 'manual' check (source in ('manual', 'test', 'checkin', 'strava')),
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index baseline_entries_user_metric_idx on public.baseline_entries (user_id, metric, date);
create trigger lww_guard before insert or update on public.baseline_entries for each row execute function private.lww_guard();
alter table public.baseline_entries enable row level security;
create policy "baseline_entries: all own" on public.baseline_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.baseline_entries from anon;
