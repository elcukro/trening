# 32 · Generator planów w TypeScript (26.10.2026)

Etap 3 przepływu produktu ([docs/30](30-flow-produktu.md)) i największa luka do wersji dla wielu użytkowników
([docs/29](29-komercjalizacja.md) § 1): plan dla **dowolnego** zawodnika, liczony z odpowiedzi onboardingu
([docs/31](31-onboarding.md)), w formacie, który silnik już rozumie. Dla nowych kont zastępuje generatory w Pythonie
(`data/reference_generator.py`, `data/ftp300_generator.py`); programy alpejski i FTP 300 zostają bez zmian, ze swoim
złotym testem.

**Zasada jak w całym projekcie: kod liczy, model opowiada.** W generatorze nie ma ani jednego tekstu z modelu. Ten sam
profil i ta sama data dają zawsze ten sam program (`GENERATOR_VERSION` rośnie przy każdej zmianie, która zmienia wynik).

## 1. Gdzie to jest

| plik | co robi |
|---|---|
| `src/engine/generator/index.ts` | `generateProgram(profile, today)` → `{ program, skeleton, layout, notes }`; `generateFromInputs(planInputs, extras, today)`; składa sekcje programu, ustawienia domyślne, `week_summary` (przez `seasonSummary` silnika) i waliduje wynik `parseProgram` |
| `src/engine/generator/structure.ts` | szkielet (`buildSkeleton`: tygodnie, fazy, rozładowania, testy, taper, budżet minut), stały układ dni (`layoutDays`), wypełnienie tygodnia (`fillWeek`), drabinki akcentów (`ladderFor`, `pickRung`) |
| `src/engine/generator/library.ts` | biblioteka treningów per dyscyplina i poziom pomiaru (`buildLibrary`), strefy, test kalibracyjny dla poziomu (`testIdFor`) |
| `src/engine/generator/texts.ts` | reguły R1–R16 jako dane z dniami zawodnika, fazy, `meta`, `goal`, żywienie, rowery, kadencja |
| `src/day/planPreview.ts` | podgląd dla ekranu „Gotowe!”: pierwszy tydzień dzień po dniu i liczby o planie |
| `src/engine/__tests__/generator.test.ts` | własności dla 160 losowych profili + regresja dwóch znanych zawodników; `PRINT=1 npx vitest run generator` wypisuje plan przykładowego profilu |

Wejście to `planInputs(profile, today)` z `src/engine/onboarding.ts` (godziny docelowe i startowe, limity dni, stałe
punkty, poziom pomiaru i progi, dyscyplina, trenażer, doświadczenie, `intensity_allowed`, `cautious`, cel, tygodnie do
celu) plus trzy pola profilu, których `planInputs` nie niesie: masa, HRmax i najdłuższa jazda z ostatniego miesiąca.

Wyjście to zwykły `Program` (`src/engine/schema.ts`) z `layout: { mode: 'fixed' }` – tygodnie po kolei od
`program_start`, jak w programie FTP 300. Silnik (`calendar.ts`, `plan.ts`, `rules.ts`, Wahoo, maile) nie wie, że
program powstał w locie.

## 2. Jak powstaje plan

### 2.1 Szkielet tygodni (`buildSkeleton`)

- **Start**: poniedziałek bieżącego tygodnia, a od piątku – następny poniedziałek (`programStart`).
- **Długość**: cel z datą → tygodnie do tygodnia z datą włącznie (min 2), ale najwyżej 52 (`horizon: 'to_goal'`); dalej
  albo bez daty → **plan kroczący** (`horizon: 'rolling'`): 16 tygodni dla mocy i tempa, `weeks` z celu „forma”,
  12 albo 16 dla powrotu po przerwie. Przy celu z datą `trip_start` = data celu i dzień celu to `TRIP` („Dzień celu”);
  przy kroczącym `trip_start` = ostatnia niedziela planu.
- **Tydzień 0 = kalibracja** (faza `PREP`): same jazdy spokojne (70 % objętości startowej) i test na końcu – w ostatnim
  dostępnym dniu, który mieści test. Bez testu, gdy zawodnik jest „ostrożny” (żółta flaga zdrowia albo powrót po przerwie –
  pierwszy test po pierwszym rozładowaniu) albo gdy ma czerwoną flagę (`intensity_allowed: false` – żadnych testów
  i akcentów w całym planie).
- **Bloki**: co `block` tygodni rozładowanie (4; 3 dla nowicjusza i ostrożnych), nigdy jako ostatni tydzień środka planu
  i nigdy dwa pod rząd. Rozładowanie: 65 % poprzedniego tygodnia budującego, akcent → `DELOAD` (Z2 z pobudzeniem),
  drugi akcent wypada, długa × 0,7.
- **Testy** co dwa bloki, w tygodniu po rozładowaniu (świeże nogi), zamiast pierwszego akcentu; nie w dwóch tygodniach
  przed taperem. Tydzień testowy ma 90 % objętości i tylko jeden akcent (test).
- **Taper** tylko przy celu z datą i celu wynikowym (wydarzenie, FTP, tempo): 2 tygodnie przy ≥ 10 tygodniach, 1 przy
  5–9 (60 % i 45 % objętości). Dla FTP/tempa ostatni tydzień kończy się testem końcowym; dla wydarzenia – pobudzenie
  (`OPENERS`) i dzień celu.
- **Fazy** zmieniają się tylko na granicy bloku. Cele wynikowe: `I` baza (sweet spot) ≈ 45 %, `II` budowa (próg) ≈ 30 %,
  `III` specyfika ≈ 25 % (przy < 6 tygodniach środka wszystko w `I`, przy < 10 tylko `I`/`II`). Masa, forma, powrót:
  `I`, a od połowy `II` przy ≥ 10 tygodniach. Czerwona flaga: cały plan w `I`.
- **Objętość**: start = `start_weekly_hours` (obecne +10 %), wzrost 10 %/tydz. (7 % nowicjusz i ostrożni) do
  `weekly_hours`; blok VO2max (cel FTP, faza III) × 0,85.

### 2.2 Stały układ dni (`layoutDays`)

Dni są takie same w każdym tygodniu – zawodnik ma wiedzieć, że „wtorek to akcent”.
- **Długa jazda** w dniu z największym limitem (remis: sobota, potem niedziela, potem późniejszy dzień). Jazda z grupą
  albo stały punkt „inne” o limicie ≥ 80 % największego staje się długą jazdą tygodnia (`GROUP_RIDE` zostaje jej nazwą).
- **Akcenty** (`keyCountFor`): 0 bez zgody na intensywność albo przy jednym dniu; 1 przy dwóch dniach, ostrożnie,
  nowicjuszu albo < 4 h; 2 przy ≥ 6 h i ≥ 4 dniach. Kolejność wyboru: dzień nieprzylegający do długiej jazdy,
  większy limit; gdy nie da się inaczej – dzień **przed** długą, nigdy dzień po niej. **Nigdy dwa akcenty dzień po
  dniu**, także przez granicę tygodnia (poniedziałkowy akcent wypada, gdy poprzedni tydzień skończył się akcentem albo
  testem w niedzielę).
- **Stałe punkty**: dojazd = `COMMUTE` (≤ 45 min, liczony do budżetu), wyścig = `RACE` jako akcent, jazda z grupą jak wyżej.
- Reszta to dni spokojne.

### 2.3 Wypełnienie tygodnia (`fillWeek`)

Kolejność: dojazdy → akcenty/test (szczebel drabinki, który mieści się w **mniejszym** z limitu dnia i reszty budżetu)
→ długa jazda (udział reszty budżetu 45–100 % zależnie od liczby dni spokojnych, ≥ 60 min, ≤ limit dnia, ≤ poprzednia
długa + 20 min, start od najdłuższej jazdy z ostatniego miesiąca) → dni spokojne proporcjonalnie do limitów, po 5 min,
żaden dłuższy od długiej, poniżej 30 min dzień wolny. Zapas budżetu po wyczerpaniu dni spokojnych idzie do długiej, do
limitu dnia. Zaokrąglenia zawsze w dół, więc **suma tygodnia nigdy nie przekracza budżetu, a dzień – swojego limitu**.

Urozmaicenie dni spokojnych: `Z2_FORCE` co drugi tydzień (szosa, gravel), `HILLS` przy ≥ 90 min (gravel, MTB),
`MTB_SKILLS` (MTB), a przy celu tempa w fazie III długa jazda ≥ 150 min to `LONG_TEMPO`.

### 2.4 Drabinki akcentów (`LADDERS`, `ladderFor`, `pickRung`)

| faza | akcent 1 | akcent 2 |
|---|---|---|
| I (baza) | sweet spot 2×10 → 3×20 | tempo 2×15 → 3×20 |
| II (budowa) | próg 4×6 → 2×20 | sweet spot |
| III, cel FTP | VO2max 4×3 → 6×3 | próg |
| III, cel tempa | próg | tempo (+ `LONG_TEMPO`) |
| III, wydarzenie | próg (górzyste ≥ 12 m/km: drugi akcent sweet spot) | tempo / sweet spot |
| ostrożnie | sweet spot | tempo |

Szczebel = numer tygodnia budującego w fazie (nowicjusz co drugi tydzień), obcięty do najwyższego, który mieści się
w czasie dnia. Taper: najniższy szczebel, ostatni tydzień `OPENERS`.

## 3. Biblioteka treningów (`buildLibrary`)

Te same identyfikatory i kształt kroków co w `data/program.json` – silnik rozpoznaje akcenty po przedrostkach
(`SS_`, `THR_`, `VO2_`, `TEST`, `FTP`), skaluje `Z2`/`LONG`/`HILLS` (R16), reguły sięgają po `Z2`, `Z1_RECOVERY`,
`INDOOR_4x4`. Nowe: `TEMPO_*`, `DELOAD`, `GROUP_RIDE`, `COMMUTE`, `RACE`, `MTB_SKILLS`, `TEST_LOOP`.

**Trzy poziomy pomiaru** (docs/30 § 3) zmieniają język opisów, nie strukturę: moc mówi w % FTP, tętno w % LTHR, odczucie
w wysiłku 1–10 i „teście rozmowy” (`intensityText`). Kroki mają zawsze cel tętna i RPE (schemat), aplikacja pokaże bpm
dopiero po wpisaniu LTHR, a waty tylko z miernikiem (`power_meter` = poziom „moc”).

**Test kalibracyjny per poziom** (`testIdFor`): `FTP_TEST` (20 min, moc), `TEST_LTHR` (30 min, tętno), `TEST_LOOP`
(stała pętla na czas 20–30 min z oceną wysiłku – miara postępu bez urządzeń). W `rules.tests` jest tylko ten jeden.

Dyscyplina zmienia opisy długiej jazdy, pagórków i interwałów (`TERRAIN`) oraz nazwę roweru domyślnego; MTB dostaje
jazdę techniczną. Kadencja standardowa 85–95 – **żadne ustalenia jednego zawodnika** (np. 80 rpm) tu nie trafiają (docs/18).

## 4. Sekcje osobiste i reguły

- `goal`: `speed` dla celu tempa (silnik liczy wymaganą moc z fizyki), `ftp` dla reszty (etykieta z celu onboardingu;
  `ftp_w_goal` = docelowe W albo szacunek +8 %).
- `nutrition`: deficyt **tylko przy celu masy** – `weight_based` (500 kcal/dzień, 0,7 % masy/tydz., udziały: dzień
  lekki 1, spokojny 0,5, akcenty i długa 0; `deficit_shares_per_week` liczony z kalendarza jak w generatorach), białko
  1,8 g/kg (1,6 bez deficytu). Przy innych celach wszystkie fazy bez deficytu. Masa docelowa = min(cel, obecna).
- `rules.text` R1–R16 z dniami zawodnika (R1: na który dzień przenieść akcent, R2: dokąd długą – i z tego
  `long_catchup_onto`), R12 z długością bloku, R14 mówi, czy plan jest do daty, czy kroczący. Numeracja jak w istniejących
  programach (R3/R7/R8/R9 nie istnieją od usunięcia siłowni).
- `default_settings`: FTP z onboardingu albo szacunek (`estimateFtp`: 2,0/2,4/2,8 W/kg wg doświadczenia, 180 W bez masy),
  LTHR/HRmax z onboardingu albo `null`, `program_id: 'generated'`, masa z profilu (75 kg, gdy nieznana – tylko do białka).
- `features`: `ftp_suggestions` przy mierniku mocy. Bez `trip`.

## 5. Testy i własności

`generator.test.ts` sprawdza dla 160 losowych profili (deterministyczny LCG; 1–7 dni, 1–20 h, wszystkie cele, poziomy,
dyscypliny, stałe punkty, flagi zdrowia):
- program przechodzi schemat, kalendarz się buduje, każdy dzień ma plan z silnika (`getDayPlan`);
- suma tygodnia ≤ dostępne godziny, dzień ≤ limit dnia, dni niedostępne wolne, dojazdy zostają dojazdami;
- nigdy dwóch akcentów dzień po dniu (w całym kalendarzu);
- rozładowanie co `block` tygodni, nigdy dwa pod rząd, flaga `deload` zgodna z typem tygodnia;
- test w tygodniu 0 (gdy wolno i jest dzień), testy tylko w tygodniach `test`, właściwy dla poziomu, co najmniej blok odstępu;
  czerwona flaga = zero testów i akcentów; ostrożnie = jeden akcent ≤ sweet spot, test nie w tygodniu 0;
- cel z datą do roku kończy plan w dniu celu; dalej albo bez daty – plan kroczący ≤ 52 tygodni;
- deficyt z masy tylko przy celu masy; poziom „odczucie” bez watów i LTHR w opisach;
- objętość rośnie ≤ 10 %/tydz. między tygodniami budującymi; wynik deterministyczny.

Regresja: profil zbliżony do zawodnika alpejskiego (5 dni, miernik, wydarzenie górskie 11.09.2027) daje 46 tygodni,
długą w sobotę, akcenty wtorek i piątek, testy co 8 tygodni, 7,5 h i długą do 4 h, fazy PREP–I–II–III–TAPER; profil
zbliżony do FTP 300 (długa w poniedziałek, trenażer, cel 300 W na 28.06.2027) daje VO2max w fazie III i test końcowy
w taperze. **Nie musi** zgadzać się z `calendar.json` – to inne plany, ułożone ręcznie.

## 6. Ekran „Gotowe!”

Po zapisie onboardingu `OnboardingScreen` trzyma profil po `finalize` i liczy `planPreview(profile, today)`:
nagłówek z liczbą tygodni i docelowymi godzinami, lista pierwszego tygodnia (dzień, nazwa jazdy, czas, podpis przy
teście), lista faz z długościami, uwagi generatora (`notes`, np. cel dalej niż rok). Bez profilu w stanie (odświeżenie)
zostaje dotychczasowy komunikat. Program **nie jest jeszcze zapisywany ani przypisywany do konta** – § 7.

## 7. Gdzie liczyć i przechowywać program konta – decyzja i wdrożenie (26.10.2026)

Rozważane były trzy drogi:

| | A. Liczony w aplikacji z profilu, bez zapisu | B. Liczony w aplikacji, zapisany jako wiersz | C. Liczony w Edge Function |
|---|---|---|---|
| co jest źródłem prawdy | `onboarding.data` + `GENERATOR_VERSION` klienta | zapisany `Program` (JSON) albo `{ inputs, version, start }` | wiersz w bazie |
| offline | tak (program w pamięci, jak dziś) | tak (Dexie) | dopiero po pobraniu |
| zmiana generatora | **plan zmienia się pod użytkownikiem** przy aktualizacji aplikacji | plan stabilny, regeneracja świadoma | stabilny |
| maile / Edge Functions | serwer nie zna planu (migawki `email_days` wgrywa aplikacja – jak dziś) | serwer czyta wiersz | serwer ma plan |
| koszt | zero migracji | migracja + Dexie + sync | dubluje silnik w Deno (odrzucone już przy Wahoo, docs/11) |

**Wdrożone: B w wariancie „parametry, nie JSON”** (decyzja użytkownika 26.10.2026).

- **Tabela `plans`** (migracja `20261026210000_plans.sql`, Dexie v11, `SYNC_TABLES` + `USER_SCOPED_ID_TABLES`): jeden
  aktywny wiersz na konto, `id = 'current'`; kolumny `inputs` (`PlanInputs`), `extras` (masa, HRmax, najdłuższa jazda),
  `generator_version`, `program_start`, `generated_for` („dziś” użyte przy generowaniu), `source`
  (`onboarding` / `change` / `coach`). LWW przez `lww_guard`, RLS „all own”. Migracja wgrana na produkcję 26.10.2026 (`supabase db push` za zgodą
  użytkownika; w worktree link do projektu trzeba skopiować z `supabase/.temp` głównego checkoutu).
- **Regeneracja w aplikacji** (`src/data/generated.ts`): `generatedProgram(row)` liczy program deterministycznie
  z wiersza (pamięć podręczna po `updated_at`), `resolveProgram(programId, row)` daje program dla identyfikatora
  z profilu: `generated` → z wiersza, inaczej plik z `data/`. `generated` bez wiersza spada na program domyślny.
- **`useSettings`** czyta wiersz `plans` jednym zapytaniem na żywo i podaje `program`, `plan` i `plan_outdated`
  (wiersz liczony inną wersją generatora – do propozycji „przelicz plan”, jeszcze bez przycisku). `useEngine` bierze
  program z `useSettings`, nie z `loadProgram`. Nowy stan oczekiwania `waiting: 'plan'` („Pobieram Twój plan…”): profil
  wskazuje `generated`, a wiersza jeszcze nie ma i tabela `plans` nie przeszła pełnego pobrania (kv `synced_tables`).
- **Onboarding** (`OnboardingScreen.save`): po `completeOnboarding` konto **bez wiersza `legacy`** (czyli nowe) albo
  konto już na `generated` zapisuje parametry planu (`savePlanFromProfile`, źródło `onboarding` przy pierwszym zapisie,
  `change` przy poprawkach z Ja) i dostaje `program_id: 'generated'` w profilu. Dwa istniejące konta (wiersz `legacy`)
  zostają przy programach alpejskim i FTP 300 – ich poprawki potrzeb nie zmieniają planu.
- Ustawienia → „Program treningowy” pokazuje pozycję `generated` z nazwą planu, gdy konto na nim jest; przełączenie na
  program z `data/` działa jak dawniej (i z powrotem tylko przez onboarding).
- E2E: `onboarding.spec.ts` sprawdza wiersz `plans`, `program_id` i dzień testu kalibracyjnego w Dziś po zapisie.

Do zrobienia później: przycisk „Przelicz plan” przy `plan_outdated`, „Coś się zmieniło” jako nowy wiersz z nowym
`generated_for` (etap 8), kasowanie wiersza przy wycofaniu zgody w onboardingu (dziś profil zostaje na `generated`
i spada na program domyślny).

## 8. Czego generator jeszcze nie robi

- Dopasowanie przez AI po onboardingu jest od 26.10.2026 (docs/33 § 8: szablony z `data/templates/`, `PlanTuning`,
  `plan-tune`, „Dlaczego taki plan”); brakuje jeszcze narzędzia trenera w czacie „zmień parametry i przelicz”.
- Nie zna pogody ani sezonu (zimą nie przenosi akcentów pod dach – robi to R4 w czasie rzeczywistym).
- Przy celu dalej niż 52 tygodnie plan obejmuje pierwszy rok bez tapera; przedłużenie = ponowne wygenerowanie.
- Nie buduje zadań sprzętowych ani listy pakowania (`gear_tasks`, `features.trip`).
- Wydarzenie bez GPX: tylko dystans i przewyższenie (decyzja 7 w docs/30 § 5).
- Cel masy liczy deficyt do końca planu, a nie do daty celu, gdy ta jest dalej niż rok.
