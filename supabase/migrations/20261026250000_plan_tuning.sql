-- docs/33 § 8.2: dopasowanie planu (szablon + parametry generatora) przy parametrach planu konta.
-- `tuning` przechodzi w aplikacji przez `clampTuning` przed każdym przeliczeniem – baza trzyma propozycję, nie gwarancję.
alter table public.plans add column if not exists tuning jsonb check (tuning is null or jsonb_typeof(tuning) = 'object');
alter table public.plans add column if not exists tuning_source text check (tuning_source in ('ai', 'rules', 'user'));
