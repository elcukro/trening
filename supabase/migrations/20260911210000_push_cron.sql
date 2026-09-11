-- Harmonogram powiadomień: rano plan dnia, wieczorem przypomnienie o odhaczeniu.
-- Godziny w UTC, bo pg_cron nie zna stref: 7:00 i 20:00 czasu warszawskiego to zimą 6:00/19:00,
-- latem 5:00/18:00. Zadanie odpala się o obu porach, a funkcja i tak wysyła najwyżej raz dziennie
-- (klucz w push_log), więc zmiana czasu nie gubi ani nie dubluje powiadomienia.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.send_push(p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  key text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if base is null or key is null then
    raise notice 'brak sekretów project_url / service_role_key w vault – pomijam';
    return;
  end if;
  perform net.http_post(
    url := base || '/functions/v1/push-send',
    headers := jsonb_build_object('content-type', 'application/json'),
    body := jsonb_build_object('action', 'run', 'kind', p_kind, 'secret', key),
    timeout_milliseconds := 20000
  );
end;
$$;
revoke all on function private.send_push(text) from public;

select cron.schedule('trening-push-rano-zima', '0 6 * * *', $$select private.send_push('morning')$$);
select cron.schedule('trening-push-rano-lato', '0 5 * * *', $$select private.send_push('morning')$$);
select cron.schedule('trening-push-wieczor-zima', '0 19 * * *', $$select private.send_push('evening')$$);
select cron.schedule('trening-push-wieczor-lato', '0 18 * * *', $$select private.send_push('evening')$$);
