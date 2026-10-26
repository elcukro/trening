-- docs/33 § 5 (dopisane po wgraniu 20261026240000):
-- aplikacja sprząta swoją kopię (Dexie) tylko wtedy, gdy czyszczenie na serwerze jest włączone – jeden przełącznik
create or replace function public.strava_purge_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select value = 'on' from private.app_flags where key = 'strava_purge'), false) $$;
revoke all on function public.strava_purge_enabled() from public, anon;
grant execute on function public.strava_purge_enabled() to authenticated;
