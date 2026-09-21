# 14 · Plan usprawnień (21.09.2026) – cel: FTP pod 30 km/h przez 2–3 h

Decyzja użytkownika (21.09.2026): **Alpy schodzą na drugi plan.** Celem jest wzrost FTP tak, żeby jechać
**30 km/h przez 2–3 godziny** (płaski teren, samotnie). Program w `data/` zostaje (wyjazd 11.09.2027 jako horyzont),
ale mierniki sukcesu, ekran Postępu i priorytety usprawnień idą pod ten cel. Z listy dziesięciu propozycji
odrzucono pkt 4 (wskaźnik gotowości na Alpy / symulacja przełęczy) i pkt 6 (wskaźnik gotowości z check-inu).

## 0. Diagnoza startowa (baseline) – najpierw

### Co już wiemy (Strava, stan na 21.09.2026)
Źródło: MCP Stravy (profil, strefy, lista jazd, laps, best efforts, strumienie). Jazdy **bez tętna i bez mocy z miernika**
(Strava szacuje moc z prędkości i profilu); kadencja tylko na części jazd.

| Wskaźnik | Wartość | Uwaga |
|---|---|---|
| Masa | 110 kg | profil Strava = ustawienia aplikacji |
| FTP w Stravie | **160 W** (wpisane ręcznie) | aplikacja ma `ftp_w_estimate` **220 W** – rozjazd do wyjaśnienia testem 26.09 |
| Strefy tętna w Stravie | wg HRmax 180 (Z2 121–150, Z3 151–165, Z4 166–179) | aplikacja liczy strefy z LTHR – po teście wpisać LTHR |
| Jazda 20.09 (41,6 km) | średnia w ruchu **25,8 km/h**, szac. 139 W | 18 rekordów na segmentach |
| Najlepsze 5 / 20 / 60 min (20.09) | **33,1 / 28,2 / 25,0 km/h** | z pełnego strumienia prędkości (czas zegarowy, z postojami) |
| Czas ≥ 30 km/h w tej jeździe | 24 % czasu w ruchu (≥ 27 km/h: 41 %) | cel: 100 % przez 2–3 h |
| Tour 5–9.09 („The Great Escape”) | 65–130 km/dzień, 18–20 km/h, 830–1335 m przewyższenia | kadencja średnia **58–71 rpm** – nisko |
| Objętość 11–20.09 | 8 jazd, ~228 km w 10 dni, tuż po 5-dniowym tourze | JOIN w opisach: „Overreaching/Overtraining” |
| Kadencja (maj 2026, płasko) | 78,6 rpm | cel z planu: ≥ 78 rpm |

### Ile mocy trzeba na 30 km/h
Model (płasko, bezwietrznie, 110 kg + 12 kg rower, Crr 0,005, CdA 0,40–0,45 na chwytach):
- 25,8 km/h ≈ **135 W** (zgadza się z szacunkiem Stravy 139 W),
- 30 km/h ≈ **195–215 W** ciągle; przez 2–3 h to ~85 % FTP → **FTP docelowe 230–250 W**.
- Masa wpływa tu mało (opór toczenia ≈ 50 W); decyduje moc i pozycja (CdA). −8 kg to ok. −4 W przy 30 km/h,
  ale znacząco więcej na każdym podjeździe i przy przyspieszaniu.

### Co zmierzyć w tygodniach 0–2 (do 4.10) – lista
- [ ] **Test FTP 20 min** (sobota 26.09, z miernikiem) → FTP, LTHR (średnie tętno z ostatnich 10 min), HRmax z jazdy.
- [ ] **Jazda odniesienia „30 km/h”**: 20 min płasko, możliwie równo, na chwytach, z mocą – daje parę (prędkość, moc)
      i **estymację CdA/Crr** dla kalkulatora celu (pkt 3 niżej).
- [ ] **Godzina w Z2** z tętnem i mocą (wtorek 22.09 lub piątek 25.09): rozprzężenie Pw:HR jako baza tlenowa (start).
- [ ] Tętno spoczynkowe rano przez 7 dni (check-in) – średnia wyjściowa.
- [ ] Masa: 7-dniowa średnia (check-in) – start 110 kg.
- [ ] Kadencja: średnia z jazd Z2 (cel ≥ 78 rpm; tour: 58–71).
- [x] W aplikacji: karta **„Punkt wyjścia”** w Postępie (21.09.2026) z powyższymi liczbami i datą pomiaru; kolejne pomiary
      (test co 12 tyg., jazda odniesienia co 4 tyg.) nanoszone obok – to jest miara postępu do celu.

## Kolejność wdrażania (todo)

Kolejność wynika z zależności: wszystko, co „analizuje”, potrzebuje strumieni ze Stravy i wspólnej miary obciążenia.

### 1. Strumienie ze Stravy + analiza „plan vs. wykonanie” (fundament)
- [x] `strava-webhook`/`strava-oauth sync`: po imporcie pobrać strumienie `time, watts, heart_rate, cadence, velocity_smooth, distance, grade_smooth`
      (endpoint `/activities/{id}/streams`, scope `activity:read_all` już jest) i zapisać zredukowane (co 1 s → co 5 s) w `strava_streams`
      (JSONB, tylko po stronie serwera + pobranie do Dexie na żądanie).
- [x] Silnik (`src/engine/analysis.ts`, czysty TS + testy): dopasowanie kroków treningu do strumienia
      (rozgrzewka → interwały → schłodzenie; heurystyka po mocy/tętnie, ręczna korekta przesunięcia w UI),
      dla każdego kroku: średnia i % czasu w celu (moc, tętno, kadencja), ocena ✅/⚠️/❌.
- [x] Miary jazdy: NP, IF, **TSS** (moc) → hrTSS (tętno) → RPE×czas (fallback); Pw:HR dla Z2; MMP 5 s / 1 / 5 / 20 / 60 min.
- [x] `StravaCard`: sekcja „Wykonanie” (tabela kroków + wykres mocy/tętna z pasami celu), automatyczny status dnia
      `done`/`modified`, komentarz i RPE.
- [x] Postęp: karta „Obciążenie (TSS)” – TSS tygodniami, lista jazd ze zgodnością z analizy i TSS (compliance tygodnia jako średnia po analizie – do zrobienia razem z pkt 5).

### 2. Punkt wyjścia i kalkulator celu 30 km/h
- [x] Karta „Punkt wyjścia” (pkt 0) w Postępie; wpisy ręczne + automatyczne z pkt 1.
- [x] Kalkulator: z jazdy odniesienia (prędkość, moc, masa) estymacja CdA → **moc potrzebna na 30 km/h**,
      wymagane FTP (moc / 0,85), luka do dziś (W i %) – w karcie „Punkt wyjścia”; prognoza z trendu FTP po pierwszych dwóch testach.
- [ ] Wskaźnik na ekranie Dziś/Sezon: „FTP 165 → cel 240 W · luka 75 W” zamiast tylko dni do wyjazdu.

### 3. Automatyczne FTP/LTHR i krzywa mocy
- [x] Po każdej jeździe z mocą: najlepsze 20 min × 0,95 i 60 min → jeśli > aktualne FTP o ≥ 3 %: propozycja
      „Zaktualizować FTP do X W?” na Dziś i w Postępie (jedno dotknięcie → `test_results` jak wynik testu, R11 od następnego dnia; „Nie teraz” pamiętane per jazda).
- [x] LTHR z tej samej jazdy: tętno z drugiej połowy najlepszych 20 min, gdy wysiłek jest progowy (0,95 × moc ≥ 97 % FTP).
- [x] Postęp → karta „Moc”: krzywa mocy (5 s–60 min, okna 28/90 dni), historia FTP i W/kg (masa z 7 dni) z linią celu.
- [x] Biblioteka → Strefy: kolumna W obok bpm, źródło i data FTP/LTHR w podtytule.
- [ ] Prognoza FTP z trendu – po ≥ 2 testach/propozycjach.

### 4. Obciążenie i forma (PMC)
- [x] CTL/ATL/TSB z TSS (pkt 1) – `src/engine/pmc.ts`; dzień „wykonany” bez Stravy = RPE × czas, bez RPE = TSS planowany; przyszłość: TSS planowany z kroków (kwadrat środka strefy mocy × 100 na godzinę).
- [x] Postęp → „Forma i zmęczenie”: 8 tygodni wstecz + 12 w przód (rozbieg 42 dni), rozładowania jako pasy, linia „dziś”, szczyt formy wg planu; ostrzeżenie R7, gdy CTL rośnie > 7 pkt/tydz.
- [x] Widok tygodnia: „TSS zrobione/plan” w podsumowaniu.
- [ ] Wykres do końca programu (na razie 12 tygodni – dłuższy horyzont po pierwszych tygodniach danych).

### 5. Przegląd tygodnia (niedziela wieczorem) i wyróżnienie treningu kluczowego
- [x] `push-send`: rodzaj `weekly` (niedziela 19:00, cron `trening-push-tydzien-zima/lato`) z linkiem do raportu tygodnia; treść raportu liczy klient (silnik + Dexie), powiadomienie tylko otwiera stronę.
- [x] Strona `/postep/tydzien/:monday` (`src/engine/report.ts` + `ReportPage.tsx`): godziny, TSS, jazdy/siłownie, zgodność, masa, strefy, „Co poszło nie tak”, dzień po dniu, przyszły tydzień z treningiem kluczowym; wersja miesięczna `/postep/miesiac/:YYYY-MM` z tabelą tygodni. Link „Przegląd tygodnia” w Postępie.
- [x] Tydzień: czerwona krawędź i etykieta „Klucz”; Kalendarz: ★ przed nazwą i legenda.

### 6. Odprawa przed jazdą i podsumowanie po niej (ekran Dziś)
- [x] Pogoda: Open-Meteo wprost z klienta (CORS, bez klucza, bez Edge Function), bufor 3 h w `kv`, lokalizacja i godziny startu (tydzień/weekend) w Ustawieniach → „Pogoda i pora jazdy”. `src/engine/weather.ts`: okno treningu → propozycje: pod dachem (< −10 °C odczuwalne, gołoledź = opady ≤ 1 °C) z przyciskiem „Zastosuj”, krótszy sweet spot (−5…−10 °C), upał ≥ 28 °C (R13), deszcz ≥ 50 %, wiatr ≥ 30 km/h / porywy ≥ 50, koniec po zachodzie → światła.
- [x] Ubiór wg temperatury odczuwalnej (`data/clothing.json`, 7 pasów + dodatki na deszcz/wiatr/ciemność), żywienie w liczbach (g węgli i ml na cały trening, liczba porcji ≈ 25 g, upał podnosi płyny).
- [x] Wieczorne powiadomienie prowadzi do `/dzien/<data>` z prośbą o RPE i zdanie; poranne wspomina odprawę.
- [ ] Checklista „trening na Bolcie ✓” – razem z pkt 7.

### 7. Bolt w obie strony
- [ ] `wahoo-push`: odczyt wykonanych treningów (`workouts_read`, `GET /v1/workouts?…`) → status dnia, gdy Stravy brak.
- [ ] Wskaźnik na karcie dnia: „na Bolcie ✓ / brak” (weryfikacja `workout[plan_id]`), powiadomienie wieczorem,
      gdy jutrzejszy trening nie jest na urządzeniu.
- [ ] Z miernikiem: cele mocy jako wąskie zakresy (ERG-friendly), krótsze nazwy interwałów (Bolt obcina tekst), kadencja w każdym kroku.

### 8. Siłownia: obraz ćwiczenia, film, mniej wpisywania
- [ ] `data/exercises_media.json`: dla każdego ćwiczenia (`program.json → exercises`, np. `back_squat`, `rdl`, `trap_bar_deadlift`)
      **diagram/zdjęcie** (własny prosty rysunek SVG lub zdjęcie w `public/exercises/`, offline) + **link do krótkiego filmu YT**
      z techniką (otwierany na zewnątrz, nie osadzony – offline i prywatność) + 3–4 punkty techniczne.
- [ ] Karta ćwiczenia w Bibliotece i w trybie siłowni: obraz na górze, „Pokaż technikę ▶”.
- [ ] Kalkulator talerzy przy sugerowanym ciężarze (gryf 20 kg, talerze 1,25–25), „powtórz ostatnią serię” jednym dotknięciem.
- [ ] Wykrywanie plateau (3 sesje bez progresu e1RM → propozycja zmiany RIR/objętości), wykres e1RM w karcie ćwiczenia.
- [ ] Timer przerwy z powiadomieniem systemowym przy zgaszonym ekranie (Notification z SW, tag `rest`).

### 9. Kadencja i technika pedałowania
- [ ] Po jeździe: rozkład kadencji wg stref, średnia w interwałach siłowych vs cel, trend w Z2 (cel ≥ 78 rpm).
- [ ] Plan: bloki niskiej kadencji (50–60 rpm) w Z2/SS jako kroki z celem kadencji i kontrolą wykonania (pkt 1).
- [ ] Ostrzeżenie w przeglądzie tygodnia, gdy średnia kadencja Z2 < 75 rpm dwa tygodnie z rzędu.

## Stan wdrożenia
- **21.09.2026** – pkt 0 i 1 wdrożone (commit `842bb16`): `supabase/functions/_shared/metrics.ts`, migracja `20260921120000_streams_baseline.sql`,
  `src/engine/analysis.ts`, `src/engine/baseline.ts`, `RideAnalysis.tsx`, `BaselineCard.tsx`, `LoadCard.tsx`. Import 30 dni wykonany:
  13 jazd ze strumieniami. Do analizy „plan vs wykonanie” potrzebne są jazdy z tętnem/mocą – dotychczasowe ich nie mają, więc
  pierwsze oceny pojawią się od 22.09 (pas HR) i po zamontowaniu miernika.

- **21.09.2026** – pkt 3 wdrożony: `src/engine/power.ts` (suggestFtp, powerCurve, bestEffort/lthrFromRide, ftpSeries) + testy,
  `FtpSuggestionCard`, `PowerCard`, strefy z watami. Zacznie działać od pierwszej jazdy z miernikiem (`device_watts`).

- **21.09.2026** – pkt 4 wdrożony: `src/engine/pmc.ts` (+ testy), hook `src/app/useLoad.ts` (faktyczny TSS per dzień), `PmcCard`, TSS w podsumowaniu tygodnia.

- **21.09.2026** – pkt 5 wdrożony: migracja `20260921130000_weekly_push.sql`, `push-send` z rodzajem `weekly`, `src/engine/report.ts` (+ testy), `ReportPage`.

- **22.09.2026** – pkt 6 wdrożony: `src/engine/weather.ts` (+ testy), `src/sync/weather.ts`, `BriefingCard` na ekranie dnia, `WeatherSettings`, `data/clothing.json`.

## Pracochłonność (orientacyjnie)
| # | Zakres | Nakład |
|---|---|---|
| 0 | diagnoza – pomiary + karta „Punkt wyjścia” | 0,5 dnia kodu + tydzień pomiarów |
| 1 | strumienie + analiza | 3–4 dni (największy, odblokowuje 2–5, 9) |
| 2 | kalkulator celu | 0,5–1 dzień |
| 3 | auto-FTP, MMP | 1–1,5 dnia |
| 4 | PMC | 1 dzień |
| 5 | przegląd tygodnia | 1 dzień |
| 6 | odprawa/pogoda | 1–1,5 dnia |
| 7 | Bolt w obie strony | 1 dzień |
| 8 | siłownia z mediami | 1–2 dni (+ czas na dobór filmów/rysunków) |
| 9 | kadencja | 0,5 dnia po pkt 1 |

## MCP Stravy – do czego się nadaje
Narzędzie działa w sesji Claude (pełny dostęp: `list_activities`, `get_activity_performance` z lapami i best efforts,
`get_activity_streams`, `get_athlete_zones`). **Nie zastępuje integracji w aplikacji** (aplikacja rozmawia ze Stravą
własnymi tokenami przez Edge Functions), ale pozwala:
- robić analizy ad hoc i sprawdzać, co API zwraca, zanim napiszemy kod (tak policzono baseline wyżej),
- weryfikować po wdrożeniu, czy liczby w aplikacji zgadzają się ze Stravą,
- przygotować dane historyczne (62 jazdy od IX 2024) do wykresów, zanim webhook zbierze własne.

## Otwarte pytania
- `ftp_w_estimate` 220 W w aplikacji vs 160 W w Stravie – do rozstrzygnięcia testem 26.09; do tego czasu strefy mocy
  na Bolcie liczą się z 220 W (ostrożniej: wpisać 170 W do testu).
- Czy plan faz III–V (góry, długie jazdy) ma zostać, skoro cel to płaskie 30 km/h? Propozycja: zostawić do wiosny,
  po teście w tygodniu 24 zdecydować (więcej pracy progowej / tempo zamiast wyjazdów w góry).
- Objętość 11–20.09 (8 jazd po tourze) to więcej niż plan tygodni 0–2 zakłada – tydzień „reset” ma sens.
