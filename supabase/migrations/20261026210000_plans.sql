-- Plany z generatora (docs/32 § 7): jeden aktywny wiersz na konto (`id` = 'current'), klucz (user_id, id) jak onboarding.
-- Przechowujemy PARAMETRY generatora, nie gotowy program: `inputs` (`PlanInputs` z src/engine/onboarding.ts),
-- `extras` (masa, HRmax, najdłuższa jazda), wersję generatora i datę, dla której plan policzono. Aplikacja regeneruje
-- program deterministycznie z tych pól (kilka ms), więc wiersz jest mały, działa offline, a nowa wersja generatora
-- nie zmienia planu po cichu – `generator_version` mówi, czym plan był liczony.
create table public.plans (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  inputs jsonb not null,
  extras jsonb not null,
  generator_version text not null,
  -- poniedziałek tygodnia 0 (liczony przez generator z `generated_for`)
  program_start date not null,
  -- „dziś” użyte przy generowaniu – ten sam dzień daje ten sam plan
  generated_for date not null,
  source text not null default 'onboarding' check (source in ('onboarding', 'change', 'coach')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (jsonb_typeof(inputs) = 'object' and jsonb_typeof(extras) = 'object')
);
create index plans_user_sync_idx on public.plans (user_id, server_updated_at);
create trigger lww_guard before insert or update on public.plans for each row execute function private.lww_guard();
alter table public.plans enable row level security;
create policy "plans: all own" on public.plans for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.plans from anon;
