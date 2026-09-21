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
- [ ] W aplikacji: karta **„Punkt wyjścia”** w Postępie z powyższymi liczbami i datą pomiaru; kolejne pomiary
      (test co 12 tyg., jazda odniesienia co 4 tyg.) nanoszone obok – to jest miara postępu do celu.

## Kolejność wdrażania (todo)

Kolejność wynika z zależności: wszystko, co „analizuje”, potrzebuje strumieni ze Stravy i wspólnej miary obciążenia.

### 1. Strumienie ze Stravy + analiza „plan vs. wykonanie” (fundament)
- [ ] `strava-webhook`/`strava-oauth sync`: po imporcie pobrać strumienie `time, watts, heart_rate, cadence, velocity_smooth, distance, grade_smooth`
      (endpoint `/activities/{id}/streams`, scope `activity:read_all` już jest) i zapisać zredukowane (co 1 s → co 5 s) w `strava_streams`
      (JSONB, tylko po stronie serwera + pobranie do Dexie na żądanie).
- [ ] Silnik (`src/engine/analysis.ts`, czysty TS + testy): dopasowanie kroków treningu do strumienia
      (rozgrzewka → interwały → schłodzenie; heurystyka po mocy/tętnie, ręczna korekta przesunięcia w UI),
      dla każdego kroku: średnia i % czasu w celu (moc, tętno, kadencja), ocena ✅/⚠️/❌.
- [ ] Miary jazdy: NP, IF, **TSS** (moc) → hrTSS (tętno) → RPE×czas (fallback); Pw:HR dla Z2; MMP 5 s / 1 / 5 / 20 / 60 min.
- [ ] `StravaCard`: sekcja „Wykonanie” (tabela kroków + wykres mocy/tętna z pasami celu), automatyczny status dnia
      `done`/`modified`, komentarz i RPE.
- [ ] Postęp: „Compliance tygodnia” (kroki zaliczone / wszystkie) i lista jazd z TSS.

### 2. Punkt wyjścia i kalkulator celu 30 km/h
- [ ] Karta „Punkt wyjścia” (pkt 0) w Postępie; wpisy ręczne + automatyczne z pkt 1.
- [ ] Kalkulator: z jazdy odniesienia (prędkość, moc, masa) estymacja CdA/Crr → **moc potrzebna na 30 km/h**,
      wymagane FTP (moc / 0,85), luka do dziś (W i %), prognoza z trendu FTP.
- [ ] Wskaźnik na ekranie Dziś/Sezon: „FTP 165 → cel 240 W · luka 75 W” zamiast tylko dni do wyjazdu.

### 3. Automatyczne FTP/LTHR i krzywa mocy
- [ ] Po każdej jeździe z mocą: najlepsze 20 min × 0,95 i 60 min → jeśli > aktualne FTP o ≥ 3 %: propozycja
      „Zaktualizować FTP do 262 W?” (jedno dotknięcie → `test_results` jak wynik testu, R11 od następnego dnia).
- [ ] Analogicznie LTHR z najlepszych 20–30 min tętna przy stałej mocy.
- [ ] Postęp: wykres krzywej mocy (MMP) z historią (28/90 dni), FTP i **W/kg** na wspólnej osi z masą.
- [ ] Strefy w Bibliotece: waty i bpm obok siebie, z datą ostatniej zmiany.

### 4. Obciążenie i forma (PMC)
- [ ] CTL/ATL/TSB z TSS (pkt 1) – dni bez danych: TSS planowany × compliance; przyszłość: TSS planowany z silnika.
- [ ] Wykres w Postępie do końca programu z zaznaczonymi rozładowaniami; ostrzeżenie R7 z ATL/CTL
      (ramp rate > 7 pkt/tydz. → propozycja skrócenia).
- [ ] Widok tygodnia: planowany TSS tygodnia vs zrobiony.

### 5. Przegląd tygodnia (niedziela wieczorem) i wyróżnienie treningu kluczowego
- [ ] `push-send`: rodzaj `weekly` (niedziela 19:00) z treścią: godziny plan/wykonanie, TSS, compliance, masa (trend),
      co opuszczono, kluczowy trening przyszłego tygodnia.
- [ ] Strona `/postep/tydzien/:monday` z pełnym raportem (otwierana z powiadomienia); wersja miesięczna.
- [ ] Tydzień i Kalendarz: czwartkowy akcent wyróżniony (obramowanie/etykieta „Klucz”).

### 6. Odprawa przed jazdą i podsumowanie po niej (ekran Dziś)
- [ ] Pogoda (Open-Meteo, bez klucza; Edge Function jako proxy z pamięcią podręczną): temperatura, wiatr, opady,
      zachód słońca → automatyczne propozycje `heat` / `indoor` (progi z planu: < −10 °C 4×4 pod dachem, −5…−10 °C krótszy SS).
- [ ] Ubiór wg temperatury (tabela w `data/`), żywienie w liczbach na czas treningu (g węglowodanów/h, ml/h),
      checklista „trening na Bolcie ✓” (pkt 7).
- [ ] Wieczorne powiadomienie linkuje do konkretnej jazdy z prośbą o RPE i komentarz (pkt 1).

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
