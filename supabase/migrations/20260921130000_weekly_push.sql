-- Pkt 5 (docs/14): przegląd tygodnia w niedzielę o 19:00 czasu warszawskiego (zimą 18:00 UTC, latem 17:00 UTC;
-- funkcja wysyła najwyżej raz dziennie per rodzaj, więc obie pory są bezpieczne).

alter table public.push_log drop constraint if exists push_log_kind_check;
alter table public.push_log add constraint push_log_kind_check check (kind in ('morning', 'evening', 'event', 'weekly'));

select cron.schedule('trening-push-tydzien-zima', '0 18 * * 0', $$select private.send_push('weekly')$$);
select cron.schedule('trening-push-tydzien-lato', '0 17 * * 0', $$select private.send_push('weekly')$$);
