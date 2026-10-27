-- Zdjęcie profilowe (ekran Ja): własne zdjęcie jako mały JPEG w data URL (240 px, kilkadziesiąt KB), albo 'none' = inicjały
-- zamiast zdjęcia z Google. Brak wartości = zdjęcie z konta Google (`user_metadata.avatar_url`), inaczej inicjały.
-- W profilu, nie w Storage: wraca z synchronizacją profilu i działa offline jak reszta ustawień.
alter table public.profiles add column if not exists avatar text
  check (avatar is null or avatar = 'none' or (avatar like 'data:image/jpeg;base64,%' and length(avatar) <= 120000));
