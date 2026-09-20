-- Miernik mocy: przełącznik w profilu (cele mocy w planach Wahoo, waty na ekranie).
alter table public.profiles add column if not exists power_meter boolean default false;
