# CLAUDE.md – projekt „Trening”

Osobisty asystent treningowy (PWA na iPhone) dla jednego użytkownika przygotowującego się do wyjazdu rowerowego w Alpy (wrzesień 2027).

## Najważniejsze zasady
- **Najpierw przeczytaj** `README.md`, potem `docs/07-specyfikacja-aplikacji.md`, `docs/01-zasady-treningu.md` i przejrzyj `data/program.json`. Otwarte pytania i podjęte decyzje: `docs/OPEN_QUESTIONS.md`.
- **Treść planu pochodzi z `data/`** – nie hardkoduj treningów, ćwiczeń ani dat w komponentach. Zmiana planu = zmiana generatora `data/reference_generator.py` → `npm run data:generate` (regeneruje `program.json` i `calendar.json`) + podbicie `PROGRAM_VERSION`.
- Silnik planu (`src/engine/`) to czysty TypeScript bez zależności od UI; dla ustawień domyślnych musi zwracać dokładnie to, co `data/calendar.json` (test golden `src/engine/__tests__/golden.test.ts`). Preskrypcje siłowe są w `program.json → gym_prescriptions` (slot `wed` = Sesja A/C/core, `fri` = Sesja B).
- Silnik operuje na datach ISO (łańcuchy), bez obiektów Date ze strefą. „Dziś” w `Europe/Warsaw` liczy `src/lib/dates.ts`; parametr `?today=YYYY-MM-DD` w URL nadpisuje datę (testy, podgląd).
- UI po polsku, tygodnie od poniedziałku, jednostki metryczne, przecinek dziesiętny (`src/lib/format.ts`), mobile-first (iPhone, safe areas, elementy ≥ 44 pt), tryb jasny i ciemny (`prefers-color-scheme`).
- Sekrety (Strava, Wahoo, Supabase service role) wyłącznie po stronie serwera (Supabase Edge Functions). Nigdy nie commituj `.env`. Klucze Wahoo użytkownik ma w `~/code/wahoo-routes/.env` – nie kopiuj ich do repozytorium, poproś o wpisanie do sekretów Supabase.
- Offline-first: ekran Dziś, Tydzień, Biblioteka i tryb siłowni muszą działać bez sieci (program w bundle'u, Workbox precache, Dexie).
- Aplikacja nie jest narzędziem medycznym – komunikaty o żywieniu i chorobie mają charakter ogólny.

## Komendy
- `npm run dev` – serwer deweloperski (Vite)
- `npm run test` – Vitest (silnik planu; `npm run test:coverage` – próg 90% dla `src/engine`)
- `npm run lint` – oxlint (zamiast ESLint – domyślny linter szablonu Vite 8)
- `npm run typecheck` – `tsc -b` (TypeScript strict, `noUncheckedIndexedAccess`)
- `npm run build` – build produkcyjny PWA (`dist/`, service worker Workbox)
- `npm run e2e` – Playwright, Chromium z viewportem iPhone 14 (buduje i uruchamia `vite preview` na porcie 4173); zrzuty w `test-results/`
- `npm run data:generate` – `python3 data/reference_generator.py`
- `node scripts/icons.mjs` – regeneracja ikon PNG z `public/icon.svg`

## Struktura
```
data/                 program.json (źródło prawdy), calendar.json (golden), generator, sprzęt, checklista
docs/                 dokumentacja 00–07 + OPEN_QUESTIONS.md
src/engine/           silnik: schema.ts (Zod), dates.ts, layout.ts (R14), calendar.ts (dni, R16, tabela sezonu),
                      zones.ts (strefy, resolveWorkout), nutrition.ts, load.ts (R8, e1RM), climb.ts, plan.ts (DayPlan dla UI)
src/engine/__tests__/ golden.test.ts, scenarios.test.ts (scenariusze §10 specyfikacji)
src/data/             program.ts (import + walidacja Zod), rules.ts (zasady R1–R16 dla ludzi)
src/db/               Dexie (IndexedDB): settings, kv – etap 2 doda logi/serie/check-iny/outbox
src/app/              App.tsx (router, dolna nawigacja), useSettings.ts (ustawienia + kontekst silnika)
src/features/         today, week, season, library, settings, more (ekrany)
src/components/       ui.tsx (Card, Badge, Button…), StepTimeline.tsx (oś czasu stref)
src/lib/              dates.ts (Europe/Warsaw, formaty pl), format.ts, labels.ts, zones.ts (kolory)
e2e/                  Playwright smoke (viewport iPhone)
public/               ikony PWA
```

## Stan etapów
- Etap 1 (plan offline): gotowy – silnik + testy golden, ekrany Dziś / Tydzień / Sezon / Biblioteka / Ustawienia, PWA.
- Etap 2 (logi, Supabase, tryb siłowni, Postęp): do zrobienia. Model danych w `docs/07` §6; dozwolony e-mail: w sekretach Supabase (`ALLOWED_EMAIL`), nie w repo.
- Etapy 3–5 (Strava, Wahoo, adaptacja R1–R15 w UI, sprzęt, wyjazd, push): później. Typ `PlanOverride` w `src/engine/types.ts` jest już przygotowany.
