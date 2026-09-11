-- Zapisujemy, którym sposobem plik planu został przyjęty przez Wahoo (diagnostyka formatu).
alter table public.wahoo_pushes add column if not exists variant text;
