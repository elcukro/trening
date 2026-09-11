# 02 · Plan rowerowy

Plan jest **zbudowany wstecz od wyjazdu** (wrzesień 2027) i dostosowany do: braku trenażera, płaskiej okolicy Łodzi, pełnego etatu, dwóch rowerów i redukcji masy. Wszystkie treningi są zdefiniowane maszynowo w `data/program.json` → `bike_workouts` (kroki z celami tętna jako ułamek LTHR – gotowe do eksportu na Wahoo).

## 1. Fazy

### Faza I – Jesienna baza i adaptacja (tydz. 1–11, 14.09–29.11.2026)
- **Cel:** nawyk kadencji 85–92 rpm, baza Z2, sweet spot jako jedyny akcent, start siłowni i redukcji masy, pierwsze testy (tydz. 1 i 7).
- **Tydzień:** Wt Z2 z blokiem kadencji · **Śr sweet spot** (2×10 → 2×20) + Sesja A · Czw Z2 krótko · Pt Sesja B · Sob długa 2:00 → 3:00 · Nd pagórki 1:30–2:00.
- **Rower:** Dogma po suchym, Checkpoint na mokro. Pierwsze jazdy na Checkpoincie po montażu 11-50 – sprawdź zmiany biegów na największej zębatce i ustaw śrubę B.
- Tydz. 10 (przed zimą): błotniki, światła, odzież.

### Faza II – Zima: wytrzymałość i siła maksymalna (tydz. 12–24, 30.11.2026–28.02.2027)
- **Cel:** utrzymać i poszerzyć bazę w chłodzie, sweet spot 1×/tydz. (2×15 → 3×20), siła maksymalna na siłowni, redukcja masy.
- **Tydzień:** Wt Z2 60–90 · **Śr sweet spot na zewnątrz** (≥ −5 °C, sucho) **albo INDOOR_4x4** + Sesja A · Czw Z2 · Pt Sesja B · Sob długa 2:30 → 3:30 · Nd Z2 / gravel 1:30–2:00.
- **Rower:** Checkpoint z błotnikami. Testy: tydz. 16 i 24 na Wattbike.
- Tydz. 15 (Święta) = rozładowanie. Tydz. 24 = sprawdziany (Wattbike we wtorek, siła w środę).

### Faza III – Wiosna: próg, tempo 30 km/h, moc (tydz. 25–32, 01.03–25.04.2027)
- **Cel:** interwały progowe pod górę (4×6 → 2×20), pierwsze VO2max, soboty 100 km z blokiem 3×15 min tempa 30–32 km/h, zamiana siły w moc; od tyg. 29 siłownia 1×/tydz.
- **Tydzień:** Wt Z2 75–90 · **Śr próg/VO2** + Sesja A (do tyg. 28) lub C · Czw Z2 · Pt Sesja B (do tyg. 28) / potem Z1 opcjonalnie · Sob LONG_TEMPO 3:00–3:45 · Nd pagórki 2:00–2:30.
- Tydz. 29: test terenowy. Tydz. 30: serwis wiosenny (klocki, płyn, łańcuch).

### Faza IV – Sezon letni i góry w Polsce (tydz. 33–44, 26.04–18.07.2027)
- **Cel:** długie jazdy 4–5 h, **back-to-back** (sob 120 km/1000 m + nd 120 km/1200 m), **weekendy w górach** (Karkonosze, Beskid Śląski, Pradziad/Tatry), adaptacja do upału (wtorkowe Z2 w najcieplejszej porze od czerwca), dojście do 90 kg.
- **Tydzień:** Wt Z2 90 (upał) · **Śr próg / VO2 / powtórzenia podjazdu** + Sesja C · Czw Z2 · Pt wolne (lub dojazd w góry) · Sob/Nd długie, B2B lub góry.
- Weekendy w górach: tydz. 35, 39, 43. Back-to-back: tydz. 38, 42. Test: tydz. 37.

### Faza V – Szlif alpejski (tydz. 45–50, 19.07–29.08.2027)
- **Cel:** symulacja wyjazdu z docelowym bagażem, generalka w górach (tydz. 47), **blok 3-dniowy pt–nd** (tydz. 49), ostatni test (tydz. 45), ostatnia siłownia z nogami (tydz. 50). **Zero deficytu kalorycznego.**
- Rower: Checkpoint w konfiguracji wyjazdowej.

### Taper (tydz. 51–52, 30.08–10.09.2027)
- Objętość −40%, intensywność tylko w pobudzeniach (`OPENERS`), siłownia: core i mobilność. Czwartek przed wyjazdem: pakowanie wg checklisty (`06-sprzet-i-serwis.md`). Sobota 11.09.2027: start.

## 2. Tabela sezonu (tydzień po tygodniu)

Godziny = suma planowanych jazd (bez siłowni). Szczegóły dni: `data/calendar.json`, opis: `05-kalendarz-sezonu.md`.

| Tydz. | Od | Faza | Typ | Godziny | Środa (akcent) | Siłownia | Sobota | Niedziela | Wydarzenie |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 11.09 | PREP | prep | 4.5 |  |  | LONG 120′ | Z2 90′ |  |
| 1 | 14.09 | I | test | 6.2 | TEST_LTHR | A(wed) B(fri) | LONG 120′ | HILLS 90′ |  |
| 2 | 21.09 | I | build | 6.4 | SS_2x10 | A(wed) B(fri) | LONG 135′ | HILLS 90′ |  |
| 3 | 28.09 | I | build | 7.4 | SS_3x10 | A(wed) B(fri) | LONG 150′ | HILLS 105′ |  |
| 4 | 05.10 | I | build | 7.6 | SS_2x15 | A(wed) B(fri) | LONG 150′ | HILLS 105′ |  |
| 5 | 12.10 | I | build | 8.3 | SS_3x12 | A(wed) B(fri) | LONG 165′ | HILLS 120′ |  |
| 6 | 19.10 | I | deload | 5.0 | DELOAD_WED | A(wed) B(fri) | LONG 105′ | Z2 75′ |  |
| 7 | 26.10 | I | test | 8.0 | TEST_LTHR | A(wed) B(fri) | LONG 165′ | HILLS 120′ |  |
| 8 | 02.11 | I | build | 8.3 | SS_2x15 | A(wed) B(fri) | LONG 180′ | HILLS 120′ |  |
| 9 | 09.11 | I | build | 8.9 | SS_3x15 | A(wed) B(fri) | LONG 180′ | HILLS 120′ |  |
| 10 | 16.11 | I | deload | 5.2 | DELOAD_WED | A(wed) B(fri) | LONG 120′ | Z2 75′ |  |
| 11 | 23.11 | I | build | 8.5 | SS_2x20 | A(wed) B(fri) | LONG 180′ | HILLS 120′ |  |
| 12 | 30.11 | II | build | 6.8 | SS_2x15 | A(wed) B(fri) | LONG 150′ | Z2 90′ |  |
| 13 | 07.12 | II | build | 7.9 | SS_3x15 | A(wed) B(fri) | LONG 165′ | Z2 105′ |  |
| 14 | 14.12 | II | build | 8.2 | SS_2x20 | A(wed) B(fri) | LONG 180′ | Z2 105′ |  |
| 15 | 21.12 | II | deload | 5.2 | DELOAD_WED | A(wed) B(fri) | LONG 120′ | Z2 75′ |  |
| 16 | 28.12 | II | test | 7.3 | WATTBIKE_TEST | A(wed) B(fri) | LONG 165′ | Z2 105′ |  |
| 17 | 04.01 | II | build | 8.4 | SS_3x15 | A(wed) B(fri) | LONG 180′ | Z2 105′ |  |
| 18 | 11.01 | II | build | 8.5 | SS_2x20 | A(wed) B(fri) | LONG 180′ | Z2 120′ |  |
| 19 | 18.01 | II | deload | 5.2 | DELOAD_WED | A(wed) B(fri) | LONG 120′ | Z2 75′ |  |
| 20 | 25.01 | II | build | 8.9 | SS_3x15 | A(wed) B(fri) | LONG 195′ | Z2 120′ |  |
| 21 | 01.02 | II | build | 9.0 | SS_2x20 | A(wed) B(fri) | LONG 195′ | Z2 120′ |  |
| 22 | 08.02 | II | build | 9.7 | SS_3x20 | A(wed) B(fri) | LONG 210′ | Z2 120′ |  |
| 23 | 15.02 | II | deload | 5.2 | DELOAD_WED | A(wed) B(fri) | LONG 120′ | Z2 75′ |  |
| 24 | 22.02 | II | test | 7.6 | Z2 | A(wed) B(fri) | LONG 180′ | Z2 120′ |  |
| 25 | 01.03 | III | build | 8.3 | THR_4x6 | A(wed) B(fri) | LONG_TEMPO 180′ | HILLS 120′ |  |
| 26 | 08.03 | III | build | 9.2 | THR_4x8 | A(wed) B(fri) | LONG_TEMPO 195′ | HILLS 135′ |  |
| 27 | 15.03 | III | build | 9.5 | THR_3x12 | A(wed) B(fri) | LONG_TEMPO 210′ | HILLS 135′ |  |
| 28 | 22.03 | III | deload | 5.8 | DELOAD_WED | A(wed) B(fri) | LONG 135′ | Z2 90′ |  |
| 29 | 29.03 | III | test | 10.2 | TEST_LTHR | C(wed) | LONG_TEMPO 210′ | HILLS 150′ |  |
| 30 | 05.04 | III | build | 10.5 | THR_2x20 | C(wed) | LONG_TEMPO 210′ | HILLS 150′ |  |
| 31 | 12.04 | III | build | 10.5 | VO2_5x3 | C(wed) | LONG_TEMPO 225′ | HILLS 150′ |  |
| 32 | 19.04 | III | deload | 5.8 | DELOAD_WED | C(wed) | LONG 135′ | Z2 90′ |  |
| 33 | 26.04 | IV | build | 10.3 | THR_3x12 | C(wed) | LONG 240′ | HILLS 150′ |  |
| 34 | 03.05 | IV | build | 10.5 | VO2_5x3 | C(wed) | LONG 240′ | HILLS 180′ |  |
| 35 | 10.05 | IV | build | 11.0 | THR_3x12 | C(wed) | MOUNTAIN_DAY 240′ | MOUNTAIN_DAY 210′ | Weekend w górach #1 |
| 36 | 17.05 | IV | deload | 6.0 | DELOAD_WED | C(wed) | LONG 150′ | Z2 90′ |  |
| 37 | 24.05 | IV | test | 11.0 | TEST_LTHR | C(wed) | LONG 270′ | HILLS 180′ |  |
| 38 | 31.05 | IV | build | 13.5 | VO2_5x3 | C(wed) | B2B_DAY 300′ | B2B_DAY 300′ | Weekend back-to-back #1 |
| 39 | 07.06 | IV | build | 11.5 | THR_2x20 | C(wed) | MOUNTAIN_DAY 270′ | MOUNTAIN_DAY 210′ | Weekend w górach #2 |
| 40 | 14.06 | IV | deload | 6.0 | DELOAD_WED | C(wed) | LONG 150′ | Z2 90′ |  |
| 41 | 21.06 | IV | build | 11.3 | THR_2x20 | C(wed) | LONG 270′ | HILLS 180′ |  |
| 42 | 28.06 | IV | build | 14.3 | CLIMB_REPEATS | C(wed) | B2B_DAY 300′ | B2B_DAY 300′ | Weekend back-to-back #2. |
| 43 | 05.07 | IV | build | 11.8 | VO2_5x3 | C(wed) | MOUNTAIN_DAY 270′ | MOUNTAIN_DAY 240′ | Weekend w górach #3 |
| 44 | 12.07 | IV | deload | 6.0 | DELOAD_WED | C(wed) | LONG 150′ | Z2 90′ |  |
| 45 | 19.07 | V | test | 11.5 | TEST_LTHR | C(wed) | LONG 300′ | HILLS 180′ |  |
| 46 | 26.07 | V | build | 13.8 | THR_2x20 | C(wed) | B2B_DAY 300′ | B2B_DAY 300′ | Weekend back-to-back #3 – z docelowym bagażem (sakwy Ortlieb). |
| 47 | 02.08 | V | build | 12.2 | VO2_5x3 | C(wed) | MOUNTAIN_DAY 300′ | MOUNTAIN_DAY 240′ | Weekend w górach #4 – generalka |
| 48 | 09.08 | V | deload | 6.0 | DELOAD_WED | C(wed) | LONG 150′ | Z2 90′ |  |
| 49 | 16.08 | V | build | 14.9 | THR_3x15, BLOCK_DAY1(pt) | C(wed) | B2B_DAY 270′ | B2B_DAY 270′ | Blok 3-dniowy (pt–nd) |
| 50 | 23.08 | V | build | 8.7 | VO2_4x3 | C(wed) | LONG 210′ | Z2 120′ |  |
| 51 | 30.08 | TAPER | taper | 6.8 | OPENERS | CORE(wed) | Z2 150′ | Z2 90′ |  |
| 52 | 06.09 | TAPER | taper | 2.0 | Z2 |  | TRIP 0′ | TRIP 0′ |  |

Legenda typów: `prep` przygotowanie, `build` budowa, `deload` rozładowanie, `test` tydzień testowy, `taper` taper.

## 3. Biblioteka treningów rowerowych

### Odpoczynek

#### `REST` – Odpoczynek
*czas wg kalendarza*  
Pełny dzień wolny. Spacer, sen, rozciąganie zginaczy bioder 5 min.

#### `TRAVEL_REST` – Odpoczynek / dojazd
*czas wg kalendarza*  
Dojazd w góry lub pakowanie. Bez treningu albo 20–30 min bardzo luźno.


### Regeneracja

#### `Z1_RECOVERY` – Jazda regeneracyjna
*czas wg kalendarza*  
Bardzo luźno, miękki bieg, bez podjazdów. Opcjonalna – jeśli nogi są ciężkie, lepiej odpocząć.


### Baza tlenowa

#### `Z2` – Baza tlenowa Z2
*czas wg kalendarza*  
Równe tempo w Z2, możesz rozmawiać pełnymi zdaniami. Kadencja 85–95. Bez zatrzymywania się w chłodzie.

#### `Z2_CADENCE` – Z2 + praca nad kadencją
*czas wg kalendarza*  
Z2 z blokiem kadencji: po 15 min jazdy 5×2 min przy 100–110 rpm (tętno nadal w Z2) / 2 min swobodnie. Cel: nawyk 85–92 rpm na płaskim.

#### `Z2_HEAT` – Z2 w upale (adaptacja cieplna)
*czas wg kalendarza*  
Jazda w najcieplejszej porze dnia (≥25 °C). Tętno w Z2 – prędkość będzie niższa, to normalne. 750 ml płynu/h + elektrolity. Przerwij przy zawrotach głowy.

#### `DELOAD_WED` – Tydzień lżejszy: Z2 z pobudzeniem
*czas wg kalendarza*  
60 min Z2, w środku 3×1 min Z3–Z4 z 3 min luzu. Nogi mają wyjść świeższe.


### Długie jazdy i bloki

#### `LONG` – Długa jazda
*czas wg kalendarza*  
Główny trening objętościowy. Z2, podjazdy spokojnie (max górna Z3). Jedz od 45. minuty: 60–80 g węglowodanów/h, 500–750 ml/h. Na płaskich prostych ćwicz pozycję z przedramionami równolegle do ziemi.

#### `LONG_TEMPO` – Długa jazda z tempem 30 km/h
*czas wg kalendarza*  
Z2 z blokiem tempa: w środku jazdy 3×15 min w Z3 (cel 30–32 km/h na płaskim, pozycja aero na klamkach, kadencja 88–95) / 5 min Z2. Jedzenie jak w długiej jeździe.

Blok wstawiany w środek jazdy:
- **3×** powtórz:
  - Tempo 30–32 km/h: 15 min · Z3 (90–93% LTHR) · RPE 5–6, kadencja 88–95
  - Z2: 5 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95

#### `B2B_DAY` – Blok back-to-back
*czas wg kalendarza · akcent*  
120 km z przewyższeniem 1000–1200 m. Z2, podjazdy maks. górna Z3. Następnego dnia to samo – uczysz się jechać zmęczony. Jedzenie 60–80 g węgli/h od pierwszej godziny.

#### `BLOCK_DAY1` – Blok 3-dniowy – dzień 1
*czas wg kalendarza · akcent*  
100 km spokojnie w Z2. Otwiera 3-dniowy blok symulujący wyjazd (pt–nd), najlepiej z docelowym bagażem.


### Pagórki

#### `HILLS` – Pagórki / gravel
*czas wg kalendarza*  
Teren pofałdowany lub szuter. Podjazdy w Z3 na miękkim przełożeniu (kadencja 75–85), zjazdy i płaskie w Z2. Bez „mielenia” na twardym biegu.


### Sweet spot

#### `SS_2x10` – Sweet spot 2×10 min
*55 min · akcent*  
Sweet spot: mocno, ale kontrolowanie (RPE 6–7), tętno 92–96% LTHR. Na podjeździe lub płaskim bez przerw na skrzyżowania. Kadencja 80–90.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **2×** powtórz:
  - Interwał 10 min: 10 min · SS (92–96% LTHR) · RPE 6–7, kadencja 80–90
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `SS_3x10` – Sweet spot 3×10 min
*70 min · akcent*  
Sweet spot: mocno, ale kontrolowanie (RPE 6–7), tętno 92–96% LTHR. Na podjeździe lub płaskim bez przerw na skrzyżowania. Kadencja 80–90.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **3×** powtórz:
  - Interwał 10 min: 10 min · SS (92–96% LTHR) · RPE 6–7, kadencja 80–90
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `SS_2x15` – Sweet spot 2×15 min
*65 min · akcent*  
Sweet spot: mocno, ale kontrolowanie (RPE 6–7), tętno 92–96% LTHR. Na podjeździe lub płaskim bez przerw na skrzyżowania. Kadencja 80–90.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **2×** powtórz:
  - Interwał 15 min: 15 min · SS (92–96% LTHR) · RPE 6–7, kadencja 80–90
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `SS_3x12` – Sweet spot 3×12 min
*76 min · akcent*  
Sweet spot: mocno, ale kontrolowanie (RPE 6–7), tętno 92–96% LTHR. Na podjeździe lub płaskim bez przerw na skrzyżowania. Kadencja 80–90.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **3×** powtórz:
  - Interwał 12 min: 12 min · SS (92–96% LTHR) · RPE 6–7, kadencja 80–90
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `SS_3x15` – Sweet spot 3×15 min
*85 min · akcent*  
Sweet spot: mocno, ale kontrolowanie (RPE 6–7), tętno 92–96% LTHR. Na podjeździe lub płaskim bez przerw na skrzyżowania. Kadencja 80–90.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **3×** powtórz:
  - Interwał 15 min: 15 min · SS (92–96% LTHR) · RPE 6–7, kadencja 80–90
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `SS_2x20` – Sweet spot 2×20 min
*75 min · akcent*  
Sweet spot: mocno, ale kontrolowanie (RPE 6–7), tętno 92–96% LTHR. Na podjeździe lub płaskim bez przerw na skrzyżowania. Kadencja 80–90.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **2×** powtórz:
  - Interwał 20 min: 20 min · SS (92–96% LTHR) · RPE 6–7, kadencja 80–90
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `SS_3x20` – Sweet spot 3×20 min
*100 min · akcent*  
Sweet spot: mocno, ale kontrolowanie (RPE 6–7), tętno 92–96% LTHR. Na podjeździe lub płaskim bez przerw na skrzyżowania. Kadencja 80–90.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **3×** powtórz:
  - Interwał 20 min: 20 min · SS (92–96% LTHR) · RPE 6–7, kadencja 80–90
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100


### Próg

#### `THR_4x6` – Próg pod górę 4×6 min
*65 min · akcent*  
Interwały progowe pod górę (lub pod wiatr): RPE 7–8, tętno 95–100% LTHR pod koniec interwału. Kadencja 75–85 – jak na alpejskim podjeździe, na miękkim przełożeniu.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **4×** powtórz:
  - Interwał 6 min: 6 min · THR (95–100% LTHR) · RPE 7–8, kadencja 75–85
  - Przerwa: 4 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `THR_4x8` – Próg pod górę 4×8 min
*73 min · akcent*  
Interwały progowe pod górę (lub pod wiatr): RPE 7–8, tętno 95–100% LTHR pod koniec interwału. Kadencja 75–85 – jak na alpejskim podjeździe, na miękkim przełożeniu.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **4×** powtórz:
  - Interwał 8 min: 8 min · THR (95–100% LTHR) · RPE 7–8, kadencja 75–85
  - Przerwa: 4 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `THR_3x12` – Próg pod górę 3×12 min
*76 min · akcent*  
Interwały progowe pod górę (lub pod wiatr): RPE 7–8, tętno 95–100% LTHR pod koniec interwału. Kadencja 75–85 – jak na alpejskim podjeździe, na miękkim przełożeniu.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **3×** powtórz:
  - Interwał 12 min: 12 min · THR (95–100% LTHR) · RPE 7–8, kadencja 75–85
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `THR_3x15` – Próg pod górę 3×15 min
*85 min · akcent*  
Interwały progowe pod górę (lub pod wiatr): RPE 7–8, tętno 95–100% LTHR pod koniec interwału. Kadencja 75–85 – jak na alpejskim podjeździe, na miękkim przełożeniu.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **3×** powtórz:
  - Interwał 15 min: 15 min · THR (95–100% LTHR) · RPE 7–8, kadencja 75–85
  - Przerwa: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `THR_2x20` – Próg pod górę 2×20 min
*77 min · akcent*  
Interwały progowe pod górę (lub pod wiatr): RPE 7–8, tętno 95–100% LTHR pod koniec interwału. Kadencja 75–85 – jak na alpejskim podjeździe, na miękkim przełożeniu.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **2×** powtórz:
  - Interwał 20 min: 20 min · THR (95–100% LTHR) · RPE 7–8, kadencja 75–85
  - Przerwa: 6 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `CLIMB_REPEATS` – Powtórzenia podjazdu 6–10×
*107 min · akcent*  
Symulacja długiej wspinaczki: 6–10 powtórzeń najdłuższego podjazdu w okolicy pod rząd. Ćwicz jedzenie co 20 min i równe tempo.

- Rozgrzewka: 20 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **8×** powtórz:
  - Podjazd tempem: 5 min · Z4 (94–99% LTHR) · RPE 7–8, kadencja 75–85
  - Zjazd / powrót: 4 min · Z1 (0–81% LTHR) · RPE 1–2
- Schłodzenie: 15 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100


### VO2max

#### `VO2_5x3` – VO2max 5×3 min
*60 min · akcent*  
VO2max: 3 min mocno, ale równo (RPE 9) – nie sprint na starcie. Tętno dojdzie do 103–106% LTHR dopiero w końcówce kolejnych powtórzeń. Przerwa 3 min bardzo luźno.

- Rozgrzewka: 20 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **5×** powtórz:
  - Interwał 3 min: 3 min · Z5b (103–106% LTHR) · RPE 9–9, kadencja 85–95
  - Przerwa: 3 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

#### `VO2_4x3` – VO2max 4×3 min
*54 min · akcent*  
VO2max: 3 min mocno, ale równo (RPE 9) – nie sprint na starcie. Tętno dojdzie do 103–106% LTHR dopiero w końcówce kolejnych powtórzeń. Przerwa 3 min bardzo luźno.

- Rozgrzewka: 20 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **4×** powtórz:
  - Interwał 3 min: 3 min · Z5b (103–106% LTHR) · RPE 9–9, kadencja 85–95
  - Przerwa: 3 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100


### Pod dachem

#### `INDOOR_4x4` – Wersja pod dachem: 4×4 min (Wattbike/rowerek)
*43 min · akcent*  
Na gołoledź, śnieg lub mróz poniżej −5 °C. Zastępuje środowy akcent. Po nim Sesja A na siłowni.

- Rozgrzewka: 10 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **4×** powtórz:
  - Interwał 4 min: 4 min · Z5b (103–106% LTHR) · RPE 9–9, kadencja 85–95
  - Przerwa: 3 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 85–95
- Schłodzenie: 5 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100


### Testy

#### `TEST_LTHR` – Test progowy 30 min (LTHR)
*60 min · akcent*  
Test Friela: 30 min maksymalnego równego wysiłku w pojedynkę. LTHR = średnie tętno z ostatnich 20 min. Po teście aplikacja przelicza strefy. Zimą (tydz. 16, 24) domyślnie wariant WATTBIKE_TEST.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- Luźno przed testem: 5 min · Z1 (0–81% LTHR) · RPE 1–2
- TEST 30 min – maksymalny równy wysiłek: 30 min · THR (95–100% LTHR) · RPE 9–9, kadencja 85–95
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100

Alternatywa: `WATTBIKE_TEST`

#### `WATTBIKE_TEST` – Test 20 min na Wattbike (FTP + LTHR)
*50 min · akcent*  
Wariant na siłowni (zima, gołoledź) lub dodatkowo do testu terenowego. Daje FTP w watach: FTP = 0,95 × średnia moc z 20 min; LTHR ≈ 0,97 × średnie tętno.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- Luźno: 5 min · Z1 (0–81% LTHR) · RPE 1–2
- TEST 20 min all-out (Wattbike): 20 min · Z5a (100–102% LTHR) · RPE 9–10, kadencja 85–100
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100


### Góry

#### `MOUNTAIN_DAY` – Dzień w górach
*czas wg kalendarza · akcent*  
Długie podjazdy: start 10–15 uderzeń poniżej progu, kadencja 72–85 na 40/50, jedzenie co 20 min (70–80 g węgli/h), picie 500–750 ml/h. Zjazdy: pozycja nisko, hamowanie pulsacyjne (mocno–puść), nigdy ciągłe. Test sprzętu: przełożenia, klocki, sakwy.


### Taper

#### `OPENERS` – Pobudzenie przed wyjazdem
*60 min*  
Taper: krótko i świeżo. Objętość tygodnia −40%, intensywność tylko w krótkich pobudzeniach.

- Rozgrzewka: 15 min · Z2 (81–89% LTHR) · RPE 3–4, kadencja 85–95
- **3×** powtórz:
  - Tempo 3 min: 3 min · Z4 (94–99% LTHR) · RPE 7–8, kadencja 85–95
  - Luźno: 3 min · Z1 (0–81% LTHR) · RPE 1–2
- **5×** powtórz:
  - Przyspieszenie 30 s: 30 s · Z5b (103–106% LTHR) · RPE 8–9, kadencja 95–110
  - Luźno 90 s: 1.5 min · Z1 (0–81% LTHR) · RPE 1–2
- Schłodzenie: 10 min · Z1 (0–81% LTHR) · RPE 1–2, kadencja 90–100


### Wyjazd

#### `TRIP` – Wyjazd w Alpy
*czas wg kalendarza*  
Dzień wyjazdu. Pacing, jedzenie i hamowanie wg Części „Strategia na przełęcz”.

