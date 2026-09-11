# Trening – osobisty asystent treningowy (Alpy 2027)

Dokumentacja i dane dla aplikacji webowej (PWA na iPhone), która **każdego dnia mówi, co mam zrobić** – na rowerze, na siłowni i przy stole – od września 2026 do wyjazdu w Alpy we wrześniu 2027.

## Mapa dokumentacji

| Plik | Co zawiera |
|---|---|
| [`docs/00-kontekst-i-decyzje.md`](docs/00-kontekst-i-decyzje.md) | kim jest użytkownik, cele (podjazd 8 km / 8,8% w ~57 min, 90 kg, FTP 250 W), sprzęt, decyzje, oś czasu |
| [`docs/01-zasady-treningu.md`](docs/01-zasady-treningu.md) | strefy tętna z LTHR, protokoły testów, RIR i progresja, **reguły adaptacji R1–R16**, pogoda, strategia na przełęcz |
| [`docs/02-plan-rowerowy.md`](docs/02-plan-rowerowy.md) | fazy I–V i taper, tabela 53 tygodni, biblioteka treningów rowerowych z krokami |
| [`docs/03-plan-silowy.md`](docs/03-plan-silowy.md) | Sesje A/B/C, rozgrzewka, kalendarz ćwiczeń tydzień po tygodniu, cele siłowe, biblioteka ćwiczeń |
| [`docs/04-zywienie-i-masa.md`](docs/04-zywienie-i-masa.md) | redukcja 105 → 90 kg, deficyt wg fazy i typu dnia, białko, paliwo na rowerze |
| [`docs/05-kalendarz-sezonu.md`](docs/05-kalendarz-sezonu.md) | kluczowe daty, tydzień po tygodniu, format `calendar.json` |
| [`docs/06-sprzet-i-serwis.md`](docs/06-sprzet-i-serwis.md) | Checkpoint i Dogma, zadania serwisowe z terminami, checklista wyjazdowa |
| [`docs/07-specyfikacja-aplikacji.md`](docs/07-specyfikacja-aplikacji.md) | **specyfikacja aplikacji**: architektura, silnik planu, ekrany, model danych, Strava, Wahoo, etapy, kryteria akceptacji |
| [`CLAUDE_CODE_PROMPT.md`](CLAUDE_CODE_PROMPT.md) | prompt startowy do Claude Code |

## Dane

| Plik | Co zawiera |
|---|---|
| `data/program.json` | źródło prawdy planu: strefy, fazy, treningi rowerowe (kroki z celami), ćwiczenia, tabela tygodni |
| `data/calendar.json` | kalendarz dzień po dniu (11.09.2026 → 12.09.2027) dla ustawień domyślnych – plik referencyjny do testów |
| `data/reference_generator.py` | referencyjny generator (Python) – `python3 data/reference_generator.py` odtwarza oba pliki JSON |
| `data/gear_tasks.json` | zadania sprzętowe z terminami |
| `data/packing_list.json` | checklista wyjazdowa |

## Aplikacja

Kod aplikacji (Vite + React + TypeScript, PWA) jest w `src/`. Komendy i struktura: `CLAUDE.md`. Instrukcja wdrożenia: `docs/08-wdrozenie.md`, konfiguracja Supabase: `docs/09-supabase.md`, integracje: `docs/10-strava.md` i `docs/11-wahoo.md`, powiadomienia: `docs/12-powiadomienia.md`.

## Źródła

Rozmowy z Claude z 10–11.09.2026 oraz dokument „Plan Przygotowań Alpejskich 2026/2027 – Trek Checkpoint ALR 4 (v3)” w Google Docs.
