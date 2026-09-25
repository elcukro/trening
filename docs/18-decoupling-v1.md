# 18. Decoupling v1 – każdy użytkownik ma swoje dane, żadnych założeń jednego na koncie drugiego

Stan na 25.09.2026, po pierwszym dniu z dwoma kontami. Poza zakresem v1: zaproszenia, rola trenera,
programy jako dane po stronie serwera (plany nadal powstają w repo, przez generatory, wspólnie z asystentem),
budżet limitów integracji.

## Zasada

Wszystko, co opisuje **osobę** albo **jej plan**, ma dokładnie dwa dozwolone miejsca:

1. **plik programu** (`data/program-*.json`, produkowany przez generator) – struktura tygodni, fazy, cel,
   reguły żywienia, parametry reguł R1–R16, rower, teksty właściwe dla programu, włączone funkcje;
2. **ustawienia użytkownika** (`settings` w Dexie ↔ `profiles` w Supabase) – progi, masa, daty, dni siłowni,
   lokalizacja pogody, rowery.

Silnik (`src/engine`) i interfejs czytają wyłącznie z tych dwóch źródeł. **Żaden literał w `src/` ani żaden
globalny plik w `data/` nie może opisywać jednego zawodnika.** Test na końcu (§ Kryterium) to egzekwuje.

## Inwentaryzacja wycieków (grep po `src/` i `data/`, 25.09.2026)

### A. Treść programu zaszyta w silniku albo w interfejsie

| # | gdzie | co | dotyka drugiego konta jak |
|---|---|---|---|
| A1 | `engine/nutrition.ts` | mapa deficytów per faza, białko 1,8 g/kg – pod 110 → 90 kg | „deficyt 500 kcal” w dni lekkie u 73 kg |
| A2 | `engine/rules.ts` | R2: `weekday === 'sun'` + „sobotnia długa”; R1: „nigdy w piątek/sobotę”; R3: semantyka Sesji A/B/C i dwóch siłowni; R9/`validateMove`: „Sesja nóg < 48 h” | długa w poniedziałek → R2 martwa; siłownia sob → ostrzeżenia co tydzień |
| A3 | `data/rules.ts` | opisy R1–R16 dla ludzi: „środowy akcent”, „sobotnia długa”, „Sesja B” | Biblioteka → Zasady opisuje cudzy tydzień |
| A4 | `engine/calendar.ts` `bikeSuggestion` | „Checkpoint (przełożenie 40/50…)”, „Checkpoint (zima, błotniki)” dla faz II/V/TAPER i treningów górskich | opis roweru z cudzego garażu |
| A5 | `engine/baseline.ts` `goalPower(…, 30)`, `features/progress/BaselineCard.tsx` | cel „30 km/h przez 2–3 h” | karta „Punkt wyjścia” liczy cudzy cel |
| A6 | `engine/cadence.ts` | `CADENCE_GOAL_RPM = 78`, `CADENCE_LOW_RPM = 75` | ostrzeżenie o kadencji skalibrowane pod jednego |
| A7 | `src/data/program.ts` | `short`, `goal` programu w kodzie, nie w JSON-ie programu | dwa źródła prawdy o programie |
| A8 | `sync/weather.ts` `DEFAULT_LOCATION` | Łódź | pogoda dla cudzego miasta, dopóki nie zmieni |
| A9 | `features/today/TestResultCard.tsx` | domyślny rower „Dogma” | – |
| A10 | `features/today/DayView.tsx`, `calendar/CalendarPage.tsx` | „Wyjazd w Alpy”, kafelek „Alpy” dla `TRIP` | nazwa treningu jest w programie, UI ją nadpisuje |
| A11 | `index.html`, `vite.config.ts` (manifest) | „Trening – Alpy 2027” | ikona na ekranie początkowym drugiego konta |

### B. Globalne pliki danych, które są jednego zawodnika

| # | gdzie | co |
|---|---|---|
| B1 | `data/gear_tasks.json`, `features/gear/GearPage.tsx` (`BIKES`), `data/gear.ts` (`enum checkpoint/dogma/both`) | rowery i zadania serwisowe Łukasza; drugie konto widzi je i może „odhaczać” |
| B2 | `data/packing_list.json`, `features/trip/TripPage.tsx`, `library/RulesPage.tsx`, `more/MorePage.tsx` | wyjazd w Alpy i „strategia na przełęcz” |

### C. Synchronizacja profilu

| # | gdzie | co |
|---|---|---|
| C1 | `sync/sync.ts` `syncProfile` | jeden `updated_at` na cały profil: stary klient pobiera profil bez nowego pola i zrównuje znaczniki – nowe pole nigdy nie dociera (przypadek `program_id`, 24.09) |

### D. Generatory

| # | gdzie | co |
|---|---|---|
| D1 | `reference_generator.py` `nutrition_for`, `bike_suggestion` | wspólne funkcje z osobistą logiką; `ftp300_generator.py` musi je odtwarzać identycznie, żeby golden się zgadzał |

Już zrobione wcześniej (nie wchodzi do planu): RLS, tokeny per użytkownik, `program_id`, układ `fixed`,
poniedziałek w szablonie, `bike_default`, parametry osobiste biblioteki treningów, etykiety sezonu i celu.

## Plan – sześć kroków, każdy osobno wdrażalny

Kolejność: od tego, co drugie konto widzi codziennie, do infrastruktury. Golden programu alpejskiego
ma pozostać **bajt w bajt** taki sam po każdym kroku – to sprawdzian, że przenosimy, a nie zmieniamy.

### Krok 1 – Żywienie, rower, cel i kadencja do pliku programu (A1, A4, A5, A6, A7, D1)

Schemat programu dostaje sekcje (wszystkie **opcjonalne**; brak = dotychczasowe wartości, więc program
alpejski parsuje się bez zmian):

```
nutrition: { deficit_by_phase: {PREP: true, …, IV: "if_above_target", V: false}, protein_g_per_kg: 1.8,
             long_ride_min: 120, heavy_min: 60, carbs_g_per_h: [[90,[60,80]],[60,[30,40]]] }
bikes:     { default: "Rower", by_workout: {MOUNTAIN_DAY: "…"}, by_phase: {II: "…"} }
goal:      { kind: "speed", kmh: 30, label: "…" }  |  { kind: "ftp", label: "…" }
cadence:   { floor_rpm: 75, goal_rpm: 78 }
meta:      { short: "Alpy 2027" }
```

- `engine/nutrition.ts` liczy z `program.nutrition`; `engine/calendar.ts` czyta `program.bikes`;
  `baseline.ts`/`useIos.ts` czytają `program.goal`; `cadence.ts` czyta `program.cadence`.
- Generator alpejski **wypisuje dokładnie dzisiejsze wartości** do JSON-a (Python przestaje mieć własną
  kopię logiki – funkcje `nutrition_for`/`bike_suggestion` liczą z tej samej struktury, którą zapisują).
- `ftp300_generator.py` ustawia własne: deficyt tylko `if_above_target`, białko 1,8, rower „Rower”,
  cel `ftp`, kadencja 75/85.
- `src/data/program.ts` zostaje rejestrem plików; `short`/`goal` znikają z kodu.
- Testy: golden obu programów, `scenarios.test.ts` (żywienie), nowy test `program_schema.test.ts`
  sprawdzający, że oba pliki mają sekcje i że alpejski daje te same liczby co przed zmianą.

Rozmiar: średni. Efekt: znika A1, A4, A5, A6, A7, D1.

### Krok 2 – Reguły sterowane programem (A2, A3)

- W programie: `rules: { long_ride_day: "sat"|"mon", long_catchup_day: "sun"|"tue"|null,
  accent_days: ["wed"] , gym_sessions: {A: {role:"legs"}, B: {role:"single_leg"}}, protected_hours_before_key: 48 }`.
- `rules.ts`: R2 używa `long_ride_day`/`long_catchup_day` zamiast `sat`/`sun`; R1 przenosi akcent na
  najbliższy dzień z lekką jazdą wg `day_type`, nie wg nazw dni; R3 rozróżnia sesje po `role`, nie po
  literze; R9/`validateMove` czytają `protected_hours_before_key`. Reguły, które program nie deklaruje
  (np. brak Sesji B), po prostu nie odpalają.
- `data/rules.ts`: opisy z placeholderami (`{long_day}`, `{accent_day}`) wypełnianymi z programu,
  albo osobna lista opisów w programie. Prościej: program niesie `rules_text` – generator go pisze.
- Testy: `rules.test.ts` rozszerzony o scenariusze na programie ftp300 (długa w pn, siłownia sob).

Rozmiar: średni–duży (reguły to ~450 linii). Efekt: drugie konto przestaje dostawać fałszywe ostrzeżenia.

### Krok 3 – Literały w interfejsie i funkcje włączane przez program (A8–A11, B2)

- Program deklaruje `features: ["gear", "trip", "baseline_speed"]`; `MorePage`, `SideNav`, trasy
  `/wiecej/sprzet`, `/wiecej/wyjazd`, karta „Punkt wyjścia” pokazują się tylko, gdy program je włącza.
  Program alpejski włącza wszystko; ftp300 – nic z tej trójki.
- `DayView`/`CalendarPage`: nazwa treningu `TRIP` z programu (`w.name`), bez „Alpy”.
- `TestResultCard`: domyślny rower z `program.bikes.default`.
- `index.html` i manifest: „Trening” (nazwa aplikacji nie może być per użytkownik, więc musi być
  neutralna); podtytuł sezonu zostaje w pasku bocznym z `program.meta.short`.
- Pogoda: `DEFAULT_LOCATION` znika; lokalizacja to pole profilu (`weather_lat/lon/name`), bez wartości
  odprawa mówi „ustaw miejscowość” zamiast liczyć dla Łodzi.
- Testy e2e: `ios.spec.ts` i `desktop.spec.ts` dostają wariant „konto z programem ftp300”
  (ustawienie `program_id` przez `addInitScript` do Dexie) i asercję braku literałów (patrz § Kryterium).

Rozmiar: mały–średni. Efekt: znika A8–A11, B2.

### Krok 4 – Sprzęt per użytkownik (B1)

- Rowery to dane użytkownika: tabela `bikes` (id, nazwa, typ, rola, rok, masa) + RLS; Ustawienia → „Rowery”.
- `gear_tasks.json` zostaje **szablonem** zadań per typ roweru (szosa / gravel / tarczówki / obręcze),
  a stan (`gear_task_state`) już jest per użytkownik. Zadania generują się z rowerów użytkownika,
  a nie z listy Łukasza; `service_log.bike` odwołuje się do `bikes.id`, nie do enum.
- Migracja danych Łukasza: dwa rowery wpisane skryptem, istniejący stan zadań zmapowany po `task_id`.

Rozmiar: średni. Efekt: znika B1. Można odłożyć, jeśli krok 3 ukryje Sprzęt na koncie ftp300 –
ale wtedy Ferdynand nie ma serwisu roweru w ogóle.

### Krok 5 – Synchronizacja profilu odporna na nowe pola (C1)

- `profiles.field_updated_at jsonb` (znacznik per pole) albo prościej: `profiles.schema_version int`
  i po stronie klienta „jeśli moja wersja schematu > zapisana w profilu, pobierz profil bezwarunkowo
  i scal per pole (zdalne pole wygrywa tylko tam, gdzie lokalne jest puste)”.
- Test jednostkowy `sync.test.ts`: scenariusz „stary klient zrównał znaczniki, nowe pole ma dojść”.

Rozmiar: mały. Efekt: koniec ręcznego podbijania `updated_at` w bazie.

### Krok 6 – Testy pilnujące, że to nie wróci

- **Test wycieku (jednostkowy)**: `leak.test.ts` – dla programu ftp300 buduje kalendarz, plan dnia
  i teksty reguł i sprawdza, że nie zawierają żadnego z ciągów: `Alpy`, `Checkpoint`, `Dogma`, `30 km/h`,
  `Łódź`, `Sesja B`, `sobotnia długa`, `Great Escape`. Lista ciągów w jednym miejscu, rozszerzana przy
  każdym nowym programie.
- **Test wycieku (e2e)**: konto z `program_id = ftp300` przechodzi Dziś, Tydzień, Postęp, Więcej,
  Ustawienia, Bibliotekę → Zasady i sprawdza `body.innerText` tą samą listą.
- **Test symetrii**: program alpejski nie zawiera „FTP 300”, „Ferdynand”.
- Golden obu programów bez zmian po każdym kroku.

## Kryterium ukończenia

1. Na koncie z programem `ftp300` żaden ekran ani powiadomienie nie zawiera ciągów z listy w kroku 6.
2. `grep -rn "Alpy\|Checkpoint\|Dogma\|30 km/h\|Łódź" src/` zwraca trafienia **tylko** w testach.
3. `data/` nie ma pliku, który opisuje jednego zawodnika, poza `program-*.json` i `calendar-*.json`.
4. Golden programu alpejskiego jest bajt w bajt taki sam jak 25.09.2026 (`git diff data/calendar.json` pusty).
5. Dodanie nowego pola profilu nie wymaga ręcznego SQL-a, żeby dotarło na drugie urządzenie.

## Czego v1 nie robi (świadomie)

- Programy nadal są w repo i wymagają wdrożenia; katalog programów po stronie serwera to v2.
- Zaproszenia i rola trenera – osobny plan.
- Budżet limitów Wahoo/Strava – do czasu trzeciego konta.
- Reguły R1–R16 pozostają jednym zestawem; program je parametryzuje, nie definiuje własnych.
