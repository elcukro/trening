-- Tytuł i opis jazdy pisane na Stravie po imporcie (docs/20 § Tytuł na Stravie).
alter table public.profiles add column if not exists strava_write boolean not null default false;
alter table public.strava_activities add column if not exists title_set_at timestamptz;
