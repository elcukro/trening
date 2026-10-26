-- Dietetyk: pełna data urodzenia zamiast samego roku (wiek do budżetu kcal liczony co do dnia; wybór z kalendarza w /m).
-- `birth_year` zostaje – aplikacja zapisuje go razem z datą, a starsze urządzenia nadal go czytają.
alter table public.profiles add column if not exists birth_date date check (birth_date between '1920-01-01' and '2015-12-31');
