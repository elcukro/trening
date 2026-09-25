-- Decoupling v1, krok 5 (docs/18): profil scalany per pole zamiast „ostatni zapis całego wiersza wygrywa”.
--
-- `field_updated_at` = { kolumna: znacznik zmiany }. Nowy klient wysyła tylko pola nowsze lokalnie, ze znacznikami.
-- Trigger na serwerze:
--   * pole ze znacznikiem starszym niż zapisany – zostaje stara wartość (wyścig dwóch urządzeń),
--   * pole zmienione BEZ znacznika (stary klient, SQL Editor, Edge Function) – dostaje znacznik now(),
--     więc ręczna poprawka w bazie dociera do urządzeń bez podbijania updated_at całego wiersza,
--   * updated_at wiersza nigdy się nie cofa (stare klienty dalej porównują wiersze).
-- Brak wpisu w `field_updated_at` = znacznik wiersza (dane sprzed tej migracji).

alter table public.profiles add column if not exists field_updated_at jsonb not null default '{}'::jsonb;

create or replace function private.profiles_merge()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  o jsonb;
  n jsonb;
  ofu jsonb;
  nfu jsonb;
  merged jsonb;
  col text;
  skip text[] := array['user_id', 'updated_at', 'server_updated_at', 'field_updated_at', 'program_version'];
begin
  if tg_op = 'INSERT' then
    new.field_updated_at := coalesce(new.field_updated_at, '{}'::jsonb);
    new.server_updated_at := now();
    return new;
  end if;

  o := to_jsonb(old);
  n := to_jsonb(new);
  ofu := coalesce(old.field_updated_at, '{}'::jsonb);
  nfu := coalesce(new.field_updated_at, '{}'::jsonb);
  merged := ofu;

  for col in select jsonb_object_keys(n) loop
    continue when col = any(skip);
    if nfu ? col and nfu->>col is distinct from ofu->>col then
      -- klient podał własny znacznik pola
      if (nfu->>col)::timestamptz < coalesce((ofu->>col)::timestamptz, old.updated_at) then
        n := jsonb_set(n, array[col], o->col);      -- starszy zapis tego pola – zostaje wartość z bazy
      else
        merged := jsonb_set(merged, array[col], nfu->col);
      end if;
    elsif (n->col) is distinct from (o->col) then
      -- zmiana bez znacznika: teraz
      merged := jsonb_set(merged, array[col], to_jsonb(now()));
    end if;
  end loop;

  n := jsonb_set(n, '{field_updated_at}', merged);
  n := jsonb_set(n, '{updated_at}', to_jsonb(greatest(old.updated_at, new.updated_at)));
  new := jsonb_populate_record(new, n);
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists lww_guard on public.profiles;
create trigger profiles_merge before insert or update on public.profiles for each row execute function private.profiles_merge();
