# 17. Program „FTP 300” (Ferdynand) i obsługa wielu programów

Powstał 24.09.2026, gdy do aplikacji doszło drugie konto. Do tego dnia aplikacja miała **jeden** program
wbudowany na sztywno; teraz każde konto ma swój (`settings.program_id`).

## Zawodnik i cel

FTP 235 W przy 73 kg (3,2 W/kg), LTHR 170, HR max 193 (obserwowane 185), masa docelowa 67 kg.
Cel: **FTP 300 W i wyższe VO2max**, horyzont lato 2027. Pięć jazd i jedna siłownia w tygodniu,
długa jazda w poniedziałek, trenażer ERG w domu.

**FTP 235 W nie jest potwierdzone.** Z 20 jazd (26.08–24.09, 30,5 h, 14 z miernikiem) najlepsze
MMP20 to 205 W, MMP60 182 W – z nich wyszłoby FTP ok. 195 W. Ale te jazdy nie były maksymalne, a
tętno mówi coś innego: 101 min przy NP 189 W ze średnim tętnem 139 (82 % LTHR) i odsprzężeniem 2,2 %
to wysiłek wyraźnie podprogowy. Dlatego **pierwszym treningiem programu jest test FTP** (tydzień 0, środa) –
dopóki go nie ma, strefy są szacunkiem.

Z danych wynikło też: naturalna kadencja **88 rpm** (85–92 na wszystkich jazdach), średnie prędkości
26–32 km/h, najdłuższa jazda 230 min / 108 km. Program startuje więc od 180 min długiej, nie od 120.
Uwaga: 3 z 20 jazd to przejazdy użytkowe (45–49 W, kadencja 47–48) – zawyżają obciążenie tygodnia.

## Struktura

Tydzień: **pn długa 3–4 h · wt wolne · śr akcent · czw Z2 · pt akcent · sob Z2 + siłownia · nd wolne**.
Siłownia po spokojnej sobocie, niedziela wolna, więc na poniedziałkową długą wchodzi ze świeżymi nogami.

| faza | tygodnie | treść |
|---|---|---|
| PREP | 0 | tydzień pomiarowy: test FTP w **niedzielę 27.09**, wcześniej tylko lekkie rozjeżdżenie |
| I | 1–11 | baza Z2 + rosnący sweet spot, test w 11 |
| II | 12–21 | interwały progowe + sweet spot, test w 21 |
| III | 22–27 | blok VO2max (3 min), objętość w dół, test w 27 |
| IV | 28–35 | próg na nowym FTP, największa objętość (10 h/tydz.) |
| V | 36–38 | ostatni blok VO2max, bez siłowni |
| TAPER | 39 | taper i test końcowy |

Rozładowanie co 4–5 tygodni (5, 9, 15, 19, 25, 31, 35). Testy FTP w tygodniach 0, 11, 21, 27 i 39.
Daty: 21.09.2026 – 27.06.2027 (`program_start` to poniedziałek tygodnia pomiarowego; plan właściwy
startuje w poniedziałek 28.09, a `trip_start` = 28.06.2027 to dzień po tygodniu z testem końcowym).
Tydzień 0 ma pustą większość dni, bo powstał w trakcie już rozpoczętego tygodnia – liczy się w nim
tylko piątkowe rozjeżdżenie i niedzielny test.

## Obsługa wielu programów w kodzie

- `src/data/program.ts` – rejestr `PROGRAMS` (`alps2027`, `ftp300`), `loadProgram(id)` z cache.
- `settings.program_id` (kolumna `profiles.program_id`, migracja `20260924210000_program_id.sql`,
  wpis w `PROFILE_MAP`). `useSettings` czyta identyfikator **z zapisu użytkownika**, a nie z domyślnych
  ustawień programu – inaczej nie dałoby się wyjść z programu domyślnego.
- `program.layout = {"mode":"fixed"}` – tygodnie po kolei od `program_start`, bez rozciągania fazy IV
  do daty celu (R14 dotyczy tylko programu alpejskiego). Tydzień 0 to pierwszy tydzień programu,
  a nie tydzień poprzedzający.
- `WeekTemplate.mon` – poniedziałek był w silniku zaszyty jako dzień wolny. Teraz szablon może go użyć;
  brak pola = wolne, więc program alpejski się nie zmienia.
- `program.bike_default` – opis roweru zamiast reguły fazowej z `bikeSuggestion`.
- `GymDaysSchema` przyjmuje dowolny dzień tygodnia (program alpejski: wed/fri, ten: jedna sesja w sobotę).
- Wybór programu: Ustawienia → „Program treningowy”. Przełączenie przebudowuje kalendarz; daty i progi
  zostają z ustawień użytkownika.
- Golden: `src/engine/__tests__/golden_ftp300.test.ts` (dzień po dniu + układ, siłownia, testy, kadencja, progresja obciążenia).
- Generowanie: `npm run data:generate` uruchamia **oba** generatory.

## Ustalenia jednego zawodnika nie wyciekają na drugiego

To był realny błąd przy pierwszej wersji: program Ferdynanda odziedziczył kadencję 80–95 i opisy
(„nie wymuszaj szybszego kręcenia”) ustalone z danych Łukasza. Teraz `reference_generator.py` ma sekcję
**PARAMETRY OSOBISTE BIBLIOTEKI** (`CAD_EASY`, `CAD_CD`, `Z2_NOTE`, `TEST_NOTE`) z wartościami
**standardowymi**, a biblioteka powstaje w funkcji `build_library()`. Program alpejski nadpisuje te
parametry w swoim `main()` przed przebudową biblioteki; każdy inny generator importuje moduł i dostaje wersję
standardową. **Przy dodawaniu kolejnego programu: nie zmieniaj wartości domyślnych, ustaw je w swoim generatorze.**

## Etykiety celu też są per program

Po pierwszym wdrożeniu drugie konto widziało „Alpy 2027” w pasku bocznym i „30 km/h przez 2–3 godziny”
na ekranie Postęp – cel pierwszego zawodnika. Teraz rejestr programów podaje `short` (etykieta sezonu)
i `goal`: `{kind:'speed', kmh}` liczy wymagane FTP z fizyki (masa, CdA z jazdy odniesienia),
a `{kind:'ftp'}` bierze je wprost z `ftp_w_goal`. `App.tsx` i `ios/screens/ProgressScreen.tsx`
czytają to z programu, nie z literałów.

## Pułapka przy pierwszym przełączeniu konta na nowy program

Jeśli aplikacja pobrała profil **starą wersją** (bez `program_id`), zrównała lokalny `updated_at`
ze zdalnym – a wtedy `syncProfile` ani nie wysyła, ani nie pobiera i wybór programu nie dociera.
Ratunek: `update public.profiles set program_id = …, updated_at = now()` (zdalny znacznik musi być
świeższy niż lokalny) albo po prostu wybór programu w Ustawieniach na urządzeniu – to zapis lokalny,
niezależny od synchronizacji.

## Znane ograniczenia

- ~~Żywienie wspólne z programem alpejskim~~ – rozwiązane 25.09.2026 (docs/18, krok 1): własna polityka
  żywienia i deficyt dobierany z masy obecnej i docelowej. Przy 73 → 67 kg, deficycie tylko w dni wolne
  (2 w tygodniu) i limicie 500 kcal wychodzi ok. 0,13 kg/tydz. – czyli ok. 68–69 kg w lipcu, nie 67.
  Świadomy wybór: jakość interwałów przed tempem chudnięcia. Etykieta dnia mówi to wprost.
- ~~Sprzęt i wyjazd globalne~~ – rozwiązane w docs/18 (krok 3: Wyjazd tylko w programie alpejskim;
  krok 4: rowery i serwis per konto).
- ~~Karta „Punkt wyjścia” wokół celu prędkościowego~~ – rozwiązane w docs/18, krok 1 (`program.goal`).
- Ustawienia → Siłownia pozwala wybrać dzień Sesji A tylko z wtorku i środy (pod program alpejski);
  dla tego programu dzień siłowni pochodzi z domyślnych ustawień programu.
