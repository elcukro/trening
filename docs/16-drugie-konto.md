# 16. Drugie konto (Ferdynand) – przygotowanie i przebieg

Stan na 24.09.2026. Aplikacja **jest wielokontowa** w warstwie danych, logowania, integracji i powiadomień –
nie trzeba nic przebudowywać, żeby dołożyć drugą osobę. Jedyne, czego nie da się dziś rozdzielić, to **treść
programu treningowego** (patrz § Otwarta kwestia).

## Co już działa dla wielu kont (sprawdzone w kodzie i w bazie)

| Obszar | Stan |
|---|---|
| RLS | Wszystkie 17 tabel w `public` ma RLS włączony, polityki `user_id = auth.uid()`. |
| Rejestracja | Trigger `check_allowed_email` na `auth.users` przepuszcza tylko adresy z `private.allowed_emails`. |
| Strava | Webhook mapuje `owner_id` → `user_id` przez `integration_tokens.athlete_id` (`userIdForAthlete`), więc jedna subskrypcja obsługuje obu. |
| Wahoo | Tokeny i `wahoo_pushes` per użytkownik; wysyłkę inicjuje klient swoim JWT. |
| Powiadomienia | `push-send` iteruje `profiles` z `push_enabled`, `push_log` i subskrypcje są per użytkownik. |
| Profil | `profiles` zakłada się sam przy pierwszej synchronizacji (`syncProfile`). |
| Kod | Brak zaszytego `user_id` ani adresu e-mail (sprawdzone `grep` po repo). |

## Przygotowanie (przed przyjazdem)

1. **Dopisz adres do listy dozwolonych** – bez tego konto się nie utworzy:
   ```sql
   insert into private.allowed_emails (email) values ('adres@example.com')
   on conflict do nothing;
   ```
2. **Utwórz użytkownika w panelu Supabase**: Authentication → Users → **Add user** → e-mail + „Auto Confirm".
   Rejestracja w projekcie jest **wyłączona** (`signup_disabled`), więc samo wpisanie adresu w aplikacji nie
   założy konta. Panel omija tę blokadę, a trigger z punktu 1 i tak pilnuje listy.
   *Wariant alternatywny:* włączyć rejestrację na chwilę w panelu (Authentication → Sign In / Providers),
   pozwolić mu się zalogować i wyłączyć z powrotem. Nie używać do tego `supabase config push` – plik
   `supabase/config.toml` w repo to pełny szablon i nadpisałby hostowane ustawienia.
3. **Sprawdź budżet Wahoo** – sandbox ma 25 zapytań / 5 min, 100 / h, 250 / dzień **na całą aplikację**,
   wspólnie dla obu kont. Wysyłka tygodnia to ~13 zapytań, więc spokojnie wystarczy; nie debugować obu
   kont naraz.

## Przebieg wieczorem (15–20 minut)

1. **Logowanie** – otwiera `https://trening-inky.vercel.app`, wpisuje swój adres, dostaje kod z maila, wpisuje kod.
2. **Ekran początkowy** – na iPhonie: Udostępnij → „Dodaj do ekranu początkowego". Bez tego nie zadziałają
   powiadomienia (iOS wymaga trybu standalone).
3. **Jego liczby** – Więcej → Progi: FTP, tętno progowe, „Mam miernik mocy". Waga docelowa i daty programu
   w pełnej aplikacji (Ustawienia).
4. **Strava** – Ustawienia → Integracje → „Połącz ze Stravą", potem „Pobierz ostatnie 14 dni”.
   Jedna subskrypcja webhooka obsłuży obu; nic po stronie Stravy nie trzeba dokładać.
5. **Wahoo** – Ustawienia → Integracje → „Połącz z Wahoo". **To jest jedyny punkt z realnym ryzykiem**:
   jeśli aplikacja Wahoo w portalu jest ograniczona do konta właściciela, autoryzacja się nie uda.
   Test jest tani – jedno kliknięcie. Jeśli odmówi, zostaje Strava i ręczne wpisywanie treningów,
   a dostęp produkcyjny w portalu Wahoo załatwia się osobno.
6. **Powiadomienia** – Więcej → Powiadomienia (przełącznik). Cron wyśle mu je tak samo jak Łukaszowi.

## Otwarta kwestia: program treningowy

`data/program.json` jest **jeden i wbudowany w aplikację** – 53 tygodnie pod Alpy 2027 z celami Łukasza.
Ustawienia per konto zmieniają tylko: daty (`program_start`, `trip_start`), `volume_scale` (0,7–1,0),
dni siłowni, wagi oraz FTP/LTHR (czyli wszystkie cele w watach i bpm są już jego). **Struktura tygodni,
fazy i rodzaje treningów są wspólne.**

Do wyboru:

- **A. Wieczorem, bez kodu** – Ferdynand dostaje ten sam program z własnymi datami i własnymi progami.
  Sensowne, jeśli jego cel jest podobny (baza + FTP). Zero ryzyka, działa od razu.
- **B. Osobny program per konto** – `program_id` w ustawieniach, kilka plików `data/program-*.json`,
  `loadProgram(id)`, generator sparametryzowany celem, testy golden per program. To realna funkcja,
  nie poprawka – kilka godzin pracy, do zrobienia po ustaleniu, czego on właściwie chce.

Rekomendacja: wieczorem wariant A plus rozmowa o celu; wariant B dopiero, gdy będzie wiadomo,
czy jego plan faktycznie musi się różnić strukturą, a nie tylko objętością i datami.
