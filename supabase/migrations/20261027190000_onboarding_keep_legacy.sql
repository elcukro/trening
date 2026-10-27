-- Szkic kwestionariusza nie zamienia konta sprzed onboardingu („legacy”) w niedokończony onboarding (docs/31).
-- 26.10.2026 urządzenie bez pobranego wiersza `legacy` zapisało pusty szkic ze statusem „draft” i nowszym `updated_at`,
-- więc każde świeże urządzenie pokazywało głównemu kontu kwestionariusz. „legacy” zmienia tylko ukończenie („done”).

create or replace function private.onboarding_keep_legacy() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'draft' and old.status = 'legacy' then
    new.status := 'legacy';
  end if;
  return new;
end;
$$;

-- działa obok `lww_guard`: tamten decyduje, czy zapis przejdzie, ten tylko pilnuje statusu
create trigger onboarding_keep_legacy before update on public.onboarding
  for each row execute function private.onboarding_keep_legacy();
