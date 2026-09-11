# 05 · Kalendarz sezonu

Kalendarz jest **deterministyczny**: dla danej daty i ustawień zawsze daje ten sam plan dnia. Źródło prawdy: `data/reference_generator.py` → `data/calendar.json` (dla ustawień domyślnych: start programu **14.09.2026**, wyjazd **11.09.2027**).

## 1. Kluczowe daty

| Data | Co |
|---|---|
| 11–13.09.2026 | tydzień 0: przygotowanie, montaż napędu, konfiguracja aplikacji |
| **śr 16.09.2026** | **pierwszy test progowy (LTHR)** + pierwsza Sesja A |
| 28.10.2026 | test 2 |
| 16–22.11.2026 | przed zimą: błotniki, światła, odzież |
| 21–27.12.2026 | Święta – tydzień lżejszy |
| 30.12.2026 | test 3 (Wattbike) |
| wt 23.02 / śr 24.02.2027 | test 4 (Wattbike) + sprawdzian siłowy |
| 29.03.2027 | przejście na 1 siłownię w tygodniu (Sesja C) |
| 31.03.2027 | test 5 (teren) |
| 05–11.04.2027 | serwis wiosenny |
| 26.04.2027 | decyzja i zakup opon na lato/Alpy |
| 15–16.05.2027 | weekend w górach #1 – Karkonosze |
| 26.05.2027 | test 6 |
| 05–06.06.2027 | back-to-back #1 |
| 12–13.06.2027 | weekend w górach #2 – Beskid Śląski |
| 03–04.07.2027 | back-to-back #2 |
| 10–11.07.2027 | weekend w górach #3 – Pradziad / Tatry słowackie |
| 21.07.2027 | test 7 (ostatni) |
| 31.07–01.08.2027 | back-to-back #3 z bagażem |
| 07–08.08.2027 | weekend w górach #4 – generalka |
| 09–15.08.2027 | serwis przedwyjazdowy |
| 20–22.08.2027 | blok 3-dniowy (pt–nd) |
| 25.08.2027 | ostatnia siłownia z nogami |
| 30.08.2027 | start taperu |
| 09.09.2027 | pakowanie |
| **sob 11.09.2027** | **wyjazd w Alpy** |

Weekendy w górach i back-to-back to propozycje – użytkownik może je przesuwać (R15), aplikacja pilnuje R9.

## 2. Tydzień po tygodniu

| Tydz. | Daty | Faza | Typ | Jazda | Wydarzenia i uwagi |
|---|---|---|---|---|---|
| 0 | 11.09–13.09 | PREP | prep | 4.5 h | Tydzień przygotowawczy: zamów/zamontuj napęd (wózek Garbaruk, SunRace 11-50, PC-1130 120 ogn.), ustaw aplikację i profil, sprawdź wagę startową. |
| 1 | 14.09–20.09 | I | test | 6.2 h | Pierwszy test progowy → wpisz LTHR i ustaw strefy tętna w aplikacji ELEMNT. Siłownia celowo lekko (RIR 4). |
| 2 | 21.09–27.09 | I | build | 6.4 h |  |
| 3 | 28.09–04.10 | I | build | 7.4 h |  |
| 4 | 05.10–11.10 | I | build | 7.6 h |  |
| 5 | 12.10–18.10 | I | build | 8.3 h |  |
| 6 | 19.10–25.10 | I | deload | 5.0 h |  |
| 7 | 26.10–01.11 | I | test | 8.0 h |  |
| 8 | 02.11–08.11 | I | build | 8.3 h |  |
| 9 | 09.11–15.11 | I | build | 8.9 h |  |
| 10 | 16.11–22.11 | I | deload | 5.2 h | Przed zimą: pełne błotniki SKS Bluemels 45 na Checkpoincie, oświetlenie ≥800 lm + radar, odzież zimowa. |
| 11 | 23.11–29.11 | I | build | 8.5 h |  |
| 12 | 30.11–06.12 | II | build | 6.8 h | Zima: domyślnie Checkpoint z błotnikami. Środowy akcent na zewnątrz tylko przy ≥ −5 °C i suchej drodze – inaczej INDOOR_4x4 przed Sesją A. |
| 13 | 07.12–13.12 | II | build | 7.9 h |  |
| 14 | 14.12–20.12 | II | build | 8.2 h |  |
| 15 | 21.12–27.12 | II | deload | 5.2 h | Święta – tydzień lżejszy. |
| 16 | 28.12–03.01 | II | test | 7.3 h | Test zimowy – domyślnie Wattbike (FTP + LTHR). Jeśli sucho i > 0 °C, możesz zrobić test terenowy 30 min. |
| 17 | 04.01–10.01 | II | build | 8.4 h |  |
| 18 | 11.01–17.01 | II | build | 8.5 h |  |
| 19 | 18.01–24.01 | II | deload | 5.2 h |  |
| 20 | 25.01–31.01 | II | build | 8.9 h |  |
| 21 | 01.02–07.02 | II | build | 9.0 h |  |
| 22 | 08.02–14.02 | II | build | 9.7 h |  |
| 23 | 15.02–21.02 | II | deload | 5.2 h |  |
| 24 | 22.02–28.02 | II | test | 7.6 h | Tydzień sprawdzianów: we wtorek test Wattbike (świeże nogi po wolnym poniedziałku), w środę sprawdzian siłowy (przysiad i trap bar 1×5 RIR 1) + luźne Z2. Porównaj wyniki z celami na koniec lutego. |
| 25 | 01.03–07.03 | III | build | 8.3 h |  |
| 26 | 08.03–14.03 | III | build | 9.2 h |  |
| 27 | 15.03–21.03 | III | build | 9.5 h | Pierwsze 100 km z blokiem tempa 30–32 km/h. |
| 28 | 22.03–28.03 | III | deload | 5.8 h |  |
| 29 | 29.03–04.04 | III | test | 10.2 h | Od teraz siłownia 1×/tydz. (Sesja C). Piątek wolny lub luźna jazda. |
| 30 | 05.04–11.04 | III | build | 10.5 h | Serwis wiosenny: klocki (spiek, jeśli zaciski SRAM HRD), płyn hamulcowy, zużycie łańcucha; przegląd Dogmy. |
| 31 | 12.04–18.04 | III | build | 10.5 h |  |
| 32 | 19.04–25.04 | III | deload | 5.8 h |  |
| 33 | 26.04–02.05 | IV | build | 10.3 h | Decyzja o oponach na lato/Alpy dla Checkpointa (GP 5000 S TR 32c z dętkami lub AS TR 35c) – kup w tym tygodniu. |
| 34 | 03.05–09.05 | IV | build | 10.5 h |  |
| 35 | 10.05–16.05 | IV | build | 11.0 h | **Weekend w górach #1: Karkonosze (Kowary → Przełęcz Okraj; Przesieka → Przełęcz Karkonoska). Checkpoint.** |
| 36 | 17.05–23.05 | IV | deload | 6.0 h |  |
| 37 | 24.05–30.05 | IV | test | 11.0 h |  |
| 38 | 31.05–06.06 | IV | build | 13.5 h | **Weekend back-to-back #1: sobota 120 km / 1000 m, niedziela 120 km / 1200 m.** |
| 39 | 07.06–13.06 | IV | build | 11.5 h | **Weekend w górach #2: Beskid Śląski (Przełęcz Salmopolska, Kubalonka, Koniaków).** |
| 40 | 14.06–20.06 | IV | deload | 6.0 h |  |
| 41 | 21.06–27.06 | IV | build | 11.3 h |  |
| 42 | 28.06–04.07 | IV | build | 14.3 h | **Weekend back-to-back #2.** |
| 43 | 05.07–11.07 | IV | build | 11.8 h | **Weekend w górach #3: Pradziad (CZ, Jeseniki) lub Tatry słowackie – najdłuższe dostępne podjazdy 8–10 km.** |
| 44 | 12.07–18.07 | IV | deload | 6.0 h |  |
| 45 | 19.07–25.07 | V | test | 11.5 h | Szlif alpejski. Ostatni test przed wyjazdem – ustaw pacing na przełęcze (LTHR − 10–15 uderzeń na start). |
| 46 | 26.07–01.08 | V | build | 13.8 h | **Weekend back-to-back #3 – z docelowym bagażem (sakwy Ortlieb).** |
| 47 | 02.08–08.08 | V | build | 12.2 h | **Weekend w górach #4 – generalka: pełny sprzęt wyjazdowy, pacing i jedzenie jak w Alpach.** |
| 48 | 09.08–15.08 | V | deload | 6.0 h | Serwis przedwyjazdowy: łańcuch (miernik), klocki, opony, linki/płyn, śruby, hak przerzutki na zapas. |
| 49 | 16.08–22.08 | V | build | 14.9 h | **Blok 3-dniowy (pt–nd): 100 km + 120 km/1000 m + 120 km/1200 m – symulacja wyjazdu.** |
| 50 | 23.08–29.08 | V | build | 8.7 h | Ostatnia sesja siłowa z nogami (≥10 dni przed wyjazdem). |
| 51 | 30.08–05.09 | TAPER | taper | 6.8 h | Taper: objętość −40%, intensywność tylko w krótkich pobudzeniach. Siłownia: tylko core i mobilność. |
| 52 | 06.09–12.09 | TAPER | taper | 2.0 h | Tydzień wyjazdu. Czwartek: pakowanie wg checklisty. Sobota: start wyjazdu. |

Rozkład dni w tygodniu i treningi: `02-plan-rowerowy.md` (tabela sezonu) i `03-plan-silowy.md` (kalendarz ćwiczeń).

## 3. Format `data/calendar.json`

```jsonc
{
  "version": "2026.09.11-1",
  "settings": { /* ustawienia domyślne użyte do wygenerowania */ },
  "days": [
    {
      "date": "2026-09-16", "weekday": "wed", "week": 1,
      "phase": "I",                 // PREP | I | II | III | IV | V | TAPER
      "week_type": "test",          // prep | build | deload | test | taper
      "day_type": "key",            // rest | gym | easy | long | key | trip
      "bike": {
        "workout_id": "TEST_LTHR",  // klucz w program.json → bike_workouts
        "name": "Test progowy 30 min (LTHR)",
        "duration_min": 60,
        "bike": "Dogma na suchą szosę > 5 °C; Checkpoint na mokro, sól, szuter",
        "fallback_workout_id": null // np. INDOOR_4x4 w fazie II
      },
      "gym": {
        "session": "A", "name": "Sesja A – Siła nóg (ciężka)", "est_min": 70,
        "items": [ { "exercise": "back_squat", "block": "1",
                     "rx": { "sets": 2, "reps": 10, "rir": 4, "rest_s": 120 } } ]
      },
      "nutrition": { "energy": "maintenance", "label": "Dzień ciężki: bez deficytu, paliwo na trening",
                     "protein_g_per_kg": 1.8, "on_bike_carbs_g_per_h": [0, 0], "post_workout": "…" },
      "flags": ["test"],            // test | deload | mountain_weekend | back_to_back | heat
      "week_notes": "…",            // tylko w poniedziałek tygodnia, jeśli są
      "event": "…"                  // tylko w sobotę, jeśli jest
    }
  ]
}
```

Aplikacja powinna generować ten kalendarz **w locie** z `program.json` + ustawień + nadpisań użytkownika (zamiany dni, pominięcia, gołoledź). `calendar.json` służy jako plik referencyjny do testów silnika dla ustawień domyślnych.
