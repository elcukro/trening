-- 30.09.2026: siłownia jako ustawienie profilu – false = sesje z programu nie trafiają do kalendarza.
-- Brak wartości (null) = domyślne ustawienie programu (alpejski: wyłączona, FTP 300: włączona).
alter table public.profiles add column if not exists gym_enabled boolean;
