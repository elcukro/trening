# 00 · Kontekst, cele i decyzje

> Źródło: rozmowy z Claude z 10–11.09.2026 oraz dokument „Plan Przygotowań Alpejskich 2026/2027” (Google Docs, wersja v3).
> Ten plik to „pamięć projektu”: kim jest użytkownik, do czego trenuje i jakie decyzje już zapadły. Aplikacja nie powinna ich podważać bez wyraźnej zmiany w ustawieniach.

## 1. Użytkownik (sportowiec)

| Parametr | Wartość | Uwagi |
|---|---|---|
| Imię | Luke | jedyny użytkownik aplikacji |
| Miejsce treningów | Łódź i okolice (płasko, brak długich podjazdów) | góry tylko na wyjazdowych weekendach |
| Masa ciała – start | 100–110 kg (domyślnie **105 kg**) | do potwierdzenia pierwszym ważeniem w aplikacji |
| Masa ciała – cel | **90 kg** | użytkownik uważa cel za realny |
| FTP | szacunek **200–240 W** (domyślnie 220 W), brak miernika mocy | cel: **250 W** |
| LTHR (tętno progowe) | nieznane – ustalane testem w tygodniu 1 (16.09.2026) | aplikacja przelicza strefy po każdym teście |
| Tryb życia | pełny etat, siłownia dostępna (pełna: sztangi, trap bar, Wattbike) | 60–75 min na wizytę |
| Telefon | **iPhone** | aplikacja jako PWA |
| Trenażer | **brak** – treningi rowerowe 100% na zewnątrz | wyjątek: Wattbike/rowerek na siłowni przy gołoledzi |

## 2. Cel główny i cele pośrednie

**Wyjazd rowerowy w Alpy – wrzesień 2027** (domyślna data startu w aplikacji: **sobota 11.09.2027**, edytowalna).

Profil wyjazdu: kilka dni po **120 km i 700–1500 m przewyższenia dziennie**, typowa przełęcz **8 km / 700 m / 8,8%**.

| Cel | Dziś (szacunek) | Cel na wyjazd |
|---|---|---|
| Podjazd 8 km / 8,8% | ok. 74 min (105 kg, FTP 220) | **ok. 57 min** (90 kg, FTP 250) |
| Kadencja na przełęczy | ~60 rpm na fabrycznym 40/42 („mielenie”) | **72–85 rpm** na 40/50 |
| Stosunek mocy do masy | ~2,1 W/kg | **~2,8 W/kg** |
| Prędkość przelotowa na płaskim | ~24 km/h | **30 km/h** (ok. 175–180 W na Dogmie w pozycji na klamkach) |
| Wytrzymałość | — | kilka dni z rzędu po 120 km / do 1500 m |

### Fizyka, którą aplikacja może pokazywać (kalkulator podjazdu)

Moc potrzebna do jazdy pod górę ze stałą prędkością:

```
P = ( m·g·v·sinθ + Crr·m·g·cosθ·v + ½·ρ·CdA·v³ ) / η
m = masa kolarza + 12 kg (rower + bagaż/wyposażenie), g = 9,81, θ = atan(nachylenie),
Crr = 0,005, ρ = 1,15 kg/m³, CdA = 0,45 m² (podjazd, pozycja wyprostowana), η = 0,97
```

Wyniki referencyjne (8 km, 8,8%):

| Masa kolarza | Czas przy 230 W | Moc na 7,5 km/h |
|---|---|---|
| 110 kg | 67 min | — |
| 105 kg | 64 min | 231 W |
| 100 kg | 62 min | — |
| 95 kg | 59 min | — |
| 90 kg | 56 min | 202 W |

Kluczowe wnioski z rozmowy (aplikacja powinna je komunikować):

1. **Przełożenie nie przyspiesza podjazdu.** Pozwala kręcić 72–85 rpm zamiast 60, co oszczędza kolana i pozwala pracować tlenowo. Czas zmieniają tylko **moc i masa**.
2. **−15 kg daje tyle co ok. +15% FTP.** Oba efekty razem skracają podjazd o ~17 min (74 → 57 min).
3. Na płaskim masa prawie nie ma znaczenia (30 km/h: 182 W przy 105 kg vs 176 W przy 90 kg) – liczą się moc i aerodynamika.

## 3. Sprzęt

| Sprzęt | Rola w planie | Najważniejsze fakty |
|---|---|---|
| **Trek Checkpoint ALR 4** | rower na **Alpy**, zimę, mokro, szuter, weekendy w górach, bloki z bagażem | SRAM Apex 1 11s, korba Apex 1 **Wide DUB, blat 40T X-Sync na 8 śrub (direct mount)**, koła Bontrager Paradigm (21 mm wewn., bębenek HG), otwory na błotniki, hamulce tarczowe 160 mm (**sprawdzić: SRAM HRD czy Tektro mechaniczne**) |
| **Pinarello Dogma 60.1 (60HM1K)** | rower do **80% treningów szosowych** w sezonie (sweet spot, tempo 30 km/h, długie jazdy po suchym) | pełny karbon łącznie z kołami, Dura-Ace 10s, korba Rotor 3D compact 50/34, hamulce szczękowe → **nie do Alp** (przegrzewanie obręczy przy 120 kg na długich zjazdach), **sprawdzić limit wagowy kół** |
| **Wahoo ELEMNT Bolt v2** | prowadzenie treningów na żywo | obsługuje zaplanowane treningi z celami tętna, diody LED pokazują pozycję względem celu, sygnał przy zmianie interwału |
| Pas tętna + czujnik kadencji | pomiar | posiadane |
| Miernik mocy | — | brak; opcjonalny zakup później (pedały Favero Assioma, ~1900–2200 zł) |
| Torby Ortlieb | wyjazdy | podsiodłówka, torba na ramę (wisząca), mała torba na górną rurę |

### Decyzje sprzętowe (zapadły)

- **Zestaw minimalny do Checkpointa (ok. 737 zł):** wózek przerzutki Garbaruk SRAM 11/12s (~209 zł, fabryczne kółka zostają), kaseta **SunRace CSMX80 11-50T** (kupiona/wybrana za 446 zł), łańcuch **SRAM PC-1130, 120 ogniw** (~82 zł).
  - Wynik: najlżejsze przełożenie **40/50 = 0,80** (było 40/42 = 0,95). Blat 38T **nie jest potrzebny** (różnica 5%); decyzja do rewizji po weekendzie w górach.
  - Przy montażu kasety zostaw podkładkę 1,85 mm z bębenka (kaseta „MTB-szerokości”).
- Łańcuch 10s (SRAM PC-1031) **nie pasuje** do Checkpointa; pasuje do Dogmy.
- Opony GP 5000 AS TR + tubeless na Checkpoincie **odłożone** – Dogma przejmuje trening szybkości. Decyzja o oponach na lato/Alpy w tygodniu 33 (np. GP 5000 S TR 32c).
- Przed zimą: pełne błotniki **SKS Bluemels 45** (~120 zł), oświetlenie ≥800 lm + radar.
- Na wiosnę/przed Alpami: klocki **spiekane** SRAM Road (jeśli zaciski SRAM HRD). SwissStop Disc 35 RS to klocki **organiczne**.
- Opcjonalnie Dogma: kaseta 12-30 (105 10s, ~150 zł) na polskie podjazdy – sprawdzić obecną największą zębatkę.

## 4. Decyzje treningowe (zapadły)

- Poniedziałek **całkowicie wolny**. Co **4. tydzień lżejszy** (rozładowanie).
- Siłownia **2×/tydz.** do końca marca (środa: Sesja A ciężka, piątek: Sesja B średnia), potem **1×/tydz.** (Sesja C – podtrzymanie).
- Intensywność **1 akcent rowerowy w tygodniu** (środa) + długa jazda w sobotę + pagórki w niedzielę.
- Zima: akcent na zewnątrz przy ≥ −5 °C i suchej drodze, inaczej **4×4 min na Wattbike** przed siłownią.
- Strefy liczone z **tętna progowego (LTHR)**, testy co 6–8 tygodni.
- Redukcja masy **0,4–0,5 kg/tydz.**, bez deficytu w dni ciężkie, **zero deficytu w fazie V i na wyjeździe**.
- Treningi na Bolta: docelowo eksport z aplikacji przez Wahoo Cloud API (alternatywa: JOIN / intervals.icu).

## 5. Oś czasu

| Okres | Tygodnie | Faza |
|---|---|---|
| 11–13.09.2026 | 0 | Przygotowanie (zakupy, montaż, konfiguracja) |
| 14.09 – 29.11.2026 | 1–11 | Faza I – jesienna baza i adaptacja |
| 30.11.2026 – 28.02.2027 | 12–24 | Faza II – zima: wytrzymałość i siła maksymalna |
| 01.03 – 25.04.2027 | 25–32 | Faza III – próg, tempo 30 km/h, moc |
| 26.04 – 18.07.2027 | 33–44 | Faza IV – sezon letni, góry w Polsce, back-to-back |
| 19.07 – 29.08.2027 | 45–50 | Faza V – szlif alpejski |
| 30.08 – 10.09.2027 | 51–52 | Taper |
| od 11.09.2027 | — | **Wyjazd w Alpy** |

Szczegóły dzień po dniu: [`05-kalendarz-sezonu.md`](05-kalendarz-sezonu.md) i [`../data/calendar.json`](../data/calendar.json).
