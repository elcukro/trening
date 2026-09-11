-- Etap 5: sprzęt i wyjazd. Klucze deterministyczne (task_id / trip:item), żeby zapis z dwóch urządzeń
-- trafiał w ten sam wiersz zamiast tworzyć duplikat.

alter table public.gear_task_state drop constraint if exists gear_task_state_pkey;
alter table public.gear_task_state add column if not exists id text;
update public.gear_task_state set id = task_id where id is null;
alter table public.gear_task_state alter column id set not null;
alter table public.gear_task_state add primary key (id);
alter table public.gear_task_state add column if not exists deleted_at timestamptz;
create unique index if not exists gear_task_state_user_task_key on public.gear_task_state (user_id, task_id);

alter table public.packing_state drop constraint if exists packing_state_pkey;
alter table public.packing_state add column if not exists id text;
update public.packing_state set id = trip_key || ':' || item_key where id is null;
alter table public.packing_state alter column id set not null;
alter table public.packing_state add primary key (id);
alter table public.packing_state add column if not exists deleted_at timestamptz;
create unique index if not exists packing_state_user_item_key on public.packing_state (user_id, trip_key, item_key);
