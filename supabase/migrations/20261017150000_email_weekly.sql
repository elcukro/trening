-- Niedzielny list trenera (docs/19 § List tygodnia): przełącznik profilu i nowy rodzaj wpisu w email_log.
alter table public.profiles add column if not exists email_weekly boolean not null default false;
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind in ('morning', 'workout', 'weekly'));
