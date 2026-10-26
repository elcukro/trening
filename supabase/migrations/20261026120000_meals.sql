-- Dietetyk Beta 1 (docs/25 § 4.1): posiłki ze zdjęcia, etykiety albo wpisane ręcznie. Zdjęć nie przechowujemy – tylko wynik.
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  time text,
  name text not null,
  kcal integer not null check (kcal between 0 and 5000),
  protein_g integer not null default 0,
  carbs_g integer,
  fat_g integer,
  items jsonb not null default '[]'::jsonb,
  source text not null default 'photo' check (source in ('photo', 'label', 'text', 'manual')),
  confidence numeric,
  portion_factor numeric not null default 1,
  label jsonb,
  amount numeric,
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index meals_user_date_idx on public.meals (user_id, date);
create trigger lww_guard before insert or update on public.meals for each row execute function private.lww_guard();
alter table public.meals enable row level security;
create policy "meals: all own" on public.meals for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.meals from anon;

-- Profil: dane do budżetu kcal (Mifflin-St Jeor) i przełącznik funkcji – domyślnie wyłączony (null = wyłączony).
alter table public.profiles add column if not exists height_cm integer check (height_cm between 120 and 230);
alter table public.profiles add column if not exists birth_year integer check (birth_year between 1920 and 2020);
alter table public.profiles add column if not exists diet_enabled boolean;
