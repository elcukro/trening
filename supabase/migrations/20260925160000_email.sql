-- Maile treningowe (docs/19): poranna odprawa o 7:00 w dni z treningiem i podsumowanie zaraz po imporcie jazdy.

-- Migawki dni liczone przez aplikację (serwer nie ma silnika planu): plan, progi, strefy, poranna odprawa.
create table public.email_days (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.email_days enable row level security;
create policy "email_days: all own" on public.email_days for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.email_days from anon;

-- Dziennik wysyłek: jeden mail danego rodzaju na dzień (poranek) albo na jazdę (podsumowanie).
create table public.email_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('morning', 'workout')),
  ref text not null,
  resend_id text,
  error text,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.email_log enable row level security;
create policy "email_log: select own" on public.email_log for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.email_log from anon, authenticated;

-- Ustawienia per konto (synchronizowane jak reszta profilu). Domyślnie wyłączone – każdy włącza sam.
alter table public.profiles add column if not exists email_morning boolean not null default false;
alter table public.profiles add column if not exists email_workout boolean not null default false;
alter table public.profiles add column if not exists email_hour smallint not null default 7 check (email_hour between 4 and 11);

-- Co godzinę: funkcja sama sprawdza godzinę w Europe/Warsaw i wysyła tym, którym wypada (email_hour).
create or replace function private.send_email_cron()
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
    raise notice 'brak sekretu push_cron_secret w vault – pomijam maile';
    return;
  end if;
  perform net.http_post(
    url := 'https://kgllegvlnmchdvkkbitt.supabase.co/functions/v1/email-send',
    headers := jsonb_build_object('content-type', 'application/json'),
    body := jsonb_build_object('action', 'cron', 'secret', key),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function private.send_email_cron() from public;
select cron.schedule('trening-email-rano', '0 * * * *', $$select private.send_email_cron()$$);
