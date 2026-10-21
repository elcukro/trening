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

## Tytuł na Stravie (17.10.2026)
Po notatce `strava-webhook` może nadać jeździe tytuł i opis na Stravie (`writeStravaTitle` w `ai_note.ts`, czysta część
w `_shared/strava_title.ts`, testy `src/engine/__tests__/strava_title.test.ts`). Warunki, wszystkie naraz:
- profil ma `strava_write` (Ustawienia → Integracje → „Tytuł i opis jazdy na Stravie”, domyślnie wyłączone, per konto),
- zgoda Stravy obejmuje `activity:write` – zakres w `strava-oauth` to od 17.10 `read,activity:read_all,activity:write`;
  konto połączone wcześniej musi kliknąć „Połącz ponownie” (karta pokazuje to, gdy przełącznik jest włączony, a zakresu brak),
- tytuł jest domyślny: nazwa Stravy („Morning Ride”, „Poranna jazda”, „Indoor Cycling”…) albo nazwa treningu wysłanego na
  Bolta tego dnia (`wahoo_pushes.name`, także z „(pod dachem)”) albo nazwa z planu; **własny tytuł zawodnika nigdy nie jest ruszany**,
- jazda nie ma jeszcze `strava_activities.title_set_at` (jeden zapis na jazdę; `backfill` i ręczny `sync` nie piszą).

Model dostaje te same fakty co notatka plus gotową notatkę i odpowiada dwiema liniami `Tytuł:` / `Opis:` (bez JSON).
Przyjęcie szkicu (`checkDraft`): tytuł 6–60 znaków, opis 1–3 zdania do 320 znaków, liczby wyłącznie z faktów (`numbersOk`),
bez podpisu w tekście modelu. Dwie próby, potem tytuł z reguł (`ruleDraft`: „<plan> · <km> km · <W> W”). Podpis
„Notatki: Kolarski Trener AI” dopisuje zawsze kod (`withSignature`) jako ostatnia linia opisu. Zapis: `PUT /activities/{id}`
(`updateActivity` w `strava.ts`), nowy tytuł trafia też do `strava_activities.name`. Wywołania liczą się do limitu w `ai_calls`.

## Modele Claude 5 i myślenie (17.10.2026)
Od przełączenia na `claude-opus-5-5` model „myśli” przed odpowiedzią, a tokeny myślenia liczą się do `max_tokens`: przy 500
odpowiedź wracała bez bloku tekstu (`stop_reason: max_tokens`, tylko blok `thinking`) i notatki spadały na reguły.
Wyłączyć myślenia nie można (`thinking.type.disabled` odrzucane), więc `callClaude` wysyła `thinking: adaptive`,
`output_config.effort: low` i `max_tokens` 4000 (list tygodnia 6000). Powód zatrzymania jest w `detail`, gdy tekst pusty.

## Skrócony trening (21.10.2026)
Jazda 43 z 60 min Z2 dostała notatkę „dołożyłeś 44 minuty poza planem”, bo od 30.09 notatka odcinała plan dla jazd < 80 % planu
(próg maila `fulfilsPlan`). Teraz plan zostaje także dla **skróconego treningu**: ≥ 50 % planu (`PLAN_PARTIAL_RATIO`,
`isShortenedPlan` w `email_views.ts`) i najdłuższa jazda dnia. Podręcznik każe wtedy pisać „skrócony trening: 43 z 60 minut”.
Werdykt maila dla 50–80 %: „Skrócony trening – N % zaplanowanego czasu” (poniżej 50 % bez zmian). Mail od razu nadal od 80 %.

## Dalej
Łapka w górę / w dół pod notatką (dostrajanie podręcznika), podsumowanie tygodnia tym samym mechanizmem,
pogoda z godziny jazdy (Open-Meteo) jako fakt.
