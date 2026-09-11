-- Trening – schemat bazy (Etap 2)
-- Wszystkie tabele użytkownika: RLS user_id = auth.uid(); identyfikatory UUID generowane po stronie klienta (offline),
-- konflikty rozstrzygane „ostatni zapis wygrywa” po `updated_at` (zegar klienta), synchronizacja przyrostowa po `server_updated_at`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- schemat prywatny (nie wystawiany przez Data API)
create schema if not exists private;
revoke all on schema private from public;

-- lista dozwolonych adresów e-mail (wpisz swój adres po wdrożeniu: insert into private.allowed_emails values ('…'))
create table if not exists private.allowed_emails (
  email text primary key check (email = lower(email))
);

-- trigger na auth.users: blokuje rejestrację adresów spoza listy
create or replace function private.check_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'Adres e-mail % nie ma dostępu do tej aplikacji', new.email
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.check_allowed_email() from public;

drop trigger if exists check_allowed_email on auth.users;
create trigger check_allowed_email
  before insert on auth.users
  for each row execute function private.check_allowed_email();

-- „ostatni zapis wygrywa”: odrzuć aktualizację starszą niż istniejący rekord; stempluj czas serwera
create or replace function private.lww_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- starszy zapis – ignoruj (upsert zwróci 0 wierszy, klient traktuje jako sukces)
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- tabele użytkownika
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  name text,
  weight_start_kg numeric(5, 1),
  weight_target_kg numeric(5, 1),
  bike_kit_kg numeric(4, 1),
  lthr_bpm smallint,
  hr_max_bpm smallint,
  ftp_w smallint,
  ftp_goal_w smallint,
  tdee_kcal smallint,
  program_start date,
  trip_start date,
  gym_days jsonb,
  volume_scale numeric(3, 2),
  program_version text,
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table public.plan_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  kind text not null check (kind in ('swap', 'move', 'skip', 'indoor', 'sick', 'downgrade')),
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index plan_overrides_user_date_idx on public.plan_overrides (user_id, date);

create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  kind text not null check (kind in ('bike', 'gym', 'test')),
  planned_workout_id text,
  status text not null check (status in ('planned', 'in_progress', 'done', 'modified', 'skipped')),
  rpe smallint check (rpe between 1 and 10),
  duration_min integer,
  distance_km numeric(6, 1),
  elevation_m integer,
  avg_hr smallint,
  max_hr smallint,
  avg_cadence smallint,
  avg_speed_kmh numeric(4, 1),
  bike text,
  strava_activity_id bigint,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  unique (user_id, strava_activity_id)
);
create index session_logs_user_date_idx on public.session_logs (user_id, date);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  session_log_id uuid not null references public.session_logs (id) on delete cascade,
  exercise_id text not null,
  set_no smallint not null,
  weight_kg numeric(5, 1),
  reps smallint,
  rir smallint,
  is_warmup boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index set_logs_user_session_idx on public.set_logs (user_id, session_log_id);
create index set_logs_user_exercise_idx on public.set_logs (user_id, exercise_id);

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  protocol text not null check (protocol in ('TEST_LTHR', 'WATTBIKE_TEST')),
  lthr_bpm smallint,
  avg_hr smallint,
  avg_power_w smallint,
  ftp_w smallint,
  avg_speed_kmh numeric(4, 1),
  distance_km numeric(5, 2),
  route text,
  bike text,
  temp_c numeric(4, 1),
  wind text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index test_results_user_date_idx on public.test_results (user_id, date);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  weight_kg numeric(5, 1),
  resting_hr smallint,
  sleep smallint check (sleep between 1 and 5),
  legs smallint check (legs between 1 and 5),
  motivation smallint check (motivation between 1 and 5),
  sick boolean not null default false,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.gear_task_state (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  task_id text not null,
  status text not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  done_at date,
  notes text,
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create table public.service_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  bike text not null,
  km integer,
  description text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index service_log_user_date_idx on public.service_log (user_id, date);

create table public.packing_state (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  trip_key text not null,
  item_key text not null,
  checked boolean not null default false,
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, trip_key, item_key)
);

-- ---------------------------------------------------------------- tylko serwer (Edge Functions, service role)
create table public.integration_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('strava', 'wahoo')),
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scope text,
  athlete_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table public.wahoo_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  workout_id text not null,
  wahoo_plan_id bigint,
  wahoo_workout_id bigint,
  status text not null check (status in ('pending', 'created', 'updated', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wahoo_pushes_user_date_idx on public.wahoo_pushes (user_id, date);

-- ---------------------------------------------------------------- triggery LWW
do $$
declare t text;
begin
  foreach t in array array['profiles', 'plan_overrides', 'session_logs', 'set_logs', 'test_results', 'checkins', 'gear_task_state', 'service_log', 'packing_state']
  loop
    execute format('create trigger lww_guard before insert or update on public.%I for each row execute function private.lww_guard()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['profiles', 'plan_overrides', 'session_logs', 'set_logs', 'test_results', 'checkins', 'gear_task_state', 'service_log', 'packing_state']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: select own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: insert own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: update own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: delete own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- tokeny integracji: RLS bez żadnych polityk dla klienta → dostęp tylko z service_role (Edge Functions)
alter table public.integration_tokens enable row level security;
revoke all on public.integration_tokens from anon, authenticated;

-- wysyłki Wahoo: klient tylko czyta status
alter table public.wahoo_pushes enable row level security;
create policy "wahoo_pushes: select own" on public.wahoo_pushes for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.wahoo_pushes from anon, authenticated;

-- anon nie ma nic do roboty w tych tabelach
revoke all on all tables in schema public from anon;
