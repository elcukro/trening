# 30 · Przepływ produktu – od „kim jesteś” do następnego celu

Szkic z 26.10.2026, do wersji dla wielu użytkowników (tło biznesowe: [docs/29](29-komercjalizacja.md)). Punktem wyjścia jest
wizja użytkownika w sześciu krokach:
1. kim jestem;
2. cel;
3. plan z możliwością dopracowania;
4. jazdy z urządzenia;
5. jazdy oznaczane ręcznie;
6. okresowe analizy trenera.

Do tego dochodzą etapy, bez których aplikacja jest komentatorem, a nie trenerem.

**Trzy zasady całego przepływu:**
1. **Kod liczy, model opowiada** (jak w docs/20). Plan buduje deterministyczny generator. Model tylko wybiera parametry,
   tłumaczy decyzje i prowadzi rozmowę.
2. **Każda analiza kończy się propozycją zmiany planu, którą przyjmuje się jednym dotknięciem.** Tekst bez zmiany planu
   nie wystarcza.
3. **Trzy poziomy pomiaru są równorzędne:** moc, tętno, odczucie (§ 3). Osoba bez miernika i zegarka dostaje pełny
   przepływ, tylko inaczej opisany.

Oznaczenia stanu: ✅ jest (dla obecnych dwóch kont) · ◐ częściowo · ✗ brak.

## 1. Etapy w skrócie

| # | Etap | Co dostaje użytkownik | Stan |
|---|---|---|---|
| 0 | Pierwsze wrażenie | przykładowy tydzień planu dla kogoś takiego jak on, przed założeniem konta | ✗ |
| 1 | Kim jesteś | krótka rozmowa zamiast formularza; profil, dostępny czas, poziom pomiaru, zdrowie | ◐ |
| 2 | Cel | cel z mierzalnym kryterium, punkty kontrolne, uczciwa ocena realności | ◐ |
| 3 | Plan | plan opowiedziany (fazy, typowy tydzień, „dlaczego”), dopracowany rozmową | ◐ |
| 4 | Kalibracja | 1–2 tygodnie wprowadzające z testem → strefy | ◐ |
| 5 | Codzienna pętla | rano check-in → „dziś: jak w planie / lżej / odpocznij” → trening na urządzenie | ✅ |
| 6 | Wynik jazdy | automatycznie, z pliku albo ręcznie w dwóch dotknięciach | ◐ |
| 7 | Analizy | po jeździe, co tydzień, co blok, alarmy – zawsze z propozycją zmiany | ◐ |
| 8 | Życie się dzieje | choroba, wyjazd, brak czasu, ból → plan przebudowany | ◐ |
| 9 | Finał celu | taper, odprawa przed startem, podsumowanie, od razu następny cel | ◐ |

Dla jednego zawodnika działa ok. 70 % przepływu. Brakuje części dla nowych osób (etapy 0–4), wyników jazd bez Stravy
(etap 6), przeglądu bloku (etap 7) i domknięcia celu (etap 9).

## 2. Etapy szczegółowo

### Etap 0 – Pierwsze wrażenie (bez konta)
- **Użytkownik:** trzy pytania (cel, godziny w tygodniu, czy ma pomiar) → przykładowy tydzień i opis bloku. Konto zakłada
  dopiero przy „Zapisz mój plan”.
- **Jest:** „Zobacz tylko plan, bez konta” (`trening:no-account`) pokazuje plan programu alpejskiego.
- **Brakuje:** przykład liczony z odpowiedzi. Wystarczy generator z etapu 3 uruchomiony lokalnie, bez zapisu.

### Etap 1 – Kim jesteś
- **Użytkownik:** „Opowiedz o sobie” jednym albo kilkoma zdaniami. AI wypełnia pola, a użytkownik je potwierdza albo
  poprawia (chipy, listy, bez klawiatury tam, gdzie się da – docs/24 § 6).
- **Pola, które najmocniej zmieniają plan** (w tej kolejności):
  1. **Czas:** godziny w tygodniu, dostępne dni, ile w dzień roboczy, a ile w weekend, stałe punkty tygodnia (np. sobotnia
     jazda z klubem).
  2. **Gdzie jest teraz:** godziny w ostatnich 4 tygodniach, najdłuższa jazda w ostatnim miesiącu, lata jazdy.
  3. **Poziom pomiaru:** miernik mocy, pas lub zegarek z tętnem, nic. Decyduje o języku planu (§ 3).
  4. **Sprzęt i dyscyplina:** rowery (szosa, gravel, MTB), trenażer tak/nie, komputer lub zegarek (marka – do wyboru
     integracji).
  5. **Ciało:** wzrost, masa, data urodzenia, płeć (do budżetu kcal).
  6. **Zdrowie:** kilka pytań przesiewowych (serce, leki, omdlenia, świeże kontuzje). Przy czerwonej fladze aplikacja
     odsyła do lekarza i nie układa planu intensywnego. To ochrona użytkownika i autora.
- **Jest:**
  - wzorzec „zdanie → pola z walidacją” w `checkin-parse` (`_shared/checkin_parse.ts`, `src/sync/checkinParse.ts`);
  - profil: `height_cm`, `birth_date`, FTP/LTHR, `power_meter` (arkusz „Progi i miernik”);
  - rowery per konto (`bikes`).
- **Brakuje:** rozmowa onboardingowa (nowy prompt + schemat Zod profilu), pola czasu i obecnej objętości, pytania
  przesiewowe, zapis zgody na dane zdrowotne (art. 9 RODO, docs/29 § 1).

### Etap 2 – Cel
- **Typy celu:**
  - wydarzenie: data, dystans, przewyższenie, najlepiej **wgrany GPX trasy** (profil podjazdów, czas jazdy);
  - FTP lub tempo („30 km/h przez 2–3 h”);
  - masa;
  - forma ogólna;
  - powrót po przerwie.
- **Dwa cele naraz** (np. wyjazd + masa): główny i poboczny. Trener wskazuje konflikt, np. duży deficyt przy rosnącym
  obciążeniu, i proponuje, jak go rozwiązać.
- **Ocena realności:** liczona kodem, z tempa zmian (kg/tydz., W/tydz., czas do daty) i obecnej objętości. Model ją tylko
  opowiada: „15 kg do maja to 1 kg/tydz. – za szybko przy tym planie; proponuję 9 kg i punkt kontrolny 1 marca”.
- **Mierzalne kryterium i punkty kontrolne** – bez nich etap 7 nie powie „idzie dobrze”.
- **Jest:**
  - `program.goal` i `programGoal` (cel FTP);
  - `baseline.ts` (cel 30 km/h, karta „Punkt wyjścia”);
  - `nutrition.weight_based` z `milestones` i `weightTarget` (masa z punktami kontrolnymi);
  - `meta.target` (nazwa daty końcowej: wyjazd lub koniec programu).
- **Brakuje:** wybór typu celu przez użytkownika, ocena realności, cel z trasy GPX (`climb.ts` liczy podjazdy, ale dla
  stałej trasy programu), kilka celów z priorytetem.

### Etap 3 – Plan i dopracowanie
- **Użytkownik:**
  - plan opowiedziany: fazy, typowy tydzień, kluczowe treningi i dlaczego właśnie te;
  - dopracowanie rozmową („nie mogę w środy”, „więcej szutru”, „dłużej w weekend”, „chcę jeden trening na trenażerze”);
  - zmiana łamiąca zasady dostaje odmowę z powodem i propozycję obok.
- **Plan kroczący:** szczegółowo 1–2 tygodnie, dalej fazy i objętość. Szczegóły dopisują się co tydzień z uwzględnieniem
  wykonania (etap 7).
- **Jest:**
  - dwa generatory w Pythonie (`data/reference_generator.py`, `data/ftp300_generator.py`);
  - program jako dane ze schematem Zod (`src/engine/schema.ts`);
  - układ tygodni R14 (`layout.ts`), reguły R1–R16 jako dane (`rules.text`, `rules.ts`);
  - walidacja przeniesień `validateMove` (R15), rejestr programów (`src/data/program.ts`).
- **Brakuje – największa praca projektu (docs/29 § 1, 10–15 dni):**
  - generator w TS dla dowolnych parametrów (cel, data, czas, dni, dyscyplina, poziom, pomiar);
  - biblioteka treningów per dyscyplina;
  - personalizacja przez AI jako **wybór parametrów generatora** (JSON → Zod → generator), nie jako pisanie planu;
  - zmiana „stałych dni” w rozmowie (dziś są w szablonie tygodnia programu).

### Etap 4 – Kalibracja (nowy krok)
- **Użytkownik:** pierwszy tydzień jest wprowadzający, a na jego końcu test dopasowany do poziomu pomiaru:
  - **moc:** test FTP (rampa albo 20 min);
  - **tętno:** test progowy (LTHR z 20–30 min równego wysiłku);
  - **odczucie:** stała pętla na czas z oceną wysiłku i „testem rozmowy”, powtarzana w kolejnych blokach jako miara postępu.

  Do testu plan używa szacunków. Po teście strefy się przeliczają, a trener mówi, co się zmieniło.
- **Jest:**
  - `FTP_TEST` co 5 tygodni (R14 zachowuje tydzień z testem);
  - propozycja FTP z jazd i LTHR z najlepszych 20 min (`power.ts`, `FtpSuggestionCard`);
  - zasada „FTP zmienia się wyłącznie po teście”;
  - strefy (`zones.ts`).
- **Brakuje:** test w pierwszym tygodniu nowego planu, test „pętla na czas” dla osób bez pomiaru, komunikat „strefy po
  teście” w języku użytkownika.

### Etap 5 – Codzienna pętla (tu jest retencja)
- **Użytkownik:**
  - rano krótki check-in: sen, nogi, a z Apple Zdrowie także HRV, tętno spoczynkowe i masa;
  - werdykt na dziś: jak w planie / lżej / odpocznij, z pogodą i ubraniem;
  - przycisk **„mam dziś tylko N minut”** → skrócona wersja treningu;
  - trening na urządzeniu (Wahoo automatycznie, Garmin i Hammerhead przez plik FIT/ZWO) albo, bez urządzenia,
    instrukcja słowami.
- **Jest:**
  - `src/day/dayState.ts` (`dayFlow`, `dayPhase`), karta stanu dnia w `/m`;
  - check-in (`CheckinSheet`, mail z „nogami”);
  - Apple Zdrowie i alarm HRV (`src/day/health.ts`, `src/engine/readiness.ts`, R6);
  - odprawa z pogodą (`useBriefing.ts`, `src/engine/weather.ts`, `BriefingCard`, mail o 7:00);
  - propozycje reguł (`warningsFor`, akcja `downgrade` – „Obniż dzisiejszy trening”);
  - wysyłka na Wahoo (`src/engine/wahoo.ts`, `wahoo-push`).
- **Brakuje:**
  - „mam tylko N minut” jako akcja użytkownika (silnik skaluje część treningów – `SCALABLE_WORKOUTS` w `calendar.ts` –
    ale tylko na potrzeby programu);
  - eksport treningu do FIT/ZWO;
  - opis treningu w odczuciach dla poziomu „bez pomiaru”.

### Etap 6 – Wynik jazdy
Cztery drogi, od najwygodniejszej:
1. **Automatycznie:** Wahoo Cloud (jazdy z ELEMNT + plik FIT), Apple Zdrowie (treningi; [NZ] czy Garmin Connect zapisuje
   tam moc), Polar AccessLink. **Strava nie jest źródłem danych dla AI** (polityka API z 1.06.2026, docs/29 § 4.1).
2. **„Udostępnij do Trening”:** aplikacja iOS rejestruje się jako odbiorca plików `.fit`, więc z Garmin Connect, aplikacji
   Wahoo czy Files wystarczy „Udostępnij”. Na webie: przeciągnij plik.
3. **Adres e-mail** typu `jazdy@…` z plikiem w załączniku – uniwersalna furtka dla każdego urządzenia.
4. **Ręcznie, w dwóch dotknięciach:** „jak w planie / krócej / inaczej” + czas + wysiłek 1–10 (+ opcjonalnie samopoczucie).
   To pełnoprawna ścieżka: obciążenie z czasu × oceny wysiłku (session-RPE) to uznana metoda.

Jazda sama dopasowuje się do dnia planu. Pytanie pada tylko przy niejasności (dwie jazdy, inny dzień).
- **Jest:**
  - import Stravy z metrykami (`_shared/metrics.ts` – liczy ze strumieni próbek, ten sam kod posłuży do FIT);
  - podsumowania Wahoo (`wahoo_workouts`, `WahooStatus.tsx`);
  - logi z RPE (`session_logs`, narzędzie trenera `set_rpe`);
  - obciążenie z RPE jako zapas (`useLoad.ts`: Strava → RPE → plan);
  - przeniesienie jazdy na inny dzień (`StravaCard`).
- **Brakuje:**
  - parser FIT i ujednolicona tabela jazd niezależna od źródła;
  - pobieranie pliku FIT z Wahoo;
  - treningi z Apple Zdrowie;
  - odbiorca plików w iOS (Share Extension / typy dokumentów);
  - adres e-mail do jazd;
  - „dwa dotknięcia” jako główny przycisk po treningu w `/m`.

### Etap 7 – Analizy i zmiany planu
Rytm zamiast „co jakiś czas”:

| Poziom | Kiedy | Co | Propozycja zmiany (przykład) |
|---|---|---|---|
| Po jeździe | po każdej jeździe | 3–5 zdań, jeden wniosek, tło historii | „jutro lżej – tętno 8 bpm wyżej przy tej samej mocy” |
| Tydzień | niedziela | wykonanie vs plan, obciążenie, na czym skupić się w następnym tygodniu | „następny tydzień: 4 jazdy zamiast 5, sobota dłuższa” |
| Blok | co 4–5 tyg., przy teście | co się poprawiło (FTP, Pw:HR, EF na Z2, trend masy), czy cel na kursie, nowa prognoza | „cel 30 km/h realny w czerwcu, nie w maju – przesuwam akcent na próg” |
| Alarm | gdy zajdzie | 2 opuszczone treningi, sygnały zmęczenia (HRV, tętno spoczynkowe, sen), za szybki wzrost obciążenia, długi spadek kadencji | „ten tydzień jako rozładowanie” |

Każda propozycja to **akcja do przyjęcia jednym dotknięciem** (override albo nowe parametry generatora) z możliwością
cofnięcia. Trener mówi otwarcie o niepewności („bez miernika oceniam po tętnie i odczuciu”). Domyślnie jest cicho, gdy
wszystko idzie dobrze. Częstotliwość kontaktu wybiera użytkownik.
- **Jest:**
  - notatka po jeździe (`ride-note`, `_shared/ride_facts.ts`, `historyContext`), list tygodnia (`week_facts.ts`);
  - raporty tygodnia i miesiąca (`report.ts`), PMC i wzrost obciążenia (`pmc.ts`), moc i FTP (`power.ts`), kadencja
    z ostrzeżeniem (`cadence.ts`);
  - reguły z propozycjami (`RulesCard`, `warningsFor`);
  - czat z narzędziami zmieniającymi plan (`coachTools.ts`: `move_ride`, `mark_skipped`, `push_wahoo`…).
- **Brakuje:**
  - przegląd bloku z prognozą celu;
  - propozycje w notatce i liście jako przyciski akcji (dziś są tylko tekstem);
  - alarmy jako jeden mechanizm (dziś reguły w aplikacji + flagi w kontekście trenera);
  - ustawienie częstotliwości kontaktu;
  - analizy na danych spoza Stravy (etap 6).

### Etap 8 – Życie się dzieje
- **Użytkownik:** jeden przycisk „Coś się zmieniło”:
  - choroba;
  - wyjazd lub brak roweru;
  - brak czasu w tym tygodniu;
  - ból lub kontuzja;
  - nowa praca lub nowy rytm tygodnia.

  Krótka rozmowa, potem przebudowany fragment planu z wyjaśnieniem i powrotem do celu („cel bez zmian – tracimy 1 tydzień
  budowania”, albo uczciwie: „przesuwamy cel”).
- **Jest:**
  - nadpisania `sick`, `skip`, `indoor`, `move`, `swap`, `downgrade` (`applyOverrides` w `rules.ts`);
  - R1 (zaległy akcent), zamiana i przeniesienie z cofnięciem;
  - czat rozumie takie prośby.
- **Brakuje:**
  - zmiany dłuższe niż dzień (tydzień bez roweru, nowy rytm tygodnia) jako ponowne uruchomienie generatora od dziś;
  - wpływ na cel (prognoza);
  - ścieżka „ból/kontuzja” z ostrożnym tekstem i granicą „idź do lekarza”.

### Etap 9 – Finał celu i następny cel
- **Użytkownik:**
  - taper;
  - **odprawa dzień przed startem** (tempo na podjazdach z profilu trasy, jedzenie i picie na godzinę, ubranie z prognozy
    na trasie, sprzęt);
  - po wydarzeniu podsumowanie (plan vs wynik, co zadziałało);
  - **od razu propozycja następnego celu** z krótkim okresem regeneracji.

  To moment, w którym ludzie rezygnują z subskrypcji – trener musi mieć gotową odpowiedź na „i co teraz?”.
- **Jest:**
  - faza i treningi taperu w generatorze alpejskim (`category: "taper"`, `OPENERS`);
  - ekran Wyjazd z listą pakowania (`features.trip`);
  - `fuelPlan` i `clothingFor` w `weather.ts`;
  - strategia na przełęcz w `rules`.
- **Brakuje:**
  - ogólny taper w generatorze;
  - odprawa przed startem dla dowolnej trasy (GPX);
  - podsumowanie celu;
  - przejście do następnego celu bez zakładania nowego programu ręcznie.

## 3. Poziomy pomiaru (przekrój przez wszystkie etapy)

| | Moc | Tętno | Odczucie (bez urządzeń) |
|---|---|---|---|
| Język planu | waty i % FTP | bpm i strefy LTHR | wysiłek 1–10, „test rozmowy”, czas |
| Kalibracja | test FTP | test progowy LTHR | pętla na czas + wysiłek |
| Obciążenie | TSS z mocy | TSS z tętna (histogram) | czas × wysiłek (session-RPE) |
| Miara postępu | FTP, W/kg, Pw:HR | EF/dryf na Z2, tętno spoczynkowe | czas pętli, wysiłek przy tym samym czasie, samopoczucie |
| Wysyłka na urządzenie | cele mocy | zakres bpm w nazwie (ELEMNT nie ma celów tętna – docs/11) | — (instrukcja słowami) |

Silnik ma już dwie pierwsze kolumny (np. `power_meter`, `effectiveFtp`, Z2 jeździ na tętno – pamięć projektu). Trzecia
istnieje tylko jako zapas obciążenia z RPE.

## 4. Kolejność prac (spójna z docs/29 § 7.2)

1. **Generator planów w TS + typy celów i dyscypliny** (etapy 2–3). Bez tego nie ma nowych użytkowników.
2. **Onboarding rozmową + pytania o zdrowie + zgody** (etap 1, etap 0 przy okazji).
3. **Jazdy bez Stravy:** FIT (parser, udostępnianie w iOS, upload na webie), Wahoo z plikiem, Apple Zdrowie, dwa
   dotknięcia (etap 6).
4. **Kalibracja dla trzech poziomów pomiaru** (etap 4, § 3).
5. **Propozycje jako akcje + przegląd bloku z prognozą** (etap 7).
6. **„Coś się zmieniło” → ponowne uruchomienie generatora** (etap 8).
7. **Finał celu:** taper, odprawa z GPX, następny cel (etap 9).

Pkt 1–3 wystarczą do zamkniętej bety. Pkt 4–7 można dokładać w jej trakcie, w kolejności zgłoszeń testerów.

## 5. Decyzje do podjęcia

1. **Horyzont planu:** kroczący (1–2 tygodnie szczegółowo, dalej fazy – rekomendacja) czy pełny plan do daty celu, jak dziś.
2. **Ile wolno AI w planie:** tylko parametry generatora (rekomendacja) czy także pojedyncze treningi pisane przez model.
3. **Dyscypliny w v1:** szosa + gravel (blisko tego, co jest) czy od razu MTB (inne treningi terenowe, czas zamiast
   dystansu).
4. **Kanał kontaktu i częstotliwość:** powiadomienia, maile czy tylko aplikacja; domyślnie „cicho, gdy wszystko OK”?
5. **Ścieżka „bez pomiaru” w v1** czy później. To duża grupa, ale wymaga osobnej kalibracji i języka planu.
6. **Granica zdrowotna:** które odpowiedzi przesiewowe blokują plan intensywny, a które tylko pokazują ostrzeżenie (do
   ustalenia z prawnikiem razem z regulaminem, docs/29 § 1).
7. **Wydarzenie z GPX w v1** czy tylko data + dystans + przewyższenie.
