# CLAUDE.md – projekt „Trening”

Osobisty asystent treningowy (PWA na iPhone) dla jednego użytkownika przygotowującego się do wyjazdu rowerowego w Alpy (wrzesień 2027).

## Najważniejsze zasady
- **Najpierw przeczytaj** `README.md`, potem `docs/07-specyfikacja-aplikacji.md`, `docs/01-zasady-treningu.md` i przejrzyj `data/program.json`.
- **Treść planu pochodzi z `data/`** – nie hardkoduj treningów, ćwiczeń ani dat w komponentach. Zmiana planu = zmiana `program.json` (i generatora) + podbicie `version`.
- Silnik planu (`src/engine/`) to czysty TypeScript; dla ustawień domyślnych musi zwracać dokładnie to, co `data/calendar.json` (test golden file).
- UI po polsku, tygodnie od poniedziałku, strefa `Europe/Warsaw`, jednostki metryczne, przecinek dziesiętny w wyświetlaniu.
- Sekrety (Strava, Wahoo, Supabase service role) wyłącznie po stronie serwera (Supabase Edge Functions). Nigdy nie commituj `.env`. Klucze Wahoo użytkownik ma w `~/code/wahoo-routes/.env` – nie kopiuj ich do repozytorium, poproś o wpisanie do sekretów Supabase.
- Offline-first: ekran Dziś, Tydzień, Biblioteka i tryb siłowni muszą działać bez sieci.
- Aplikacja nie jest narzędziem medycznym – komunikaty o żywieniu i chorobie mają charakter ogólny.

## Komendy (uzupełnij po inicjalizacji projektu)
- `npm run dev` – serwer deweloperski
- `npm run test` – Vitest (silnik planu, reguły)
- `npm run build` – build produkcyjny PWA
- `python3 data/reference_generator.py` – regeneracja danych referencyjnych
