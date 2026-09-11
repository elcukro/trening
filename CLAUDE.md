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
- Projekt w chmurze: ref `kgllegvlnmchdvkkbitt` (podlinkowany), produkcja `https://trening-inky.vercel.app`. Ustawienia auth (site_url, redirecty) wypychane przez `supabase config push` z **minimalnego** config.toml zawierającego tylko `[auth]` (pełny plik z szablonu `init` nadpisałby ustawienia hostowane) – zawsze najpierw `supabase config diff`.
- `supabase db push` – wgranie migracji do podlinkowanego projektu (`supabase link --project-ref …`); `supabase migration new` może zawisnąć w tej sesji – twórz plik ręcznie z tym samym formatem nazwy

## Struktura
```
data/                 program.json (źródło prawdy), calendar.json (golden), generator, sprzęt, checklista
docs/                 dokumentacja 00–07 + OPEN_QUESTIONS.md
src/engine/           silnik: schema.ts (Zod), dates.ts, layout.ts (R14), calendar.ts (dni, R16, tabela sezonu),
                      zones.ts (strefy, resolveWorkout), nutrition.ts, load.ts (R8, e1RM), climb.ts, progress.ts (R11 effectiveLthr,
                      masa/trend R10, e1RM, objętość), plan.ts (DayPlan dla UI)
src/engine/__tests__/ golden.test.ts, scenarios.test.ts (scenariusze §10 specyfikacji)
src/data/             program.ts (import + walidacja Zod), rules.ts (zasady R1–R16 dla ludzi)
src/db/               Dexie (IndexedDB): index.ts (schemat v2: settings, kv, checkins, session_logs, set_logs, test_results, outbox),
                      repo.ts (zapisy z outboxem: check-in, logi, serie, testy, historia ćwiczeń)
src/sync/             supabase.ts (klient lub null bez env), auth.ts (magic link + kod OTP), sync.ts (push outbox → pull po server_updated_at, LWW),
                      useSync.ts (start, online, visibility, zmiany outboxa), strava.ts, wahoo.ts + useWahoo.ts (automatyczna wysyłka 7 dni)
src/app/              App.tsx (router, dolna nawigacja, lazy Postęp), useSettings.ts (ustawienia + kontekst silnika + testy → R11)
src/features/         today (Dziś: check-in, karta roweru + log, test, siłownia), week, season, library, settings (+ konto, kopia),
                      more, progress (masa, testy, kalkulator, objętość, siła), gym (tryb siłowni: sequence.ts, useRestTimer.ts, GymModePage.tsx)
supabase/             config.toml, migrations/…_init.sql (tabele, RLS, trigger allowed_emails, lww_guard) – instrukcja: docs/09-supabase.md
src/components/       ui.tsx (Card, Badge, Button…), StepTimeline.tsx (oś czasu stref)
src/lib/              dates.ts (Europe/Warsaw, formaty pl), format.ts, labels.ts, zones.ts (kolory)
e2e/                  Playwright smoke (viewport iPhone)
public/               ikony PWA
```

## Stan etapów
- Etap 1 (plan offline): gotowy – silnik + testy golden, ekrany Dziś / Tydzień / Sezon / Biblioteka / Ustawienia, PWA.
- Etap 2 (logi, Supabase, tryb siłowni, Postęp): gotowy w kodzie. Projekt w chmurze zakłada użytkownik wg `docs/09-supabase.md`; dozwolony e-mail wpisuje się do `private.allowed_emails` przez SQL Editor (nie w repo). Bez env `VITE_SUPABASE_*` aplikacja działa lokalnie.
- Synchronizacja: rekordy mają UUID z klienta i `updated_at` (zegar klienta); serwer odrzuca starsze zapisy (trigger `lww_guard`) i stempluje `server_updated_at`, po którym klient pobiera zmiany. Soft delete przez `deleted_at`.
- Lokalna weryfikacja SQL bez Dockera: `createdb trening_test` + stub schematu `auth` (patrz historia commitów), potem `psql -f supabase/migrations/…`.
- Etap 3 (Strava): gotowy i wdrożony 11.09.2026 – `supabase/functions/strava-oauth` (OAuth, status, sync, subscribe; callback publiczny ze stanem HMAC) i `strava-webhook` (GET challenge, POST zdarzenia, import w tle; **sekret w ścieżce** `/<webhookPathSecret>` zamiast publicznego adresu, zdarzenia `delete`/`deauthorized` potwierdzane w API Stravy), moduły `_shared/` (crypto AES-GCM/HMAC z service role, klient Strava). Migracja `20260911140000_strava.sql`: `strava_activities` + trigger agregujący jazdy dnia do `session_logs`. Klient: `src/sync/strava.ts`, sekcja Integracje, `StravaCard.tsx` (strefy z histogramu, przenoszenie na inny dzień). Deploy: `supabase functions deploy <nazwa> --no-verify-jwt --use-api`; typecheck: `deno check supabase/functions/*/index.ts`. Opis: `docs/10-strava.md`.
- Etap 4 (Wahoo): kod gotowy i wdrożony 11.09.2026 – `src/engine/wahoo.ts` (generator `plan.json`, czysty TS z testami), `supabase/functions/wahoo-oauth` i `wahoo-push`, migracja `20260911160000_wahoo.sql` (jedna wysyłka na dzień: unikat `wahoo_pushes(user_id, date)`), klient `src/sync/wahoo.ts` + `useWahoo.ts` (automat raz dziennie, dziś + 6 dni), przycisk „Wyślij na Wahoo” na ekranie Dziś. **Plan JSON buduje aplikacja, nie serwer** – żeby nie dublować silnika w Deno; uzasadnienie w `docs/11-wahoo.md`. Do uruchomienia brakuje sekretów `WAHOO_CLIENT_ID/SECRET` i adresu zwrotnego w portalu Wahoo.
- Etap 5 (adaptacja, sprzęt, wyjazd): reguły i ekrany gotowe 11.09.2026 – `src/engine/rules.ts` (applyOverrides dla swap/move/indoor/sick/downgrade/skip + warningsFor dla R1–R7, R9, R12, R13 + validateSwap dla R15), hook `src/app/usePlan.ts` (okno 15 dni wstecz i 8 w przód, bo R7 patrzy dwa tygodnie), `RulesCard` z propozycjami, zamiana dni w widoku Tygodnia, ekrany Sprzęt i Wyjazd (`data/gear_tasks.json`, `data/packing_list.json`, migracja `20260911180000_gear_trip.sql` z deterministycznymi kluczami). **Zostały powiadomienia Web Push.**
- Znaczniki dnia: `test`, `mountain_weekend`, `back_to_back`, `heat` opisują trening i wędrują przy zamianie/przeniesieniu; `deload` należy do tygodnia i zostaje.
