-- Apple Health w check-inie (docs/27 § 2): HRV z nocy i sen w minutach obok subiektywnej oceny snu 1–5,
-- `field_sources` mówi, które pola przyszły ze Zdrowia ({"weight_kg":"health",…}) – wpis ręczny zawsze wygrywa.
-- Kolumny są opcjonalne: starsze wersje aplikacji wysyłają check-in bez nich i nic nie nadpisują.
alter table public.checkins add column if not exists hrv_ms smallint check (hrv_ms between 1 and 400);
alter table public.checkins add column if not exists sleep_min smallint check (sleep_min between 0 and 1440);
alter table public.checkins add column if not exists field_sources jsonb;
