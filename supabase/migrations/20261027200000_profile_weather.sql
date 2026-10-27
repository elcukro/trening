-- Miejscowość prognozy i godziny jazdy należą do konta, nie do urządzenia (docs/35): do 27.10.2026 leżały w `kv`
-- przeglądarki/telefonu i nie wracały po zalogowaniu na nowym urządzeniu. Scalane per pole jak reszta profilu
-- (`profiles_merge` działa na wszystkich kolumnach, aplikacja – `PROFILE_MAP`).
alter table public.profiles add column if not exists weather_location jsonb
  check (weather_location is null or (jsonb_typeof(weather_location) = 'object' and weather_location ? 'lat' and weather_location ? 'lon'));
alter table public.profiles add column if not exists ride_hours jsonb
  check (ride_hours is null or jsonb_typeof(ride_hours) = 'object');
