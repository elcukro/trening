# 03 · Plan siłowy

Założenia: pełna siłownia, znajomość techniki ze sztangą, 60–75 min na wizytę. **2 sesje w tygodniu do końca marca (tydz. 1–28), potem 1 (Sesja C) do tygodnia 50.** Tydzień 51: tylko core i mobilność w domu. Tydzień 52: bez siłowni.

Dane maszynowe: `data/program.json` → `exercises`, preskrypcje dzień po dniu: `data/calendar.json` → `days[].gym.items[]`.

## 1. Po co siłownia kolarzowi

1. **Siła maksymalna nóg i pośladków** – każdy obrót korby to mniejszy procent możliwości, więc mniej zmęczenia na godzinnym podjeździe.
2. **Stabilny tułów** – moc nie „ucieka” w bujanie na siodle i przy jeździe na stojąco.
3. **Zdrowe kolana, biodra i lędźwie** przy 10+ h tygodniowo w pozycji kolarskiej.
4. **Ochrona mięśni podczas redukcji do 90 kg.**

Nie budujemy masy górnej części ciała – góra tylko tyle, żeby trzymać postawę.

## 2. Gdzie w tygodniu

| Dzień | Rower | Siłownia | Uwagi |
|---|---|---|---|
| Pon | wolne | — | pełny odpoczynek |
| Wt | Z2 60–90 min | — | lekko |
| Śr | akcent rowerowy | **Sesja A – ciężka** (od tyg. 29: **Sesja C**) | rower rano, siłownia po południu albo po 20–30 min przerwy i posiłku |
| Czw | Z2 45–60 min lub wolne | — | regeneracja |
| Pt | — | **Sesja B – średnia** (do tyg. 28) | nogi do RIR 3, bez „zajechania” przed sobotą |
| Sob | długa jazda | — | |
| Nd | pagórki / gravel | — | |

Wariant „wtorek + piątek” (ustawienie `gym_days`): Sesja A we wtorek, Sesja B w piątek; środowy akcent rowerowy wtedy po RPE. Aplikacja pilnuje reguły **R9** (brak Sesji A 48 h przed testem, back-to-back i górami).

## 3. Rozgrzewka (wspólna, 10–12 min)

1. 5 min rowerek lub wioślarz luźno, ostatnia minuta mocniej.
2. Obwód mobilności × 2 rundy bez przerw: biodra 90/90 – 5 zmian/stronę; wykrok z rotacją (world’s greatest stretch) – 4/stronę; mostek biodrowy – 10; przysiad goblet (kettlebell 12–16 kg) z 5 s pauzą na dole – 5; band pull-apart – 15; koci grzbiet – 6.
3. Serie wstępne przed 1. ćwiczeniem: pusta sztanga × 8 → 50% × 5 → 70% × 3 → 85% × 1–2 → serie robocze.

## 4. Sesja A – „Siła nóg” (środa, ciężka, ok. 70 min)

| # | Ćwiczenie | Faza I (IX–XI) | Faza II (XII–II) | Faza III (do 28.03) | Przerwa |
|---|---|---|---|---|---|
| 1 | Przysiad ze sztangą na plecach | 2×10 RIR 4 (tydz. 1–2), potem 3×10 → 4×8 → 4×6, RIR 3, tempo 3-0-X | 4×6 → 5×5 → 5×4 → 5×3, RIR 2 (tydz. 22: RIR 1) | 3×3 RIR 2 + 3×5 wyskoków z hantlami 10–15% masy ciała | I: 2 min; II–III: 3 min |
| 2 | Martwy ciąg rumuński (RDL) → od tyg. 11 trap bar | RDL 3×10 → 3×8, RIR 3 | Trap bar 4×5 → 4×4 → 5×3, RIR 2 | Trap bar 3×3 RIR 2 + 3×8 swing kettlebell 24–32 kg | 2–3 min |
| 3A | Wiosłowanie hantlem jednorącz | 3×10/stronę | 3×8/stronę | 3×8/stronę | superseria, 60 s |
| 3B | Wspięcia na palce stojąc | 3×15, pauza 1 s na górze | 3×10, ciężej | 2×10 | 60 s |
| 4 | Core A (obwód) | Pallof press 10/str.; dead bug 8/str.; plank bokiem 30 s/str. × 3 | jw., plank bokiem 45 s | 2 rundy | 30 s |
| 5 | Schłodzenie | zginacze bioder w półklęku 45 s/str.; gołąb 45 s/str.; łydka 30 s/str. | jw. | jw. | — |

Budżet czasu: rozgrzewka 12 + przysiad 20–22 + martwy ciąg 15 + superseria 8 + core 8 + schłodzenie 5 ≈ **70 min**.

## 5. Sesja B – „Jedna noga, tułów, postawa” (piątek, średnia, ok. 68 min)

| # | Ćwiczenie | Faza I | Faza II | Faza III | Przerwa |
|---|---|---|---|---|---|
| 1 | Wejścia na skrzynię z hantlami (40–50 cm) | 3×8/nogę, RIR 3 | 4×6/nogę, RIR 2 | 3×5/nogę dynamicznie + 3×5 wskoków na skrzynię | 90 s |
| 2 | Przysiad bułgarski | 3×10/nogę | 3×8/nogę, ciężej | 2×6/nogę | 90 s |
| 3 | Hip thrust ze sztangą | 3×10, pauza 2 s | 4×8 | 3×6 | 90 s |
| 4A | Podciąganie nachwytem (lub ściąganie drążka < 5 powt.) | 3 × (max − 1) lub 3×10 | 4×6 (guma/obciążenie) | 3×6 | superseria, 60–90 s |
| 4B | Pompki (lub wyciskanie hantli na skosie) | 3×10–15 | 3×8–12 | 2×10 | 60 s |
| 5 | Core B (obwód × 3) | spacer farmera 30–40 m; wyprosty 12; Copenhagen plank 15 s/str.; plank z unoszeniem ręki 8/str. | farmer cięższy; Copenhagen 20 s | 2 rundy | 45 s |
| 6 | Schłodzenie | klatka w framudze; tył uda z gumą; zginacze bioder – po 45 s/str. | jw. | jw. | — |

## 6. Sesja C – podtrzymanie (środa, tydz. 29–50, ok. 40–45 min)

| # | Ćwiczenie | Serie × powt. | Przerwa | Uwagi |
|---|---|---|---|---|
| 0 | Rozgrzewka skrócona | 3 min rowerek + 1 runda obwodu | — | |
| 1 | Przysiad ze sztangą | 3×3, RIR 2–3 | 3 min | ciężar jak w lutym na 5 powtórzeń |
| 2 | Martwy ciąg z trap bar | 2×3, RIR 3 | 2–3 min | |
| 3 | Step-up z hantlami | 2×5/nogę, dynamicznie | 90 s | |
| 4 | Wskoki na skrzynię | 3×3 (tylko tydz. 29–33) | 60 s | schodzisz ze skrzyni |
| 5 | Core | Pallof 10/str. + plank bokiem 45 s + farmer 30 m, 2 rundy | 30 s | |

W tygodniach lżejszych (32, 36, 40, 44, 48): po 1 serii ćwiczeń głównych, bez wskoków. **Ostatnia sesja z nogami: tydzień 50 (≥ 10 dni przed wyjazdem).**

## 7. Kalendarz ćwiczeń głównych (wygenerowany z danych)

| Tydz. | Typ | Sesja (śr) | Przysiad | Zawias biodrowy | Sesja (pt) | Step-up | Hip thrust |
|---|---|---|---|---|---|---|---|
| 1 | test | A | 2×10 RIR 4 | Martwy ciąg rumuński (RDL): 2×10 RIR 4 | B | 2×8 RIR 4 | 2×10 RIR 3 |
| 2 | build | A | 2×10 RIR 4 | Martwy ciąg rumuński (RDL): 2×10 RIR 4 | B | 2×8 RIR 4 | 2×10 RIR 3 |
| 3 | build | A | 3×10 RIR 3 | Martwy ciąg rumuński (RDL): 3×10 RIR 3 | B | 3×8 RIR 3 | 3×10 RIR 2 |
| 4 | build | A | 4×8 RIR 3 | Martwy ciąg rumuński (RDL): 3×10 RIR 3 | B | 3×8 RIR 3 | 3×10 RIR 2 |
| 5 | build | A | 4×8 RIR 3 | Martwy ciąg rumuński (RDL): 3×8 RIR 3 | B | 3×8 RIR 3 | 3×10 RIR 2 |
| 6 | deload | A | 2×8 RIR 4 | Martwy ciąg rumuński (RDL): 2×8 RIR 4 | B | 2×8 RIR 4 | 2×10 RIR 3 |
| 7 | test | A | 4×8 RIR 3 | Martwy ciąg rumuński (RDL): 3×8 RIR 2–3 | B | 3×8 RIR 3 | 3×10 RIR 2 |
| 8 | build | A | 4×6 RIR 2–3 | Martwy ciąg rumuński (RDL): 3×8 RIR 2–3 | B | 3×8 RIR 3 | 3×10 RIR 2 |
| 9 | build | A | 4×6 RIR 2 | Martwy ciąg rumuński (RDL): 3×8 RIR 2–3 | B | 3×8 RIR 3 | 3×10 RIR 2 |
| 10 | deload | A | 2×6 RIR 3 | Martwy ciąg rumuński (RDL): 2×8 RIR 3–4 | B | 2×8 RIR 4 | 2×10 RIR 3 |
| 11 | build | A | 3×6 RIR 2 | Martwy ciąg z trap bar: 3×6 RIR 2 | B | 3×8 RIR 3 | 3×10 RIR 2 |
| 12 | build | A | 4×6 RIR 2 | Martwy ciąg z trap bar: 4×5 RIR 2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 13 | build | A | 5×5 RIR 2 | Martwy ciąg z trap bar: 4×5 RIR 2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 14 | build | A | 5×5 RIR 2 | Martwy ciąg z trap bar: 4×4 RIR 2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 15 | deload | A | 3×5 RIR 3 | Martwy ciąg z trap bar: 2×4 RIR 3 | B | 2×6 RIR 3 | 2×8 RIR 3 |
| 16 | test | A | 5×5 RIR 2 | Martwy ciąg z trap bar: 4×4 RIR 2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 17 | build | A | 5×4 RIR 2 | Martwy ciąg z trap bar: 4×4 RIR 2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 18 | build | A | 5×4 RIR 2 | Martwy ciąg z trap bar: 5×3 RIR 2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 19 | deload | A | 3×4 RIR 3 | Martwy ciąg z trap bar: 3×3 RIR 3 | B | 2×6 RIR 3 | 2×8 RIR 3 |
| 20 | build | A | 5×4 RIR 2 | Martwy ciąg z trap bar: 5×3 RIR 2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 21 | build | A | 5×3 RIR 2 | Martwy ciąg z trap bar: 5×3 RIR 2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 22 | build | A | 5×3 RIR 1 | Martwy ciąg z trap bar: 5×3 RIR 1–2 | B | 4×6 RIR 2 | 4×8 RIR 2 |
| 23 | deload | A | 3×3 RIR 2 | Martwy ciąg z trap bar: 3×3 RIR 2–3 | B | 2×6 RIR 3 | 2×8 RIR 3 |
| 24 | test | A | 1×5 RIR 1 | Martwy ciąg z trap bar: 1×5 RIR 1 | B | 2×6 RIR 3 | 2×8 RIR 3 |
| 25 | build | A | 3×3 RIR 2 | Martwy ciąg z trap bar: 3×3 RIR 2 | B | 3×5 RIR 2 | 3×6 RIR 2 |
| 26 | build | A | 3×3 RIR 2 | Martwy ciąg z trap bar: 3×3 RIR 2 | B | 3×5 RIR 2 | 3×6 RIR 2 |
| 27 | build | A | 3×3 RIR 2 | Martwy ciąg z trap bar: 3×3 RIR 2 | B | 3×5 RIR 2 | 3×6 RIR 2 |
| 28 | deload | A | 2×3 RIR 3 | Martwy ciąg z trap bar: 2×3 RIR 3 | B | 2×5 RIR 3 | 2×6 RIR 3 |
| 29 | test | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 30 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 31 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 32 | deload | C | 1×3 RIR 3–4 | Martwy ciąg z trap bar: 1×3 RIR 4 | — | 1×5 RIR 4 | — |
| 33 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 34 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 35 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 36 | deload | C | 1×3 RIR 3–4 | Martwy ciąg z trap bar: 1×3 RIR 4 | — | 1×5 RIR 4 | — |
| 37 | test | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 38 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 39 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 40 | deload | C | 1×3 RIR 3–4 | Martwy ciąg z trap bar: 1×3 RIR 4 | — | 1×5 RIR 4 | — |
| 41 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 42 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 43 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 44 | deload | C | 1×3 RIR 3–4 | Martwy ciąg z trap bar: 1×3 RIR 4 | — | 1×5 RIR 4 | — |
| 45 | test | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 46 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 47 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 48 | deload | C | 1×3 RIR 3–4 | Martwy ciąg z trap bar: 1×3 RIR 4 | — | 1×5 RIR 4 | — |
| 49 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 50 | build | C | 3×3 RIR 2–3 | Martwy ciąg z trap bar: 2×3 RIR 3 | — | 2×5 RIR 3 | — |
| 51 | taper | CORE | — | — | — | — | — |

Zapis: `4×6 RIR 2` = 4 serie po 6 powtórzeń z zapasem 2 powtórzeń. W tygodniach `deload` liczba serii jest już zmniejszona o 40%; ciężar −10%.

## 8. Zasady, które chronią jakość jazdy

- **48 h spokoju** przed testem, back-to-back, górami i blokiem 3-dniowym (R9).
- **Rower ma pierwszeństwo:** 2 tygodnie nieudanych akcentów przy rosnących ciężarach → −1 seria w A i B (R7).
- **Ból to nie zmęczenie:** kolano → przysiad do skrzyni lub suwnica; lędźwie → hip thrust + wyprosty zamiast martwego ciągu. Jeśli nie mija w 1–2 tygodnie – fizjoterapeuta.
- **Posiłek po siłowni:** 30–40 g białka w ciągu 1–2 h.
- **Stojące ciężary przy spadku masy są OK:** przy −0,5 kg/tydz. przysiad może stanąć na 3–4 tygodnie; utrzymanie siły przy −10 kg = wyraźny wzrost siły względnej.
- **Dzień gołoledzi w fazie II:** ok. 35 min Wattbike (`INDOOR_4x4`) przed Sesją A zastępuje akcent rowerowy.

## 9. Orientacyjne cele siłowe na koniec lutego (5 powt., RIR 1–2, przy ok. 95 kg)

| Ćwiczenie | Relatywnie | Przy 95 kg |
|---|---|---|
| Przysiad ze sztangą | 1,0–1,2 × masa ciała | 95–115 kg |
| Martwy ciąg z trap bar | 1,3–1,5 × | 125–140 kg |
| Hip thrust (8 powt.) | 1,3–1,5 × | 125–140 kg |
| Step-up (6 powt./nogę) | hantle łącznie 0,4–0,5 × | 2 × 20–24 kg |
| Podciąganie nachwytem | bez obciążenia | 5–8 powtórzeń |

To punkty odniesienia, a nie cel sam w sobie – liczy się to, co dzieje się na rowerze.

## 10. Biblioteka ćwiczeń

### `back_squat` – Przysiad ze sztangą na plecach
*Sprzęt: sztanga, stojak · jednostka: kg*  
**Po co:** Siła maksymalna nóg – każdy obrót korby to mniejszy % Twoich możliwości, mniej zmęczenia na godzinnym podjeździe.  
**Technika:**
- Stopy na szerokość bioder–barków, palce lekko na zewnątrz.
- Biodro co najmniej do wysokości kolana.
- Kolana w linii palców, nie do środka.
- Wdech w brzuch i napięcie tułowia przed zejściem; wydech po minięciu najtrudniejszego punktu.
- Tempo 3-0-X: 3 s w dół, w górę z maksymalną intencją szybkości.
**Zamienniki:** Przysiad do skrzyni (ból kolana); Wypychanie na suwnicy

### `rdl` – Martwy ciąg rumuński (RDL)
*Sprzęt: sztanga · jednostka: kg*  
**Po co:** Tylna taśma (pośladki, dwugłowe) – napęd na podjazdach i zdrowe lędźwie w pozycji kolarskiej.  
**Technika:**
- Kolana lekko ugięte i „zamrożone”.
- Biodra jadą do tyłu, sztanga sunie po udach.
- Schodzisz do mocnego rozciągnięcia tyłu uda (zwykle połowa piszczeli).
- Plecy neutralne przez cały ruch.
**Zamienniki:** Hip thrust + wyprosty (ból lędźwi)

### `trap_bar_deadlift` – Martwy ciąg z trap bar
*Sprzęt: sztanga heksagonalna · jednostka: kg*  
**Po co:** Najbezpieczniejszy ciężki martwy ciąg dla kolarza – duża siła nóg i bioder przy małym obciążeniu lędźwi.  
**Technika:**
- Wysokie uchwyty.
- Biodra wyżej niż w przysiadzie.
- „Odpychasz podłogę” nogami, plecy neutralne.
- Wydech na górze, pełny wyprost bioder bez odchylania.
**Zamienniki:** RDL; Hip thrust

### `db_row` – Wiosłowanie hantlem jednorącz
*Sprzęt: hantel, ławka · jednostka: kg · na stronę*  
**Po co:** Mięśnie, które trzymają Cię na kierownicy przez 4 h.  
**Technika:**
- Podparcie o ławkę, plecy równolegle do podłogi.
- Łokieć sunie wzdłuż żeber.
- Tułów się nie obraca.

### `calf_raise` – Wspięcia na palce stojąc
*Sprzęt: maszyna lub Smith · jednostka: kg*  
**Po co:** Łydki i ścięgna Achillesa – jazda na stojąco i długie podjazdy.  
**Technika:**
- Pięta nisko pod krawędzią stopnia.
- Pauza 1 s na górze.
- Pełny zakres ruchu.

### `pallof_press` – Pallof press
*Sprzęt: wyciąg lub guma · jednostka: reps · na stronę*  
**Po co:** Stabilny tułów – moc nie ucieka w bujanie na siodle.  
**Technika:**
- Stoisz bokiem do wyciągu.
- Wypychasz rękojeść przed klatkę i trzymasz 2 s.
- Tułów nie daje się obrócić.

### `dead_bug` – Dead bug
*Sprzęt: mata · jednostka: reps · na stronę*  
**Po co:** Kontrola miednicy i żeber – podstawa pozycji aero.  
**Technika:**
- Lędźwie przyklejone do podłogi.
- Przeciwna ręka i noga powoli w dół.
- Wydech przy wyproście.

### `side_plank` – Plank bokiem
*Sprzęt: mata · jednostka: s · na stronę*  
**Po co:** Mięśnie skośne – stabilizacja przy jeździe na stojąco.  
**Technika:**
- Ciało w jednej linii.
- Biodro wysoko.

### `step_up` – Wejścia na skrzynię z hantlami
*Sprzęt: skrzynia 40–50 cm, hantle · jednostka: kg · na stronę*  
**Po co:** Najbardziej „kolarskie” ćwiczenie: jedna noga, kąt kolana jak w górnym punkcie korby.  
**Technika:**
- Udo ok. poziomo przy stopie na skrzyni.
- Pchasz wyłącznie nogą na skrzyni – tylna się nie odbija.
- Schodzisz powoli.

### `bulgarian_split_squat` – Przysiad bułgarski
*Sprzęt: hantle, ławka · jednostka: kg · na stronę*  
**Po co:** Wyrównuje różnice siły między nogami.  
**Technika:**
- Tylna stopa na ławce.
- Ciężar głównie na przedniej nodze.
- Tułów lekko pochylony – mocniej pracują pośladki.

### `hip_thrust` – Hip thrust ze sztangą
*Sprzęt: sztanga, ławka, podkładka · jednostka: kg*  
**Po co:** Pośladki to główny silnik przy jeździe w siodle pod górę.  
**Technika:**
- Plecy oparte o ławkę.
- Broda do klatki, żebra w dół.
- Pauza 2 s na górze, ruch z pośladków, nie z lędźwi.

### `pull_up` – Podciąganie nachwytem
*Sprzęt: drążek, guma asekuracyjna · jednostka: reps*  
**Po co:** Plecy i ramiona do trzymania pozycji na klamkach.  
**Technika:**
- Pełny zwis, łopatki w dół na starcie.
- Klatka do drążka, bez bujania.
**Zamienniki:** Ściąganie drążka wyciągu (jeśli < 5 powtórzeń)

### `push_up` – Pompki
*Sprzęt: podłoga · jednostka: reps*  
**Po co:** Równoważy „zamkniętą” pozycję na rowerze – postawa, nie siła.  
**Technika:**
- Ciało w jednej linii.
- Łokcie ok. 45° od tułowia.
**Zamienniki:** Wyciskanie hantli na ławce skośnej

### `farmer_walk` – Spacer farmera
*Sprzęt: hantle lub kettlebell · jednostka: m*  
**Po co:** Nośność tułowia i chwyt.  
**Technika:**
- Hantle łącznie ok. 0,6–0,8 × masa ciała.
- Idziesz wyprostowany, krótkie kroki.

### `back_extension` – Wyprosty tułowia na ławce rzymskiej
*Sprzęt: ławka rzymska · jednostka: reps*  
**Po co:** Zdrowe lędźwie przy długich godzinach w siodle.  
**Technika:**
- Bez przeprostu na górze.
- Ruch z bioder.

### `copenhagen_plank` – Copenhagen plank
*Sprzęt: ławka · jednostka: s · na stronę*  
**Po co:** Przywodziciele stabilizują kolano w każdym obrocie korby.  
**Technika:**
- Bokiem, górna noga na ławce.
- Biodro wysoko.

### `plank_reach` – Plank przodem z unoszeniem ręki
*Sprzęt: mata · jednostka: reps · na stronę*  
**Po co:** Anty-rotacja w pozycji podporu – jak na kierownicy.  
**Technika:**
- Biodra nie rotują przy unoszeniu ręki.

### `jump_squat` – Wyskoki z hantlami
*Sprzęt: hantle · jednostka: reps*  
**Po co:** Zamiana siły w moc (Faza III).  
**Technika:**
- Hantle 10–15% masy ciała.
- Szybki skok, miękkie lądowanie.

### `kb_swing` – Swing kettlebell
*Sprzęt: kettlebell 24–32 kg · jednostka: kg*  
**Po co:** Szybki wyprost bioder – moc na podjazdach.  
**Technika:**
- Ruch z bioder, nie przysiad.
- Mocny wyprost na górze.

### `box_jump` – Wskoki na skrzynię
*Sprzęt: skrzynia · jednostka: reps*  
**Po co:** Moc i reaktywność nóg.  
**Technika:**
- Schodzisz ze skrzyni, nie zeskakujesz.
- Pełny reset między skokami.

### `mobility_circuit` – Obwód mobilności
*Sprzęt: guma, kettlebell 12–16 kg · jednostka: rounds*  
**Po co:** Przygotowanie bioder i odcinka piersiowego po godzinach w siodle i przy biurku.  
**Technika:**
- Biodra 90/90 – 5 zmian/stronę
- Wykrok z rotacją (world’s greatest stretch) – 4/stronę
- Mostek biodrowy – 10
- Przysiad goblet z 5 s pauzą na dole – 5
- Band pull-apart – 15
- Koci grzbiet – 6

### `cooldown_stretch` – Schłodzenie – rozciąganie
*Sprzęt: mata · jednostka: min*  
**Po co:** Zginacze bioder są skrócone po każdej jeździe – to rozciąganie ma dla Ciebie największe znaczenie.  
**Technika:**
- Zginacze bioder w półklęku 45 s/stronę
- Pośladek („gołąb”) 45 s/stronę
- Łydka o ścianę 30 s/stronę
- Klatka w framudze 45 s/stronę
- Tył uda z gumą 45 s/stronę

