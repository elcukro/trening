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

### Krok 1 – Żywienie, rower, cel i kadencja do pliku programu (A1, A4, A5, A6, A7, D1) ✅ 25.09.2026

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

**Wykonanie (25.09.2026):** sekcje `meta`, `nutrition`, `bikes`, `goal`, `cadence` są **wymagane** w schemacie
(silnik nie ma już własnych wartości domyślnych). `nutritionFor(policy, …)`, `bikeSuggestion(bikes, …)`,
`lowCadenceWarning(trend, policy)`, `programGoal(goal, masa, ftp_w_goal, cda)` w `baseline.ts` – wspólny
dla karty „Punkt wyjścia”, Postępu i `/i`. Rejestr `src/data/program.ts` trzyma już tylko id i plik.
Generatory liczą żywienie i rower tymi samymi funkcjami z tych samych struktur, które zapisują do JSON-a.
`calendar.json` programu alpejskiego bajt w bajt taki sam jak przed zmianą (`cmp` przed/po).
Testy: `program_sections.test.ts`.

**Rozszerzenie – deficyt z masy (`nutrition.weight_based`)**, na prośbę po uwadze, że zawodnik ma masę
obecną i docelową: zamiast stałej etykiety „deficyt 300/500 kcal” silnik (`personalizeNutrition` w
`enrichDay`) liczy deficyt z brakujących kilogramów rozłożonych do daty celu (`trip_start`) i na dni z
deficytem (`deficit_days_per_week`, średnia z tygodni budujących liczona w generatorze), z limitem kcal/dzień
i limitem tempa (% masy/tydz.). Masa obecna = ostatni check-in (`EngineContext.current_weight_kg`), a bez
niego masa startowa z ustawień. Gdy limit obcina tempo, etykieta mówi wprost, że cel wypadnie później.
Włączone w programie FTP 300 (500 kcal, 0,7 %/tydz.); program alpejski zostaje przy stałych etykietach,
dopóki jego właściciel nie zdecyduje inaczej. Testy: `weight_deficit.test.ts`.

### Krok 2 – Reguły sterowane programem (A2, A3) ✅ 25.09.2026

Wykonanie (prostsze niż pierwotny szkic z dniami tygodnia – silnik patrzy na `day_type` kalendarza):
- Program niesie sekcję `rules` (`ProgramRulesSchema` w `schema.ts`): `text` (R1–R16 dla człowieka),
  `hierarchy`, `tests`, opcjonalne `pass_strategy`, oraz parametry reguł: `gym_catchup`
  (`{A: "move"|"drop", …}` – R3), `long_catchup_onto` (typy dni, na które wolno przenieść pominiętą długą – R2;
  pusta lista = przepada) i `deload_note` (R12). `src/data/rules.ts` usunięty; Zasady, Strefy i Wyjazd
  czytają `engine.ctx.program.rules`, strategia na przełęcz pokazuje się tylko, gdy program ją ma.
- `rules.ts`: R1 przenosi akcent tylko na dzień `easy` z jazdą, bez siłowni, niechroniony i nie tuż przed
  kolejnym akcentem (`canTakeAccent`); wzmianka o lżejszej sesji tylko, gdy jutro jest siłownia, i z jej literą.
  R2 działa od wczorajszej `long` na dowolny dzień tygodnia. R3 wg `gym_catchup`, odrabianie nie na akcent,
  długą, drugą siłownię ani przed dniem chronionym; dzień w dopełniaczu („Sesja A ze środy”, wcześniej „z środę”).
  Wersja pod dachem bierze rower z `program.bikes.indoor`. R9/`validateMove`/`validateSwap` już były ogólne.
- Program alpejski: teksty przepisane 1:1, `gym_catchup {A,C: move, B: drop}`, `long_catchup_onto ["easy"]` –
  zachowanie bez zmian, kalendarz identyczny. FTP 300: własne teksty, wszystko przepada (`drop`, `[]`),
  hierarchia z pn długą i sobotnią siłownią, test FTP w tyg. 0, 11, 21, 27, 39.
- Testy: `rules_ftp300.test.ts` (długa w pn przepada, piątkowy akcent przepada, środowy nie ląduje przed
  piątkowym, siłownia z soboty przepada, R12 i trenażer z programu, brak alpejskich słów w tekstach).

### Krok 3 – Literały w interfejsie i funkcje włączane przez program (A8–A11, B2) ✅ 25.09.2026

Wykonanie:
- Program deklaruje `features` (`gear`, `trip`). Sprzęt i Wyjazd znikają z „Więcej”, z paska bocznego
  i ze stopki „Pełna aplikacja” w `/i`, a bezpośredni adres wraca do `/wiecej` (`FeatureRoute` w `App.tsx`).
  Alpy: oba; FTP 300: żaden. **Odstępstwo od szkicu:** bez `baseline_speed` – karta „Punkt wyjścia” jest już
  sterowana celem programu (krok 1: prędkość tylko przy `goal.kind === "speed"`), a Ferdynandowi przydaje się
  jako zapis FTP, masy i Pw:HR.
- `meta.target` (`label`, `short`, `until`, `today`, `after`) nazywa datę końcową: „wyjazd” u Ciebie,
  „koniec programu” u Ferdynanda. Z tego korzystają: pole w Ustawieniach, odliczanie w nagłówku dnia
  i w pasku sezonu, podtytuł ekranu Sezon.
- `gym_day_options` (opcjonalne): warianty dni siłowni w Ustawieniach. Bez nich pole znika, a zapis
  zachowuje `gym_days` programu (wcześniej formularz nadpisywał `B: "fri"` i pokazywał warianty środa/wtorek
  także przy siłowni w sobotę).
- `DayView` bierze nazwę treningu `TRIP` z programu; kafelek w Kalendarzu mówi „Wyjazd”, pełna nazwa w podpowiedzi.
  „Tydzień 0 od 3 dni wcześniej” tylko w układzie sezonowym. „Tabela 53 tygodni” → „tabela tygodni”.
- `index.html` i manifest: „Trening”.
- Pogoda: bez `DEFAULT_LOCATION`. Brak miejscowości → odprawa mówi „ustaw miejscowość” (pełna aplikacja
  z linkiem do Ustawień, `/i` z nowym arkuszem Więcej → Pogoda). **Odstępstwo:** lokalizacja zostaje w `kv`
  (pamięć urządzenia, nie konta) – `kv` się nie synchronizuje, więc nie ma wycieku między kontami; przeniesienie
  do profilu dopiero po kroku 5, bo nowe pole profilu przy obecnym LWW ginie na starszych klientach.
- Testy: `e2e/program-ftp300.spec.ts` – przełącza program w Ustawieniach i sprawdza 8 ekranów pełnej aplikacji
  oraz 4 ekrany `/i` pod kątem literałów alpejskich (Alpy, przełęcz, Łódź, Checkpoint, Dogma, 30 km/h, Sesja B,
  „do wyjazdu”…), brak Sprzętu/Wyjazdu i przekierowanie z `/wiecej/wyjazd`.

### Krok 4 – Sprzęt per użytkownik (B1) ✅ 25.09.2026

Wykonanie:
- Tabela `bikes` (id, nazwa, `kind` road/gravel/mtb/tt/other, `brakes` disc/rim, rola) z RLS i `lww_guard`,
  synchronizowana jak reszta (`SYNC_TABLES`, Dexie v8). Rowery dodaje się na ekranie Sprzęt („+ Rower”).
- Serwis cykliczny: `data/gear_templates.json` (łańcuch, opony, klocki tarczowe/szczękowe, mleko tubeless
  dla gravel/MTB, śruby, przegląd roczny) × rowery użytkownika → `src/engine/gear.ts` (`gearTasks`, czysty TS,
  `gear.test.ts`). Klucz stanu `szablon:bikeId`; zrobione wraca na listę po `every_days` od `done_at`
  (każde odhaczenie zapisuje nową datę), „Nie dotyczy” zostaje na stałe.
- Zadania z terminami to część planu sezonu: `program.gear_tasks` (opcjonalne; generator alpejski osadza
  `data/gear_tasks_alps.json`, rower jako opis `bike_label`). Identyfikatory bez zmian, więc stan odhaczeń pasuje;
  „Kontrola łańcucha co miesiąc” przeszła do szablonu. FTP 300 nie ma zadań programu.
- **Sprzęt jest dla każdego** – flaga `gear` zniknęła z `features` (zostaje `trip`).
- **Kolizja kluczy między kontami (znaleziona przy okazji):** `gear_task_state` i `packing_state` miały klucz
  główny `id` (= identyfikator zadania / pozycji) dla całej tabeli, więc drugie konto odhaczające to samo zadanie
  trafiało w cudzy wiersz. Migracja `20260925120000_bikes.sql`: klucz `(user_id, id)`, klient robi upsert
  z `onConflict: 'user_id,id'` dla tych tabel (`USER_SCOPED_ID_TABLES`). Stary build (sprzed aktualizacji service
  workera) dostanie błąd przy wysyłce stanu zadań – znika po odświeżeniu aplikacji.
- `service_log.bike` trzyma `bikes.id`. Dane Łukasza: dwa rowery wpisane skryptem SQL (poza repo), zrobiona
  kontrola łańcucha z 24.09 przepisana na Checkpointa; dziennik serwisu był pusty.

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
