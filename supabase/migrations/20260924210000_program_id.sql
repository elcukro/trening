-- Program treningowy per konto: od 24.09.2026 aplikacja ma więcej niż jeden program
-- (alpejski dla pierwszego konta, „FTP 300” dla drugiego). Bez tej kolumny wybór programu
-- nie przenosi się między urządzeniami tego samego użytkownika.
alter table public.profiles add column if not exists program_id text;
