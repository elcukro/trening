-- Zadanie cykliczne uwierzytelnia się własnym sekretem (PUSH_CRON_SECRET), nie kluczem usługowym.
-- Wartość trzymana w vault pod nazwą `push_cron_secret`; ten sam ciąg jest sekretem Edge Function.

create or replace function private.send_push(p_kind text)
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
    raise notice 'brak sekretu push_cron_secret w vault – pomijam wysyłkę';
    return;
  end if;
  perform net.http_post(
    url := 'https://kgllegvlnmchdvkkbitt.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object('content-type', 'application/json'),
    body := jsonb_build_object('action', 'run', 'kind', p_kind, 'secret', key),
    timeout_milliseconds := 20000
  );
end;
$$;
revoke all on function private.send_push(text) from public;
