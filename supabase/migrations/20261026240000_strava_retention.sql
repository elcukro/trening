-- docs/33 § 5: dane ze Stravy żyją 7 dni od pobrania (polityka API § 6.2 i § 5.5 – także dane pochodne).
-- Usunięcie aktywności odpala trigger dnia: log przechodzi na kopię z Wahoo albo traci metryki (zostaje RPE zawodnika).
-- Czyszczenie co godzinę jest włączane flagą `strava_purge` – pierwsze uruchomienie dopiero po sprawdzeniu historii Wahoo
-- (decyzja użytkownika 26.10.2026): insert into private.app_flags (key, value) values ('strava_purge', 'on');

create table if not exists private.app_flags (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.app_flags from public;

-- p_user null = wszyscy; p_force = bez flagi i bez progu 7 dni (rozłączenie Stravy, deautoryzacja – polityka § 7.4)
create or replace function private.purge_strava(p_user uuid default null, p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not p_force and coalesce((select value from private.app_flags where key = 'strava_purge'), 'off') <> 'on' then
    return 0;
  end if;
  delete from public.strava_activities
   where (p_user is null or user_id = p_user)
     and (p_force or fetched_at < now() - interval '7 days');
  get diagnostics n = row_count;
  -- klucz maila po jeździe ze Stravy to id aktywności – po 7 dniach niepotrzebny do odsiewania duplikatów
  delete from public.email_log
   where kind = 'workout' and ref ~ '^[0-9]+$'
     and (p_user is null or user_id = p_user)
     and (p_force or sent_at < now() - interval '7 days');
  return n;
end;
$$;
revoke all on function private.purge_strava(uuid, boolean) from public;

-- wywołanie z Edge Function (service role) przy rozłączeniu albo deautoryzacji
create or replace function public.purge_strava_user(p_user uuid)
returns integer
language sql
security definer
set search_path = ''
as $$ select private.purge_strava(p_user, true) $$;
revoke all on function public.purge_strava_user(uuid) from public, anon, authenticated;
grant execute on function public.purge_strava_user(uuid) to service_role;

select cron.schedule('trening-strava-purge', '17 * * * *', $$select private.purge_strava()$$);

