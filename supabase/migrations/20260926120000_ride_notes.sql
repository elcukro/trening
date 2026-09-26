-- Notatki trenera po jeździe (docs/20): tekst przy jeździe (synchronizowany do aplikacji jak reszta kolumn)
-- i fakty, z których powstał – do porównań z kolejnym wykonaniem tego samego treningu.
alter table public.strava_activities add column if not exists note text;
alter table public.strava_activities add column if not exists note_source text check (note_source in ('ai', 'rules'));
alter table public.strava_activities add column if not exists note_at timestamptz;
alter table public.strava_activities add column if not exists note_facts jsonb;

-- Dziennik wywołań modelu: miesięczny limit (AI_MONTHLY_LIMIT, domyślnie 300) i podgląd kosztu w tokenach.
create table public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_id bigint,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_calls_created_idx on public.ai_calls (created_at);
alter table public.ai_calls enable row level security;
create policy "ai_calls: select own" on public.ai_calls for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.ai_calls from anon, authenticated;
