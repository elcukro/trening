-- Języki (docs/34): wybór zawodnika i język faktycznie używany na urządzeniu.
-- `language` = 'system' | 'pl' | 'en' (wybór w Ustawieniach; null = jeszcze nie wybrano, czyli system).
-- `locale`   = 'pl' | 'en' – język, w którym aplikacja ostatnio się wyświetlała; z niego serwer pisze maile, push
--              i odpowiedzi AI (przy wyborze 'system' serwer nie zna języka telefonu).
alter table public.profiles add column if not exists language text check (language in ('system', 'pl', 'en'));
alter table public.profiles add column if not exists locale text check (locale in ('pl', 'en'));
