-- Etap 5: powiadomienia Web Push (iOS 16.4+ dla aplikacji z ekranu początkowego).

create table public.push_subscriptions (
  id text primary key,                       -- skrót endpointu: jedna subskrypcja na urządzenie
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  label text,                                -- np. „iPhone”
  last_ok_at timestamptz,
  last_error text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create trigger lww_guard before insert or update on public.push_subscriptions for each row execute function private.lww_guard();

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: select own" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions: insert own" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: update own" on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: delete own" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_subscriptions from anon;

-- ustawienia powiadomień w profilu: godziny i przełączniki
alter table public.profiles add column if not exists push_morning_hour smallint default 7;
alter table public.profiles add column if not exists push_evening_hour smallint default 20;
alter table public.profiles add column if not exists push_enabled boolean default true;

-- dziennik wysyłek – zapobiega dublowaniu przy ponownym uruchomieniu zadania
create table public.push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('morning', 'evening', 'event')),
  date date not null,
  sent_at timestamptz not null default now(),
  ok integer not null default 0,
  failed integer not null default 0,
  detail text,
  unique (user_id, kind, date)
);
alter table public.push_log enable row level security;
create policy "push_log: select own" on public.push_log for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.push_log from anon, authenticated;
