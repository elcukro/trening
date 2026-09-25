-- Decoupling v1, krok 4 (docs/18): rowery są danymi użytkownika, a klucze stanu zadań i checklisty – per użytkownik.

-- 1. Deterministyczne klucze (`task_id`, `trip:item`) były kluczem głównym całej tabeli, więc drugie konto
--    odhaczające to samo zadanie trafiało w cudzy wiersz (upsert → update → odrzucony przez RLS).
--    Klucz główny obejmuje teraz użytkownika.
alter table public.gear_task_state drop constraint if exists gear_task_state_pkey;
alter table public.gear_task_state add primary key (user_id, id);

alter table public.packing_state drop constraint if exists packing_state_pkey;
alter table public.packing_state add primary key (user_id, id);

-- 2. Rowery użytkownika. Zadania serwisowe powstają z szablonu (data/gear_templates.json) wg typu i hamulców.
create table public.bikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  kind text not null default 'road' check (kind in ('road', 'gravel', 'mtb', 'tt', 'other')),
  brakes text not null default 'disc' check (brakes in ('disc', 'rim')),
  role text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index bikes_user_idx on public.bikes (user_id);
create trigger lww_guard before insert or update on public.bikes for each row execute function private.lww_guard();
alter table public.bikes enable row level security;
create policy "bikes: all own" on public.bikes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.bikes from anon;

-- `service_log.bike` od teraz trzyma `bikes.id` (tekst, bo starsze wpisy mogły mieć nazwę roweru)
