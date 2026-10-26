# 33 · Strava – zgodność z polityką API, AI na danych Wahoo i szablony planów (26.10.2026)

Decyzje użytkownika z 26.10.2026 (po analizie w [docs/29](29-komercjalizacja.md) § 3–4):
1. **AI działa na danych Wahoo, nigdy na danych Stravy.** Wszystkie jazdy powstają na ELEMNT Bolcie i trafiają do Stravy
   z Wahoo, więc Wahoo Cloud jest źródłem dla każdej funkcji AI.
2. **Strava zostaje do analiz proceduralnych** – liczy kod, widzi tylko zawodnik, model nigdy.
3. **Szablony planów + dopasowanie przez AI po onboardingu** – model wybiera i stroi parametry generatora
   ([docs/32](32-generator-planow.md)) w granicach pilnowanych przez kod.

Zasada projektu zostaje: **kod liczy, model opowiada**. Nowa zasada: **do modelu idą wyłącznie dane z oznaczonym
źródłem innym niż Strava** (proweniencja, § 4).

## 1. Polityka Stravy – cytaty, na których stoi projekt

Źródło: [Strava API Policy](https://www.strava.com/legal/api_policy) i [API Agreement](https://www.strava.com/legal/api),
obie „Effective Date: June 1, 2026”. 26.10.2026 strava.com zwracał 503 („Strava is temporarily unavailable”), tekst
czytany z kopii Wayback z 6.10.2026 (polityka) i 16.10.2026 (umowa). Przed wysłaniem maila do Stravy sprawdzić, czy
tekst się nie zmienił.

| § | Cytat (dosłownie) | Co z tego wynika dla nas |
|---|---|---|
| Umowa 2.3 (i) | “Strava Data” means all data you access or collect from the Strava API Materials | **Strava Data = to, co przyszło z API Stravy.** Ta sama jazda pobrana z Wahoo Cloud to „Developer Application Data” (2.3 ii) – nie podlega § 5.3. Na tym stoi decyzja 1. |
| 5.3 | You may not use the Strava API Materials or Strava Data, directly or indirectly, in connection with the development, training, evaluation, or operation of any AI Application. This prohibition extends to: Any data derived from, aggregated from, anonymized from, or generated using Strava Data, in any form (including original, derivative, aggregated, anonymized, de-identified, or model-output form); and […] ingestion into a context window or working memory […] | Żadna liczba policzona ze Stravy (TSS, EF, CTL, rekordy, „ile jazd w tygodniu”, propozycja FTP ze strumieni) nie może trafić do promptu. Także pośrednio – np. FTP zaproponowane ze strumieni Stravy, a potem wpisane w snapshot. |
| 5.10 | You may not, directly or indirectly, disclose, market, sell, license, lease, or make available […] any Strava Data to any third party — including advertisers, data brokers, AI Application providers, or model developers — even if a user of your Developer Application consents. | Zgoda zawodnika nic nie zmienia. Anthropic i OpenRouter nie dostają nic ze Stravy. |
| 5.4 | You may not process or disclose Strava Data […] for the purposes of analytics, analyses, customer insight generation, or product or service improvements. You may not combine Strava Data with other customer data for these or any other purposes. | Czytamy jako zakaz analiz **po stronie dewelopera** (statystyki produktu, wiele kont naraz). Analizy treningu pokazywane samemu zawodnikowi to „operation of your Developer Application” (5.1). **Niejasne** – pytanie 2 do Stravy (§ 9). Do czasu odpowiedzi: zero metryk produktu ze Stravy, zero zestawień między kontami. |
| 5.5 | You may not store Strava Data, or any data derived from Strava Data, in any Persistent Index. The foregoing prohibits indefinite storage in […] archives, and any other storage configured to enable subsequent retrieval, query, or use. The seven-day cache permitted under Section 6.2 is not a Persistent Index […] | Także **dane pochodne** (nasze TSS, NP, krzywa mocy, `note_facts`) nie mogą leżeć dłużej niż 7 dni. Czytanie zachowawcze – § 5. |
| 6.2 | You may not retain Strava Data in your cache for longer than seven (7) days. […] Except for such limited caching, you may not store Strava Data […] | Wszystko, co przyszło ze Stravy, żyje 7 dni od pobrania. |
| 6.3 | Deletions must be reflected in your Developer Application expeditiously but in all cases within forty-eight (48) hours. | Już jest: webhook `delete` → soft delete; czyszczenie fizyczne w ramach retencji. |
| 6.4 | you may use and retain Data only so long as necessary for the purpose for which it was originally obtained. | Dotyczy też danych Wahoo – trzymamy je, bo służą do planu i analiz (cel zapisany w polityce prywatności). |
| 7.4 | Upon […] a Strava user's revocation of your Developer Application's authorization […] you must promptly and permanently delete […] all Strava Data and all Personal Data derived from Strava Data relating to the requesting or revoking user. […] within thirty (30) days | `deauthorized` z webhooka i „Rozłącz” = kasowanie wszystkich wierszy `source = 'strava'` od razu (§ 5). |
| 2.3 / 6.1 | Strava Data provided by a specific Strava user may be displayed or disclosed in your Developer Application only to that user. | RLS „own” już to zapewnia. Mail z danymi Stravy do samego zawodnika = wyświetlenie jemu (Resend jako podmiot przetwarzający z 5.10/art. 28 RODO – do polityki prywatności). |
| 5.8 | You may not charge end users, in any manner, for access to or use of the Strava API Materials or any services or functionality included in or related to the Strava API Materials […] | W wersji płatnej import i widoki ze Stravy muszą być w darmowym progu (docs/29 § 6.2 do poprawy). |
| 5.16 | You may not […] (b) operate any MCP Server, agent-mediated interface, or analogous mechanism that exposes the Strava API Materials, Strava Data, or any subset thereof | Narzędzia czatu trenera (`coachTools.ts`) nie mogą czytać danych Stravy – i nie będą (kontekst budowany tylko z Wahoo). |
| 3.5 | The Strava MCP is the sole authorized first-party agent-mediated interface […] may be used […] in connection with their personal use of their own Strava data | MCP Stravy w Claude Code użytkownika (memory: „Sprawdź Stravę zanim postawisz tezę”) to jego osobisty użytek – dozwolone, ale nie część aplikacji. |
| Umowa 7.1 | Your Developer Applications may include the option to upload activities or information to the Strava Platform | Zapis tytułu/opisu jest co do zasady dozwolony – ale § 6. |
| 3.3 | Standard Tier Applications are subject to subscription requirements […] including a requirement that the developer or specified end users maintain an active Strava subscription | Bez zmian względem docs/29. |

Pojęć „AI Application” i „Persistent Index” ani polityka, ani umowa nie definiują – pytanie 1 w § 9.

## 2. Przepływ danych po zmianie (wg źródła)

```
 ELEMNT Bolt ──► Wahoo Cloud ──┬─────────────────────────────► Strava
                               │                                  │
         webhook workout_summary + co 30 min odpytanie            │ webhook strava-webhook
                               ▼                                  ▼
                 wahoo-push {completed} / wahoo-webhook     strava_activities, strava_streams
                 summary + plik FIT → _shared/fit.ts         (source = 'strava', ≤ 7 dni od pobrania)
                               ▼                                  │
     wahoo_workouts (metryki, note) + wahoo_streams               │
     (source = 'wahoo', bez limitu – nasze dane)                  │
                               │                                  │
     ┌─────────────────────────┴──────────┐                       │
     ▼                                    ▼                       ▼
  AI: notatka, list tygodnia,      Widoki i analizy kodu (PMC, krzywa mocy, kadencja, raporty, plan vs wykonanie)
  czat trenera, tytuł, mail          = scalone jazdy `mergeRides`: kopia Wahoo wygrywa, jazda tylko ze Stravy
  (tylko source ≠ 'strava',            widoczna przez 7 dni, z notatką z reguł, bez AI
   assertAiSafe)
     │
     ▼
  Anthropic (notatki, czat, list, plan-tune) · OpenRouter (posiłki – bez danych jazd)
```

Ręczne wpisy (check-in, RPE, „nogi” z maila, test FTP wpisany przez zawodnika, odpowiedzi onboardingu) to dane
aplikacji – mogą iść do AI jak dotąd (zgoda na AI z onboardingu, docs/31).

## 3. Mapa zmian – kto dziś bierze dane Stravy do AI i co się zmienia

| Miejsce | Dziś | Po zmianie |
|---|---|---|
| `_shared/ai_note.ts` `gatherFacts` | `strava_activities` + `strava_streams` + historia ze Stravy | `gatherWahooFacts`: `wahoo_workouts` + `wahoo_streams`, historia tylko z `wahoo_workouts`; RPE tylko z logów o źródle innym niż Strava |
| `writeNote` (notatka AI) | po imporcie ze Stravy (`strava-webhook`) | po zapisie jazdy z Wahoo (webhook Wahoo / odpytanie); wynik w `wahoo_workouts.note` |
| Jazda tylko ze Stravy | notatka AI | `ruleNote` (kod, bez modelu), `note_source = 'rules'` |
| `writeStravaTitle` | AI z faktów Stravy | **wyłączone domyślnie** (§ 6): przełącznik serwera `STRAVA_WRITE_ENABLED` (brak = wyłączone) + `profiles.strava_write`; gdy włączone – tylko tekst z faktów Wahoo albo z reguł |
| `email_send.ts` `gatherWeek` / list tygodnia | `strava_activities` | `wahoo_workouts`; logi Stravy pominięte; zdanie „N jazd tylko ze Stravy – w aplikacji” dopisuje kod poza tekstem modelu |
| Mail po treningu | wyzwalany importem Stravy, z notatką AI | wyzwalany jazdą z Wahoo; jazda tylko ze Stravy → wieczorny „Dzień w liczbach” z notatką z reguł |
| `src/day/coachContext.ts` | `rides` z `db.strava_activities`, `note` AI, logi z `notes` „Strava: …” | `rides` z `db.wahoo_workouts`; logi z `source = 'strava'` bez metryk i bez nazw; `assertAiSafe` przed wysłaniem |
| `week_facts.ts`, `ride_facts.ts` `historyContext` | `HistRide` = wiersze Stravy | typ `AiRide` z `source: 'wahoo' \| 'fit' \| 'manual'`; funkcje odrzucają `strava` (test) |
| Propozycja FTP (`FtpSuggestionCard`, `power.ts`) | ze strumieni Stravy | tylko z jazd Wahoo; FTP z testu wpisane przez zawodnika – dane aplikacji |
| `session_logs` | brak kolumny źródła; trigger Stravy nadpisuje Wahoo | kolumna `source` (`strava`/`wahoo`/`manual`); **Wahoo ma pierwszeństwo**, Strava wypełnia dzień tylko bez kopii Wahoo |
| Widoki (PMC, krzywa mocy, kadencja, raporty, Tydzień, Kalendarz, `/i`, `/m`) | `db.strava_activities` | `mergeRides(strava, wahoo)` (`src/engine/rides.ts`) – jeden typ `Ride` z `source`; czytają przez hook `useRides` |
| `strava-oauth backfill` (400 dni) | historia ze Stravy | wyłączony; historię daje `wahoo-push {backfill}` (lista `/v1/workouts` + FIT dla 90 dni – pobranie pliku nie liczy się do limitów Wahoo) |
| `kv` `streams:<id>` (klient) | bez wygasania | 7 dni |

## 4. Proweniencja

- **Każdy wiersz z metrykami jazdy ma źródło.** `strava_activities` – zawsze `strava` (tabela = źródło),
  `wahoo_workouts` – `wahoo`, `session_logs.source` (nowa kolumna; trigger Stravy wpisuje `strava`, trigger Wahoo
  `wahoo`, aplikacja `manual`), `baseline_entries.source` (już jest; `strava` przestaje być dopuszczalne dla nowych
  wierszy – wartość zostaje w ograniczeniu dla zgodności).
- **Typ dla AI** (`_shared/provenance.ts`, czysty TS, testowany Vitestem): `AI_SOURCES = ['wahoo', 'fit', 'manual',
  'health']`, `aiSafe(rows)` (filtr) i `assertAiSafe(payload)` – przechodzi po obiekcie przed wysłaniem do modelu
  i rzuca, gdy znajdzie `source: 'strava'` albo klucz zaczynający się od `strava`. Wołają go `writeNote`, `writeLetter`,
  `coach-chat` (na kontekście z klienta – serwer odrzuca, nie tylko klient filtruje) i `plan-tune`.
- **Pierwszeństwo kopii Wahoo.** Ta sama jazda = start w odległości ≤ 10 min i czas różny o ≤ 25 % (`sameRide`).
  W widokach scalonych jazda z Wahoo zastępuje stravową (nazwa ze Stravy może zostać jako podpis tylko przez 7 dni).

## 5. Retencja danych Stravy (czytanie zachowawcze)

| Co | Ile | Jak |
|---|---|---|
| `strava_activities` (surowe pola i nasze metryki: NP, MMP, dryf, `hr_histogram`, `note`, `note_facts`) | **7 dni od pobrania** (`fetched_at`, nie data jazdy) | `private.purge_strava()` z `pg_cron` co godzinę: twarde `delete` (trigger przelicza log dnia) |
| `strava_streams` | 7 dni od pobrania | kaskada z aktywności |
| `session_logs` z `source = 'strava'` | 7 dni | po usunięciu aktywności: jeśli tego dnia jest jazda z Wahoo – log przechodzi na Wahoo; jeśli nie, a zawodnik coś wpisał (RPE, notatka) – zostaje wiersz bez metryk (`source = 'manual'`, status „wykonane” to deklaracja zawodnika); bez wpisów zawodnika – log znika |
| Dexie `strava_activities`, `kv streams:*` | 7 dni od pobrania | `purgeLocalStrava()` przy starcie i synchronizacji (usunięcia na serwerze nie przychodzą pullem) |
| Odświeżanie | brak | Nie odświeżamy pamięci podręcznej, żeby przedłużyć życie danych (5.5: „accumulating […] through repeated authorized API calls”). Ręczne „Synchronizuj” pobiera tylko 7 dni. |
| Rozłączenie / `deauthorized` / usunięcie konta | od razu | `purge_strava(user)` – wszystkie wiersze Stravy i logi `source = 'strava'` |
| Mail z danymi Stravy | – | kopia u zawodnika (wyświetlenie jemu); u nas nie zostaje nic poza `email_log` bez treści |

Skutek: **dla zawodnika z Wahoo nic nie znika** – historia, PMC, krzywa mocy i notatki są z Wahoo. Konto bez Wahoo
widzi jazdy ze Stravy przez 7 dni (plan vs wykonanie bieżącego tygodnia, notatka z reguł); długich analiz nie ma.
Gdyby Strava potwierdziła, że nasze **własne liczby pochodne** (np. TSS dnia) mogą zostać, retencję poluzujemy jedną
zmianą w `purge_strava`.

## 6. Zapis na Stravę (tytuł i opis z AI)

Notatka napisana z danych Wahoo nie jest „Strava Data”, a umowa 7.1 pozwala wgrywać „activities or information”.
Ale: żeby zapisać, aplikacja musi czytać Stravę (identyfikator jazdy, obecny tytuł do sprawdzenia, czy jest domyślny),
a 5.3 zakazuje użycia „Strava API Materials […] directly or indirectly, in connection with the […] operation of any AI
Application” – wysyłka tekstu modelu przez API Stravy może być tak odczytana. **Niejasne → wyłączone domyślnie**:
- serwer pisze na Stravę tylko przy sekrecie `STRAVA_WRITE_ENABLED=1` **i** `profiles.strava_write`;
- migracja ustawia `strava_write = false` wszystkim kontom (zawodnik może włączyć ponownie, gdy Strava odpowie);
- przy włączeniu: tytuł i opis tylko z faktów Wahoo albo `ruleDraft` (bez AI dla jazd tylko ze Stravy);
- pytanie 3 w § 9.

## 7. Wahoo jako źródło dla AI

- **Plik FIT** – `workout_summary.file.url` (pole jest w zapisanym `summary`). Pobranie pliku nie liczy się do limitów
  Wahoo. Dekoder `supabase/functions/_shared/fit.ts` (czysty TS, bez zależności, testy na pliku zbudowanym w teście):
  nagłówek, definicje, dane, skompresowane znaczniki czasu, pola deweloperskie pomijane; z wiadomości `record` (20):
  czas, moc, tętno, kadencja, prędkość (`enhanced_speed` / `speed`), dystans, wysokość. Wynik → `RawStreams` →
  istniejące `resample` i `rideMetrics` z `_shared/metrics.ts` (ten sam kod co dla Stravy).
- **Tabele**: `wahoo_workouts` dostaje `np_w`, `mmp_w`, `best_speed_kmh`, `decoupling_pct`, `hr_histogram`,
  `max_hr`, `device_watts`, `has_streams`, `note`, `note_source`, `note_at`, `note_facts`, `emailed_at`;
  nowa `wahoo_streams` (jak `strava_streams`).
- **Kiedy**: (1) webhook `workout_summary` → Edge Function `wahoo-webhook` (wymaga wpisania adresu i tokenu
  w portalu Wahoo + sekret `WAHOO_WEBHOOK_TOKEN` – robi użytkownik); (2) zapas: `pg_cron` co 30 min woła
  `wahoo-push {completed, days: 2}` dla kont z Wahoo (2 zapytania na konto = 4/h przy dwóch kontach; limit sandboxa 100/h);
  (3) historia: `wahoo-push {backfill}` jednorazowo.
- Po zapisie jazdy z plikiem: metryki → notatka AI (fakty z `rideFacts` na próbkach FIT) → mail po treningu.

## 8. Szablony planów i dopasowanie przez AI

### 8.1 Biblioteka szablonów (`data/templates/`)
- `data/templates/plan_templates.json` – **szablony struktury** (Zod: `src/engine/generator/templates.ts`):
  `id`, `name`, `summary` (dla człowieka), dla jakich dyscyplin i celów, drabinki akcentów per faza
  (`I`, `II`, `III` per cel), podział faz, rozkład intensywności (opis), urozmaicenie dni spokojnych.
  Szablony: `pyramidal` (dzisiejszy domyślny – baza SS/tempo → próg → specyfika), `polarized` (dużo Z2, akcenty
  VO2max/próg, bez sweet spotu), `time_crunched` (mało godzin: sweet spot i próg), `climbing` (długie wysiłki pod
  górę, siła na niskiej kadencji), `gravel_endurance` (długa z tempem w końcówce, wytrzymałość na zmęczeniu),
  `mtb_xc` (krótkie VO2max, zmiany tempa, technika), `comeback` (ostrożny: Z2 + tempo, testy później).
- `data/templates/workouts.json` – **nowe rodziny akcentów** jako drabinki (te same pola co `LADDERS`): over-under
  (`OU_*`), 30/30 i 40/20 (`VO2S_*`), długie podjazdy (`CLIMB_*`), tempo w końcówce długiej (`LONG_TEMPO_FINISH`),
  zmiany tempa MTB (`XC_*`). Dotychczasowe `LADDERS` przechodzą do tego pliku (te same identyfikatory – generator
  dla szablonu `pyramidal` daje plan identyczny jak dziś, test).

### 8.2 Kontrakt AI (`plan-tune`)
**Wejście** (tylko onboarding i dane aplikacji, nigdy Strava): `PlanInputs` (godziny, limity dni, stałe punkty,
dyscyplina, trenażer, doświadczenie, cel, tygodnie do celu, poziom pomiaru), flagi zdrowia z kodu (`intensity_allowed`,
`cautious` – **bez surowych odpowiedzi zdrowotnych**), lista szablonów z opisami i granice z kodu (`tuningBounds`),
opcjonalnie zdanie zawodnika „co jeszcze ważne” (pole w podsumowaniu). Ok. 2,5 tys. tokenów wejścia, 600 wyjścia.

**Wyjście** – JSON (Zod `planTuningSchema`, `src/engine/generator/tuning.ts`):
```json
{
  "template": "pyramidal | polarized | time_crunched | climbing | gravel_endurance | mtb_xc | comeback",
  "volume_pct": 70-100,          // % dostępnych godzin
  "ramp_pct": 3-10,              // wzrost objętości tydzień do tygodnia
  "block_weeks": 3 | 4,          // co ile tygodni rozładowanie
  "key_sessions": 0 | 1 | 2,     // akcenty w tygodniu
  "long_day": "mon…sun" | null,  // null = generator wybiera
  "key_days": ["tue", …] | null,
  "test_every_blocks": 1 | 2 | 3,
  "why": { "template": "…", "volume": "…", "ramp": "…", "blocks": "…", "keys": "…", "days": "…" }
}
```

**Granice (kod, `clampTuning`)** – model nie może ich przekroczyć, kod poprawia i zapisuje, co poprawił:
- szablon dozwolony dla dyscypliny i celu; `cautious` → `comeback` albo `pyramidal`, czerwona flaga → `comeback`;
- `key_sessions` ≤ `keyCountFor(inputs)` (dzisiejsza reguła); czerwona flaga → 0;
- `ramp_pct` ≤ 10, nowicjusz i ostrożni ≤ 7; `block_weeks` = 3 dla nowicjusza i ostrożnych;
- `volume_pct` nigdy nie daje więcej niż dostępny czas ani limit dnia (generator i tak tnie budżetem);
- `long_day` i `key_days` tylko z dni dostępnych, nie dojazdy, akcenty nigdy dzień po dniu i nie dzień po długiej;
- `why`: ≤ 180 znaków, każda liczba w tekście musi być w parametrach albo wejściu (jak `numbersOk`), inaczej tekst
  z reguł (`ruleWhy`).
- Brak AI (limit, błąd, brak zgody na AI) → `defaultTuning(inputs)` = dzisiejszy generator 1:1 z uzasadnieniami
  z reguł. Plan powstaje zawsze, offline też.

**Zapis**: `plans.tuning` (jsonb) + `plans.tuning_source` (`ai`/`rules`/`user`). Plan dalej regeneruje się
deterministycznie z wiersza (docs/32 § 7). `GENERATOR_VERSION` 1.1.0 (nowe szablony; bez `tuning` wynik bez zmian).

**Pokazanie i poprawki**: ekran „Gotowe!” ma sekcję „Dlaczego taki plan” – wiersz na wybór (szablon, objętość,
tempo wzrostu, akcenty, dni) z uzasadnieniem; dotknięcie otwiera arkusz z opcjami (lista szablonów pasujących do celu,
chipy objętości, liczby akcentów, dni). Zmiana = `clampTuning` → podgląd tygodnia na nowo → zapis `tuning_source: 'user'`.

**Koszt**: jedno wywołanie Sonnet przy onboardingu i przy każdej zmianie celu ≈ 0,03–0,05 USD (z myśleniem);
na płacącego < 0,10 USD/rok. Limit: 10 wywołań/dzień na konto w `ai_calls`.

## 9. Kolejność wdrożenia

1. **(a) Proweniencja i AI tylko na Wahoo** – migracja (`session_logs.source`, kolumny `wahoo_workouts`, `wahoo_streams`,
   `strava_write = false`), `provenance.ts`, `gatherWahooFacts`, `gatherWeek` z Wahoo, kontekst czatu z
   `wahoo_workouts`, `assertAiSafe` w funkcjach, notatka z reguł dla Stravy, wyłączenie zapisu na Stravę.
   **Po tym kroku prywatna aplikacja jest zgodna z 5.3/5.10.**
2. **(b) FIT i strumienie z Wahoo** – `fit.ts`, `wahoo-push {completed}` pobiera plik i liczy metryki, notatka i mail
   po jeździe Wahoo, `wahoo-webhook`, cron 30 min, `backfill`.
3. **(c) Retencja Stravy** – `fetched_at`, `purge_strava` + `pg_cron`, `mergeRides`/`useRides` we wszystkich widokach,
   czyszczenie Dexie i `kv`, wyłączenie backfillu Stravy. **Pierwsze uruchomienie czyszczenia na produkcji tylko za
   zgodą użytkownika i po sprawdzeniu, że historia Wahoo jest kompletna** – kasowanie jest nieodwracalne.
4. **(d) Szablony i `plan-tune`** – `data/templates/`, `tuning.ts`, generator czyta szablony, Edge Function `plan-tune`,
   sekcja „Dlaczego taki plan” i arkusz poprawek.

## 10. Otwarte pytania

Do użytkownika:
1. Zapis na Stravę – wyłączyć wszystkim teraz (rekomendacja) czy zostawić u siebie do odpowiedzi Stravy?
2. Drugie konto – czy ma połączone Wahoo? Bez Wahoo straci notatki AI i analizy dłuższe niż 7 dni.
3. Webhook Wahoo – wpisanie adresu `…/functions/v1/wahoo-webhook` i tokenu w portalu Wahoo + sekret
   `WAHOO_WEBHOOK_TOKEN`; bez tego zostaje odpytywanie co 30 min (notatka i mail do 30 min po jeździe).
4. Zgoda na pierwsze czyszczenie danych Stravy starszych niż 7 dni na produkcji.

Do developers@strava.com (projekt maila):

> Subject: API Policy 1.06.2026 – AI features on non-Strava data, caching of derived metrics, uploads
>
> Hello,
>
> I run a small personal training app (Standard Tier, 2 athletes) that imports activities via the Strava API.
> To comply with the API Policy effective June 1, 2026, we are separating data sources and would like to confirm
> our reading of a few clauses:
>
> 1. **§ 5.3 / Agreement § 2.3.** Our AI features (post-ride notes, a weekly letter, a coaching chat) will use only data
>    we obtain directly from the athlete's head unit cloud (Wahoo Cloud API) and data the athlete enters in our app.
>    No data obtained from the Strava API – raw or derived – will be sent to any model. Is it correct that the same ride
>    obtained from Wahoo is not "Strava Data" even though it also exists on Strava? "AI Application" is not defined in
>    the Policy or the Agreement – does it cover an app whose non-AI features use Strava Data while separate AI features
>    use only non-Strava data?
> 2. **§ 5.4.** We show each athlete analyses of their own Strava activities (training load, power curve, plan vs.
>    completed rides), visible only to that athlete and computed by code, never by AI. We read § 5.4 as covering analytics
>    for the developer's own purposes (product insights, cross-user aggregates), not features displayed to the athlete.
>    Is that correct? And does "combine Strava Data with other customer data" refer to other users' data?
> 3. **Agreement § 7.1 with § 5.3.** May we upload a title/description to the athlete's Strava activity (with the
>    athlete's opt-in and `activity:write` scope) when that text was generated by an AI model from Wahoo data only?
>    Our app would read the Strava activity only to identify it and to check that the title is still the default.
> 4. **§ 5.5 / § 6.2.** We delete everything obtained from Strava (raw fields and streams) 7 days after retrieval.
>    Does the 7-day limit also apply to our own derived numbers (e.g. a daily training-stress score computed by our
>    code from a Strava activity), shown only to that athlete? Is a done/not-done status on the athlete's own training
>    plan, derived from a Strava activity, "data derived from Strava Data" that must be deleted after 7 days?
>
> Thank you,
> Łukasz Felsztukier

Do sprawdzenia po stronie Wahoo: warunki Wahoo API (umowa dewelopera) o AI i przechowywaniu – w dokumentacji
`cloud-api.wahooligan.com` nic o AI nie ma; przed wersją komercyjną przeczytać umowę z portalu.
