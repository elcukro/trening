# 07 · Specyfikacja aplikacji „Trening” – osobisty asystent treningowy

## 1. Cel produktu

Jedna odpowiedź na pytanie **„Co mam dziś zrobić i jak?”** – codziennie, od 11.09.2026 do wyjazdu w Alpy (wrzesień 2027). Aplikacja prowadzi użytkownika przez plan rowerowy, siłowy i żywieniowy opisany w `docs/00–06`, zapisuje wykonanie, reaguje na odchylenia (reguły R1–R16) i pokazuje postęp w kierunku celu (podjazd 8 km / 8,8% w ~57 min przy 90 kg).

**Użytkownik:** jedna osoba (Luke), iPhone, Wahoo ELEMNT Bolt v2 + pas HR + czujnik kadencji, bez miernika mocy, pełna siłownia. Język interfejsu: **polski**.

**Poza zakresem MVP:** liczenie kalorii z posiłków, planowanie tras, społeczność, wielu użytkowników, generowanie planu przez AI (plan jest dany w `data/`).

## 2. Źródła prawdy (przeczytaj przed kodowaniem)

| Plik | Zawartość |
|---|---|
| `data/program.json` | strefy, fazy, biblioteka treningów rowerowych (kroki z celami), ćwiczenia, tabela tygodni, ustawienia domyślne |
| `data/calendar.json` | **golden file**: kalendarz dzień po dniu dla ustawień domyślnych (testy silnika) |
| `data/reference_generator.py` | referencyjna implementacja logiki kalendarza (Python) – przepisz na TypeScript 1:1 |
| `data/gear_tasks.json`, `data/packing_list.json` | zadania sprzętowe i checklista wyjazdowa |
| `docs/01-zasady-treningu.md` | strefy, testy, **reguły adaptacji R1–R16** |
| `docs/02–06` | treść merytoryczna do ekranów i biblioteki |

Zasada: **treść planu nie jest hardkodowana w komponentach** – UI renderuje dane z `program.json` + silnika. Zmiana planu = zmiana danych i wersji programu (`version`).

## 3. Architektura (rekomendowana)

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Frontend | **Vite + React + TypeScript**, Tailwind CSS, React Router | lekkie PWA, szybki start, zgodne z innymi projektami użytkownika |
| PWA | `vite-plugin-pwa` (Workbox), manifest, ikony `apple-touch-icon`, `display: standalone` | instalacja na iPhonie („Dodaj do ekranu początkowego”) |
| Stan serwera | TanStack Query + trwały cache (IndexedDB) | działa offline na siłowni, synchronizuje po powrocie sieci |
| Lokalna baza / kolejka offline | Dexie (IndexedDB) | zapisy serii bez zasięgu, kolejka mutacji |
| Backend + sync | **Supabase**: Auth (magic link, jeden dozwolony e-mail), Postgres z RLS, **Edge Functions** (Deno) do OAuth i webhooków | synchronizacja między telefonem i komputerem, bezpieczne tokeny Strava/Wahoo |
| Wykresy | Recharts | wykresy postępu |
| Daty | date-fns (+ strefa `Europe/Warsaw`) | tygodnie od poniedziałku |
| Walidacja | Zod (schematy `program.json`, formularzy, odpowiedzi API) | |
| Testy | Vitest (silnik planu, reguły), Playwright (smoke E2E w viewport iPhone) | |
| Hosting | Vercel lub Netlify (HTTPS wymagane dla PWA i OAuth) | |

Alternatywy są dopuszczalne, jeśli zachowasz: PWA offline-first na iOS, synchronizację, sekrety OAuth wyłącznie po stronie serwera.

## 4. Silnik planu (najważniejszy moduł)

Czysty moduł TypeScript bez zależności od UI: `src/engine/`.

```ts
getDayPlan(date: string, ctx: EngineContext): DayPlan
getWeekPlan(weekStart: string, ctx): DayPlan[]
getSeason(ctx): WeekSummary[]
computeZones(lthr: number): ZoneBpm[]            // z hr_zones_lthr_fraction
resolveWorkout(id, durationMin, zones, scale): ResolvedWorkout   // kroki z bpm
suggestLoad(exerciseId, history, rx): LoadSuggestion              // R8
applyRules(plan, logs, checkins, weather?, overrides): DayPlan    // R1–R7, R9, R10, R12, R13, R15, R16
recomputeCalendar(settings): Calendar                             // R14 (zmiana daty wyjazdu)
estimateClimb({riderKg, bikeKg, watts, km, gradePct}): {minutes, kmh}
```

`EngineContext` = `program.json` + ustawienia użytkownika + nadpisania (zamiany dni, przeniesienia, „gołoledź”, „choroba”) + logi + check-iny.

Wymagania:
- Dla ustawień domyślnych i braku nadpisań `getDayPlan` zwraca **dokładnie** to, co `data/calendar.json` (test porównujący wszystkie 367 dni).
- Tygodnie od poniedziałku; tydzień 1 zaczyna się `program_start`; tydzień 0 = 7 dni wcześniej (dni przed 11.09.2026 pomijane).
- Fazy I–III przypięte do dat, fazy IV–TAPER liczone wstecz od `trip_start` (R14). Dla domyślnej daty wynik = tabela tygodni w `program.json`.
- `volume_scale` (R16) skaluje tylko jazdy `Z2`, `Z2_CADENCE`, `Z2_HEAT`, `LONG`, `LONG_TEMPO`, `HILLS` (min. 45 / 90 min).
- Brak LTHR → cele pokazywane jako strefa + RPE, a na dzisiejszym ekranie baner „Zrób test, żeby zobaczyć tętno”.

## 5. Ekrany

Nawigacja dolna (5 zakładek): **Dziś · Tydzień · Postęp · Biblioteka · Więcej** (Więcej: Sezon, Sprzęt, Wyjazd, Ustawienia, Integracje).

### 5.1 Dziś (ekran startowy)
- Nagłówek: data, **tydzień N / faza**, typ tygodnia (badge: *Test*, *Rozładowanie*, *Góry*, *Back-to-back*), **odliczanie do wyjazdu** (dni).
- **Poranny check-in** (zwijany, 20 s): waga (opcjonalnie), tętno spoczynkowe, sen 1–5, nogi 1–5, motywacja 1–5 → R6.
- **Karta roweru:** nazwa treningu, czas, sugerowany rower, struktura w krokach (oś czasu z kolorami stref), cele w **bpm** + RPE + kadencja, jedzenie na rowerze (g/h), notatka techniczna. Przyciski: **Wyślij na Wahoo** · **Gołoledź / pod dachem** (R4, pokazuje `fallback_workout_id`) · **Oznacz: wykonane / zmienione / pominięte** (RPE 1–10, czas, dystans, przewyższenie, śr. tętno, notatka; auto-uzupełnienie ze Stravy).
- **Karta siłowni:** nazwa sesji, szacowany czas, lista ćwiczeń z preskrypcją tego tygodnia, **sugerowany ciężar** (R8) i ostatni wynik. Przycisk **Start sesji** → tryb siłowni (5.2).
- **Karta żywienia:** komunikat dnia (`nutrition.label`), białko w gramach (masa docelowa × g/kg), węglowodany na rowerze, po treningu.
- **Uwagi tygodnia / wydarzenie** (`week_notes`, `event`) i ostrzeżenia reguł (R1, R3, R9, R10, R13).
- Stan „dzień wolny”: krótki komunikat + opcjonalny spacer / rozciąganie zginaczy bioder.

### 5.2 Tryb siłowni (pełny ekran)
- Jedno ćwiczenie na ekranie: nazwa, blok (1, 2, 3A/3B…), preskrypcja, **wskazówki techniki** (`cues`), „po co”, zamienniki.
- Lista serii z polami **ciężar** / **powtórzenia** / **RIR** (domyślnie wypełnione sugestią), odhaczenie serii jednym tapnięciem.
- **Timer przerwy** startujący automatycznie po odhaczeniu serii (`rest_s`), duże cyfry, dźwięk na końcu (iOS PWA: brak wibracji – użyj Web Audio) i **Screen Wake Lock** podczas sesji.
- Superserie (3A/3B, 4A/4B) i obwody core przełączają się naprzemiennie.
- Rozgrzewka jako checklista; serie wstępne wyliczone z ciężaru roboczego (pusta sztanga → 50% → 70% → 85%).
- Zapisy działają **offline** (Dexie), sync po odzyskaniu sieci.
- Podsumowanie po sesji: tonaż, e1RM (Epley) ćwiczeń głównych, porównanie z poprzednim tygodniem, sugestie na następny tydzień.

### 5.3 Tydzień
- 7 kafelków (pon–nd): ikony rower/siłownia, czas, status (zaplanowane / wykonane / zmienione / pominięte), badge test/góry/B2B/rozładowanie.
- Suma godzin: plan vs wykonanie, liczba sesji siłowych.
- **Zamiana dni** (przeciągnij lub „Zamień z…”) z walidacją R15/R9 i komunikatem, co jest nie tak.
- Przełączanie tygodni strzałkami; „Wróć do dziś”.

### 5.4 Sezon (w „Więcej”)
- Oś czasu faz do wyjazdu (kolory faz), zaznaczone testy, weekendy w górach, back-to-back, blok 3-dniowy, taper, zadania sprzętowe.
- Tabela tygodni (jak `02-plan-rowerowy.md` §2) z możliwością wejścia w tydzień.

### 5.5 Postęp
- **Masa:** punkty + średnia 7-dniowa + linia celu (105 → 90 kg, 0,45 kg/tydz.), tempo zmiany (kg/tydz., % masy), ostrzeżenia R10.
- **Testy:** LTHR, prędkość na trasie testowej, FTP (Wattbike), **W/kg**; tabela wyników z datami.
- **Kalkulator podjazdu:** suwaki masa / moc / długość / nachylenie; wynik dziś vs cel; domyślnie 8 km / 8,8% (wzór w `00-kontekst-i-decyzje.md`).
- **Objętość:** godziny tygodniowo (plan vs wykonanie), zgodność z planem w % (ostatnie 4 tygodnie), rozkład czasu w strefach (gdy są strumienie ze Stravy).
- **Siła:** e1RM przysiadu, trap bar, hip thrust, step-up w czasie; cele na koniec lutego (`03-plan-silowy.md` §9) jako linie odniesienia.

### 5.6 Biblioteka
- Treningi rowerowe (z `bike_workouts`) z wizualizacją kroków i celami w bpm.
- Ćwiczenia (z `exercises`) z techniką, „po co”, zamiennikami.
- Strefy (tabela z bpm dla aktualnego LTHR), protokoły testów, zasady (R1–R16 w wersji dla człowieka), strategia na przełęcz, żywienie.

### 5.7 Sprzęt
- Karty rowerów (Checkpoint, Dogma) z opisem ról.
- Zadania z `gear_tasks.json`: termin, status, koszt; zadania cykliczne (łańcuch co miesiąc).
- Prosty dziennik serwisu (data, rower, co zrobione, km).

### 5.8 Wyjazd
- Checklista z `packing_list.json`, przełącznik **hotel / biwak**, odhaczanie, reset stanu, podział na torby (podsiodłówka / rama / górna rura).
- Strategia na przełęcz i jedzenie (skrót z `01` §7).

### 5.9 Ustawienia
- Profil: masa startowa i docelowa, LTHR (ręcznie lub z testu), HRmax (opcjonalnie), FTP (opcjonalnie), rower + wyposażenie (kg), TDEE (opcjonalnie).
- Daty: start programu, **data wyjazdu** (R14 z podglądem zmian przed zapisem).
- Dni siłowni (`gym_days`: śr/pt lub wt/pt), `volume_scale`.
- Integracje: Strava, Wahoo (połącz / rozłącz / status tokenu / ostatnia synchronizacja).
- Eksport / import kopii JSON (wszystkie dane użytkownika), wersja programu.

## 6. Model danych (Supabase / Postgres)

Wszystkie tabele z `user_id uuid references auth.users` i RLS `user_id = auth.uid()`. Dostęp do aplikacji tylko dla e-maila z listy dozwolonych (np. zmienna `ALLOWED_EMAIL` sprawdzana w funkcji/trigerze).

```sql
profiles(user_id pk, name, weight_start_kg, weight_target_kg, bike_kit_kg, lthr_bpm, hr_max_bpm,
         ftp_w, tdee_kcal, program_start date, trip_start date, gym_days jsonb, volume_scale numeric,
         program_version text, updated_at)

plan_overrides(id, user_id, date date, kind text,          -- swap | move | skip | indoor | sick | downgrade
               payload jsonb, created_at)                 -- np. {"swap_with":"2026-10-01"}

session_logs(id, user_id, date date, kind text,            -- bike | gym | test
             planned_workout_id text, status text,         -- done | modified | skipped
             rpe int, duration_min int, distance_km numeric, elevation_m int,
             avg_hr int, max_hr int, avg_cadence int, avg_speed_kmh numeric, bike text,
             strava_activity_id bigint unique, notes text, created_at, updated_at)

set_logs(id, user_id, session_log_id fk, exercise_id text, set_no int,
         weight_kg numeric, reps int, rir int, is_warmup bool, created_at)

test_results(id, user_id, date, protocol text,             -- TEST_LTHR | WATTBIKE_TEST
             lthr_bpm int, avg_hr int, avg_power_w int, ftp_w int, avg_speed_kmh numeric,
             distance_km numeric, route text, bike text, temp_c numeric, wind text, notes)

checkins(id, user_id, date unique per user, weight_kg numeric, resting_hr int,
          sleep int, legs int, motivation int, sick bool, notes)

gear_task_state(user_id, task_id text, status text, done_at, notes, primary key(user_id, task_id))
service_log(id, user_id, date, bike text, km int, description text)
packing_state(user_id, trip_key text, item_key text, checked bool, primary key(user_id, trip_key, item_key))

-- tylko serwer (bez polityk SELECT dla klienta):
integration_tokens(user_id, provider text, access_token_enc text, refresh_token_enc text,
                   expires_at timestamptz, scope text, athlete_id text, updated_at,
                   primary key(user_id, provider))
wahoo_pushes(id, user_id, date, workout_id text, wahoo_plan_id bigint, wahoo_workout_id bigint,
             status text, error text, created_at)
```

Plan (kalendarz) **nie jest** zapisywany w bazie – jest liczony z `program.json` + `profiles` + `plan_overrides`.

## 7. Integracje

### 7.1 Strava – import jazd (etap 3)
- Aplikacja API Strava (Standard Tier – do 10 użytkowników bez zatwierdzania wg zasad od 06.2026; zweryfikuj aktualne warunki przy rejestracji).
- OAuth: scope `read,activity:read_all`; wymiana kodu i odświeżanie tokenu (**access token ważny 6 h**) w Edge Function `strava-oauth`. Sekret klienta tylko w zmiennych środowiskowych Supabase.
- **Webhook** (`strava-webhook`): obsługa weryfikacji `hub.challenge` (GET) oraz zdarzeń `activity:create/update/delete` (POST) → pobranie `GET /activities/{id}` (+ opcjonalnie `/streams?keys=heartrate,cadence,altitude,time`) → zapis do `session_logs`.
- **Dopasowanie do planu:** ta sama data (strefa Warszawa), `sport_type` ∈ Ride/GravelRide/VirtualRide/MountainBikeRide → do planowanej jazdy tego dnia; dwie jazdy w dniu gór/B2B → sumowanie; brak planu → „jazda dodatkowa”. Użytkownik może ręcznie zmienić przypisanie.
- Czas w strefach liczony ze strumienia tętna i aktualnego LTHR.
- Limity: 100 zapytań / 15 min, 1000 / dzień – webhooki zamiast odpytywania; backoff przy 429.

### 7.2 Wahoo – eksport zaplanowanych treningów na Bolta (etap 4)
- Wykorzystaj istniejącą aplikację deweloperską użytkownika (`~/code/wahoo-routes/.env` – `WAHOO_CLIENT_ID`, `WAHOO_CLIENT_SECRET`; nie kopiuj sekretów do repozytorium, dodaj nowy redirect URI w portalu Wahoo). Tryb sandbox wystarcza dla 1 użytkownika (limity: 25 zapytań / 5 min, 100 / h, 250 / dzień).
- OAuth: scope `user_read plans_write workouts_write offline_data`; **access token ważny 2 h**, odświeżanie przez `POST /oauth/token` (`grant_type=refresh_token`); od 01.01.2026 max 10 niewycofanych tokenów na użytkownika – przechowuj i odświeżaj jeden.
- Przepływ (Edge Function `wahoo-push`):
  1. Zbuduj **plan JSON** z treningu (`resolveWorkout`):
     ```json
     {
       "header": { "name": "Sweet spot 2×20 min", "version": "1.0.0", "description": "…",
                   "workout_type_family": 0, "workout_type_location": 1,
                   "threshold_hr": 160, "ftp": 220 },
       "intervals": [
         { "name": "Rozgrzewka", "exit_trigger_type": "time", "exit_trigger_value": 900,
           "intensity_type": "wu", "targets": [ { "type": "threshold_hr", "low": 0.81, "high": 0.89 } ] },
         { "name": "2×", "exit_trigger_type": "repeat", "exit_trigger_value": 2, "intervals": [
           { "name": "Interwał 20 min", "exit_trigger_type": "time", "exit_trigger_value": 1200,
             "intensity_type": "active", "targets": [ { "type": "threshold_hr", "low": 0.92, "high": 0.96 },
                                                      { "type": "rpm", "low": 80, "high": 90 } ] },
           { "name": "Przerwa", "exit_trigger_type": "time", "exit_trigger_value": 300,
             "intensity_type": "recover", "targets": [ { "type": "threshold_hr", "low": 0.0, "high": 0.81 } ] } ] },
         { "name": "Schłodzenie", "exit_trigger_type": "time", "exit_trigger_value": 600,
           "intensity_type": "cd", "targets": [ { "type": "threshold_hr", "low": 0.0, "high": 0.81 } ] }
       ]
     }
     ```
     Mapowanie: `steps[].target` → `targets[{type:"threshold_hr"}]`, `cadence_rpm` → `targets[{type:"rpm"}]`, `rpe` → `targets[{type:"rpe"}]` (gdy brak LTHR), `repeat` → `exit_trigger_type:"repeat"` z zagnieżdżonymi `intervals`, `intensity_type` wprost (wu, active, tempo, lt, map, ac, recover, cd). Dla jazd parametrycznych (Z2, LONG…) – jeden interwał z czasem z kalendarza.
  2. `POST https://api.wahooligan.com/v1/plans` z `plan[file]` = base64(JSON), `plan[filename]`, `plan[external_id]` = `"{date}:{workout_id}:{program_version}"`, `plan[provider_updated_at]`.
  3. `POST /v1/workouts` z `workout[name]`, `workout[workout_type_id]` (kolarstwo na zewnątrz – zweryfikuj ID w dokumentacji), `workout[starts]` (data dnia 06:00 Europe/Warsaw w ISO), `workout[minutes]`, `workout[plan_id]`.
  4. Zapisz wynik w `wahoo_pushes`; ponowne wysłanie tego samego dnia = `PUT` istniejącego planu/treningu zamiast duplikatu.
- Tryb automatyczny: raz dziennie (cron Supabase) wyślij **dziś + 6 dni**; przy zmianie planu (override, nowy LTHR) zaktualizuj przyszłe wysłane treningi.
- Na Bolcie treningi pojawiają się w „Planned Workouts” po synchronizacji (Wi-Fi lub aplikacja ELEMNT).
- Dokumentacja: https://cloud-api.wahooligan.com/ (plans, workouts, format `plan.json`).
- **Plan B**, jeśli API Wahoo sprawi problem: eksport tych samych treningów do intervals.icu (który sam wysyła 7 dni planu na Wahoo) albo plik `.fit` workout do ręcznego wgrania.

## 8. Wymagania niefunkcjonalne

- **iPhone PWA:** manifest, `apple-mobile-web-app-capable`, ikony 180×180, obsługa notcha (`env(safe-area-inset-*)`), tryb ciemny i jasny, duże elementy dotykowe (≥ 44 pt) – obsługa w rękawiczkach i spoconymi palcami na siłowni.
- **Offline-first:** Dziś, Tydzień, Biblioteka i tryb siłowni działają bez sieci (dane programu w bundle + cache ostatniego stanu użytkownika). Kolejka zapisów synchronizowana po powrocie sieci, rozwiązywanie konfliktów „ostatni zapis wygrywa” per rekord.
- **Wydajność:** ekran Dziś < 1 s na iPhonie po uruchomieniu z ekranu głównego.
- **Bezpieczeństwo:** tokeny Strava/Wahoo i sekrety tylko po stronie Edge Functions (szyfrowane w bazie), RLS na wszystkich tabelach, brak kluczy w repozytorium (`.env.example`).
- **Powiadomienia (etap 5):** Web Push (iOS 16.4+ dla PWA na ekranie głównym) – 7:00 plan dnia, 20:00 przypomnienie o odhaczeniu, dzień przed testem/górami.
- **Dostępność i język:** polskie teksty, formaty 24 h, przecinek dziesiętny, kg / km / km/h.
- **Jakość:** TypeScript strict, ESLint, testy silnika (≥ 90% pokrycia modułu `engine`), CI (GitHub Actions: lint + test + build).

## 9. Etapy dostarczenia

| Etap | Zakres | Gotowe, gdy |
|---|---|---|
| **1. Plan offline** | Vite/React/PWA, import i walidacja `program.json`, silnik (`getDayPlan`, strefy, `volume_scale`, R14), ekrany Dziś / Tydzień / Sezon / Biblioteka, ustawienia lokalne, deploy | test golden file przechodzi; aplikacja zainstalowana na iPhonie pokazuje poprawny dzień |
| **2. Logi i sync** | Supabase Auth + tabele + RLS, check-in, logi jazd, tryb siłowni z timerem i offline, testy i przeliczanie stref, R8, Postęp (masa, testy, siła, objętość, kalkulator podjazdu), eksport/import JSON | trening siłowy zapisany offline synchronizuje się po powrocie sieci; wykresy działają |
| **3. Strava** | OAuth, webhook, dopasowanie do planu, czas w strefach | jazda z Bolta pojawia się w aplikacji ≤ 5 min po wgraniu na Stravę |
| **4. Wahoo** | OAuth, generator `plan.json`, push dziś + 6 dni, aktualizacje po zmianach | trening z aplikacji widoczny na Bolcie z celami tętna |
| **5. Adaptacja i dodatki** | reguły R1–R7, R9, R10, R12, R13, R15 w UI (zamiany, gołoledź, choroba, check-in), Sprzęt, Wyjazd, powiadomienia push | scenariusze z §10 przechodzą |

## 10. Kryteria akceptacji (scenariusze testowe)

1. **16.09.2026 (śr):** tydzień 1, faza I, typ *test*; rower `TEST_LTHR` 60 min; siłownia Sesja A: przysiad 2×10 RIR 4, RDL 2×10 RIR 4; żywienie „bez deficytu”.
2. **18.09.2026 (pt):** brak jazdy, Sesja B (step-up 2×8 RIR 4), deficyt ~500 kcal.
3. **23.12.2026:** tydzień 15, *rozładowanie*, `DELOAD_WED` 60 min, Sesja A w wersji rozładowania (przysiad 3×5 RIR 3).
4. **13.01.2027:** `SS_2x20` z `fallback_workout_id = INDOOR_4x4`; Sesja A: przysiad 5×4 RIR 2, trap bar 5×3 RIR 2. Przycisk „Gołoledź” podmienia trening na 4×4 (35 min).
5. **23.02.2027 (wt):** `WATTBIKE_TEST`; **24.02:** Z2 45 + Sesja A „sprawdzian” (przysiad 1×5 RIR 1).
6. **31.03.2027:** `TEST_LTHR` + Sesja C (przysiad 3×3 RIR 2–3, wskoki 3×3).
7. **15.05.2027 (sob):** `MOUNTAIN_DAY` 240 min, event „Weekend w górach #1: Karkonosze…”, rower: Checkpoint.
8. **20.08.2027 (pt):** `BLOCK_DAY1` 210 min; **25.08:** ostatnia sesja z nogami.
9. **11.09.2027:** dzień wyjazdu (`TRIP`).
10. **LTHR = 160:** Z2 = 130–142 bpm, SS = 147–154 bpm; zmiana LTHR na 165 przelicza cele od następnego dnia.
11. **Zmiana daty wyjazdu na 25.09.2027:** taper przesuwa się na 13–24.09, faza V na 6 tygodni przed taperem, faza IV się wydłuża; fazy I–III bez zmian (R14).
12. **Przeniesienie Sesji C ze środy 12.05.2027 na piątek 14.05.2027** (sobota 15.05 = weekend w górach): ostrzeżenie R9 (siłownia z nogami < 48 h przed górami) i propozycja powrotu na środę lub zamiany na core.
13. **Kalkulator podjazdu:** 105 kg, 230 W, 8 km, 8,8% → ~64 min; 90 kg, 230 W → ~56 min (±1 min).
14. **Sugestia ciężaru:** przysiad 4×8 @ 80 kg, wszystkie serie RIR 3 (cel 3) → w kolejnym tygodniu 82,5 kg.
15. **Offline:** zapis 5 serii w trybie samolotowym, powrót sieci → dane w Supabase, brak duplikatów.
16. **Strava:** nowa aktywność Ride z datą dzisiejszą → przypisana do dzisiejszej jazdy, status *wykonane*, czas i tętno uzupełnione.
17. **Wahoo:** „Wyślij na Wahoo” dla `THR_4x6` → plan i trening utworzone w Wahoo Cloud (status 201), ponowne wysłanie aktualizuje zamiast duplikować.
