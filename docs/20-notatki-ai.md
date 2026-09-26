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

## Kontekst historyczny (26.09.2026, wersja 6–8 zdań)
Notatka ma 6–8 zdań (90–140 słów): (1) wykonanie względem planu, (2) przebieg, (3) 2–3 zdania historii,
(4) wskazówka albo co czeka w planie (`next_planned`). Historię liczy `historyContext` w `ride_facts.ts`
(czysty TS, testy) ze wszystkich jazd konta w bazie: miejsce tej jazdy wśród ostatnich 90 dni i „najdłuższa od…”,
godziny w 4 ostatnich tygodniach, ten i poprzedni miesiąc, seria tygodni ≥ 80 % planu (plan z migawek `email_days`),
ile razy i najlepiej wykonano ten sam trening, historia FTP z testów, **EF (moc ÷ tętno) na spokojnych jazdach**
– ta jazda i 5 poprzednich (wskaźnik postępu bazy), forma CTL/ATL/TSB (obciążenie z mocy, bez niej z tętna;
tylko przy ≥ 42 dniach danych). Porównania (`derived`: EF vs średnia, CTL za 28 dni, godziny vs poprzedni miesiąc,
FTP od pierwszego testu, moc interwałów vs najlepsze wykonanie) liczy kod. Przy < 21 dniach danych model ma
napisać, że historia dopiero się buduje. Żeby historia była prawdziwa, `strava-oauth {action:'backfill'}`
(JWT albo sekret harmonogramu + `user_id`) dociąga do 400 dni jazd ze Stravy – bez próbek dla jazd starszych
niż 90 dni, 80 na wywołanie, tylko brakujące. Wykonane 26.09: Łukasz 26 jazd/rok, Ferdynand 66.

## Uruchamianie i koszt
- `strava-webhook` po imporcie nowej jazdy: notatka → mail po treningu (z notatką). Funkcja `ride-note` pisze ją ponownie
  na żądanie (JWT, własna jazda).
- Model: `claude-sonnet-5` (sekret `AI_MODEL` zmienia bez wdrożenia), klucz `ANTHROPIC_API_KEY` z osobnego workspace
  z limitem wydatków. Ok. 2,5–3 tys. tokenów wejścia (z historią) i ok. 250 wyjścia – ok. 2 grosze za notatkę, ok. 2 zł/miesiąc
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
