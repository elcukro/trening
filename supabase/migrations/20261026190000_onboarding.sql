-- Onboarding (docs/31): kim jest zawodnik i jaki ma cel – wejście przyszłego generatora planów.
-- Jeden wiersz na konto (`id` = wersja kwestionariusza, dziś 'v1'), klucz (user_id, id) jak gear_task_state.
-- `draft` to szkic w trakcie wypełniania (wznawianie na innym urządzeniu), `data` – profil po walidacji Zod
-- (`athleteProfileSchema` w src/engine/onboarding.ts). Zgoda na dane o zdrowiu (art. 9 RODO) ma własne kolumny,
-- żeby dało się ją sprawdzić i wycofać bez czytania JSON-a.
create table public.onboarding (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  status text not null default 'draft' check (status in ('draft', 'done', 'legacy')),
  step text,
  draft jsonb,
  data jsonb,
  schema_version integer not null default 1,
  consent_health_at timestamptz,
  consent_version text,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (status <> 'done' or (jsonb_typeof(data) = 'object' and consent_health_at is not null))
);
create index onboarding_user_sync_idx on public.onboarding (user_id, server_updated_at);
create trigger lww_guard before insert or update on public.onboarding for each row execute function private.lww_guard();
alter table public.onboarding enable row level security;
create policy "onboarding: all own" on public.onboarding for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.onboarding from anon;

-- Istniejące konta nie przechodzą onboardingu z automatu (wejście „Uzupełnij swoje potrzeby” w Ja zostaje).
insert into public.onboarding (id, user_id, status, completed_at)
select 'v1', u.id, 'legacy', now() from auth.users u
on conflict (user_id, id) do nothing;
