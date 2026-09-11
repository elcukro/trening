# Otwarte pytania i decyzje do potwierdzenia

Stan na 11.09.2026 (przed rozpoczęciem Etapu 1). Pozycje oznaczone **[decyzja]** to propozycje Claude Code – wymagają potwierdzenia lub zmiany przed implementacją.

## 1. Preskrypcje siłowe nie są w `program.json`
`program.json → gym_prescription_stages` zawiera tylko etykiety („tydz. 3–6”), a właściwe tabele serii/powtórzeń/RIR (funkcje `sess_A`, `sess_B`, `sess_C`, `deloadify` w `reference_generator.py`) istnieją wyłącznie w kodzie Pythona. Silnik TS musiałby je zahardkodować, co łamie zasadę „treść planu pochodzi z `data/`”.

**[decyzja]** Rozszerzyć generator o eksport `gym_prescriptions` (etap × tydzień → lista ćwiczeń z `rx`) do `program.json`; silnik TS czyta te dane, a `calendar.json` pozostaje bez zmian (ten sam wynik). Wersja programu bez zmian, bo plan się nie zmienia – tylko format danych.

## 2. R14 (zmiana daty wyjazdu) nie ma implementacji referencyjnej
Generator iteruje sztywno 53 tygodnie i używa `trip_start` tylko do ucięcia kalendarza. Reguła R14 istnieje wyłącznie jako opis w `01-zasady-treningu.md`. Brakuje algorytmu rozciągania/skracania fazy IV.

**[decyzja]** Algorytm: taper = tydzień zawierający `trip_start` + poprzedni (2 tygodnie); faza V = 6 tygodni przed taperem (szablony tygodni 45–50); faza IV = od 26.04.2027 do początku fazy V. Gdy faza IV jest **dłuższa** niż 12 tygodni szablonu, dodatkowe tygodnie „build” wstawiane są przed ostatnim rozładowaniem (klon tygodnia 41: Z2_HEAT 90 / THR_2x20 / LONG 270 / HILLS 180, bez wydarzenia), z zachowaniem rytmu „co 4. tydzień lżejszy”. Gdy jest **krótsza**, usuwane są od końca tygodnie build bez wydarzeń (weekendy w górach i B2B zostają). Gdy zostaje < 6 tygodni, faza III jest skracana od końca z zachowaniem tygodnia testowego (29). Scenariusz 11 ze specyfikacji jest testem tego algorytmu.

## 3. `volume_scale` (R16) nie ma implementacji referencyjnej
**[decyzja]** `duration = max(min, round(duration × scale / 5) × 5)`; min 45 dla Z2/Z2_CADENCE/Z2_HEAT/HILLS, min 90 dla LONG/LONG_TEMPO. Zaokrąglenie do 5 minut. Dla `scale = 1.0` wynik identyczny z `calendar.json`.

## 4. Początek kalendarza
Generator pomija dni przed sztywną datą `2026-09-11`. **[decyzja]** W silniku: pierwszy dzień = `program_start − 3 dni` (piątek tygodnia 0); dla domyślnych ustawień daje 11.09.2026.

## 5. `gym_days` – wariant wtorek/piątek
Specyfikacja przewiduje `gym_days: {A: "tue"}`, generator obsługuje tylko śr/pt. **[decyzja]** Silnik obsługuje ustawienie (A/C w wybrany dzień, B w piątek); dla domyślnych ustawień bez zmian. Wybór dnia nie zmienia treści sesji.

## 6. Dozwolony e-mail (Supabase Auth)
Aplikacja ma wpuszczać jeden adres. Zakładam `elcukro@gmail.com` – wpisywany do zmiennej `ALLOWED_EMAIL` w sekretach Supabase, nie do repozytorium. **Potwierdź.**

## 7. Supabase CLI
Nie ma `supabase` w PATH. Instrukcja: `brew install supabase/tap/supabase`. Migracje i `config.toml` przygotuję bez lokalnego uruchomienia, jeśli CLI nadal nie będzie.

## 8. Do potwierdzenia z rozmowy (z notatki użytkownika)
- Masa startowa 105 kg (zakres 100–110) – potwierdzana pierwszym ważeniem w aplikacji.
- Objętość latem 12–15 h/tydz. – `volume_scale` pozwala skrócić.
- Protokół testu 30 min (LTHR = średnia z minut 10–30) – przyjęty jako obowiązujący.
