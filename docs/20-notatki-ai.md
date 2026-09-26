# 20 – Notatka trenera po jeździe (26.09.2026)

2–3 zdania od „trenera” przy każdej jeździe ze Stravy – w aplikacji (karta jazdy w `/` i `/i`) i na górze maila
po treningu. Prośba Ferdynanda: jak na Stravie, bo to motywuje.

## Zasada: kod liczy, model opowiada
1. **Fakty** – `supabase/functions/_shared/ride_facts.ts` (czysty TS, testy `src/engine/__tests__/ride_facts.test.ts`):
   z próbek jazdy (co 5 s) interwały względem celu z planu (albo z nazwy jazdy „3x12”, gdy planu nie ma), spadek mocy,
   test FTP w blokach 5-minutowych, połowy jazdy, czas w strefach, czas powyżej Z2, rekordy na tle 90 dni, poprzednie
   wykonanie tego samego treningu, tydzień, check-in (oceny 1–5) i RPE. Porównania liczy kod (`derived`).
2. **Fakty dla modelu według rodzaju jazdy** (`promptFacts` w `ride_note_prompt.ts`): `test` / `intervals` / `endurance`
   – tylko pola, które mają dla niego sens (przy teście bez połówek jazdy, które fałszuje rozgrzewka).
3. **Podręcznik trenera** (`COACH_HANDBOOK`) – zasady, na których stoją programy (strefy, szara strefa, dryf tętna,
   wykonanie interwałów, test, jedzenie, regeneracja) i reguły pisania (2–3 zdania, ≤ 55 słów, bez zgadywania przyczyn).
   Do tego **ustalenia o zawodniku** z programu (`program.coach_notes`) – per konto, bez przenoszenia między zawodnikami.
4. **Weryfikacja** – każda liczba w notatce musi być w faktach (z dokładnością do wypisanych miejsc po przecinku;
   `numbersOk`), notatka ≤ 70 słów. Inaczej jedna poprawka z listą błędów, a potem notatka z reguł (`ruleNote`).

## Uruchamianie i koszt
- `strava-webhook` po imporcie nowej jazdy: notatka → mail po treningu (z notatką). Funkcja `ride-note` pisze ją ponownie
  na żądanie (JWT, własna jazda).
- Model: `claude-sonnet-5` (sekret `AI_MODEL` zmienia bez wdrożenia), klucz `ANTHROPIC_API_KEY` z osobnego workspace
  z limitem wydatków. Średnio ok. 1,8 tys. tokenów wejścia i 150 wyjścia – ok. 1 grosz za notatkę, ok. 2 zł/miesiąc
  przy dwóch zawodnikach. `ai_calls` = dziennik i limit miesięczny (`AI_MONTHLY_LIMIT`, domyślnie 300).
- Plan dnia serwer bierze z migawek `email_days` (kontekst: kroki robocze z celami, faza i jej cel, tydzień, ustalenia) –
  aplikacja wgrywa je zawsze, nie tylko przy włączonych mailach.

## Ocena modeli (26.09.2026, 9 jazd Łukasza i Ferdynanda)
- **Haiku 4.5** – czytelne, ale myliło skale (sen „3” jako 3 godziny, nogi 4/5 jako „zmęczone”), budowało ocenę testu
  z połówek jazdy zamiast z testu, zgadywało wiatr.
- **Sonnet** – poprawnie czyta skale i ustalenia („nareszcie bez tempowania” u Ferdynanda, kadencja 81 u Łukasza),
  dobrze ocenia interwały (214/216/219 W, rosnące) i test. Wybrany.
- Wnioski wdrożone w kodzie: fakty według rodzaju jazdy, etykiety skal check-inu, zakaz zgadywania przyczyn,
  weryfikacja liczb dziesiętnych, interwały z nazwy jazdy, limit słów.

## Dalej
Łapka w górę / w dół pod notatką (dostrajanie podręcznika), opis aktywności na Stravie (wymaga `activity:write`),
podsumowanie tygodnia tym samym mechanizmem, pogoda z godziny jazdy (Open-Meteo) jako fakt.
