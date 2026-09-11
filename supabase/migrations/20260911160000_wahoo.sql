-- Etap 4: Wahoo. Jedna wysyłka na dzień – ponowne wysłanie aktualizuje plan i trening zamiast tworzyć duplikat.

alter table public.wahoo_pushes add column if not exists external_id text;
alter table public.wahoo_pushes add column if not exists name text;
alter table public.wahoo_pushes add column if not exists minutes integer;

-- porządek przed nałożeniem unikalności (gdyby były duplikaty z testów)
delete from public.wahoo_pushes a
 using public.wahoo_pushes b
 where a.user_id = b.user_id and a.date = b.date and a.created_at < b.created_at;

create unique index if not exists wahoo_pushes_user_date_key on public.wahoo_pushes (user_id, date);
