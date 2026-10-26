# 27 · Aplikacja iOS: funkcje natywne i przegląd UI/UX

Stan: plan z 26.10.2026, po etapie 0 (powłoka Capacitora działa na telefonie, logowanie i synchronizacja – docs/26
„Stan wdrożenia”). Rozwija docs/26 § 4 (nowe możliwości iOS) i § 3 (HIG) w konkretne prace, z wynikami przeglądu
interfejsu `/m`. Założenia bez zmian: jeden kod ekranów dla webu i iOS, wtyczki tylko w `src/native/`, silnik
(`src/engine/`) czysty TS, aplikacja tylko kolarska (bez siłowni), jasny motyw i grafiki 3D zostają (decyzje docs/24).

## Stan wdrożenia

**Etap 1a – szlify HIG (26.10.2026), sprawdzone w symulatorze na koncie zawodnika:**

- `src/native/haptics.ts` (`haptic.selection/light/medium/success/warning/error`, `@capacitor/haptics`) – wybór RPE
  i skali check-inu, przełączniki, podniesienie dnia w Planie (`useLongPress`), sukces/błąd każdego `toast.run`. Na webie
  nic (Safari na iOS nie ma `navigator.vibrate`).
- `src/native/confirm.ts` (`confirmAction`, `@capacitor/action-sheet`; na webie `window.confirm`) – „Wylogować się?”,
  „Wyczyścić rozmowę z trenerem?”, „Odrzucić zmiany?”.
- **Wstecz:** `Screen` wraca `navigate(-1)`, gdy jest historia (Ja → dzień testu → Wstecz = Ja); adres z `back` tylko
  awaryjnie i bez nowego wpisu. **Gest od lewej krawędzi** (`src/m/useEdgeBack.ts`): ekran jedzie za palcem z cieniem,
  po 35 % szerokości albo szybkim ruchu wraca; w aplikacji iOS i PWA z ekranu początkowego (w Safari gest należy do
  przeglądarki); nie działa w arkuszach i czacie.
- **Arkusze** (`Sheet` w `Chrome.tsx`): przeciąganie w dół za uchwyt i nagłówek (za treść, gdy jest u góry), zamknięcie
  po 30 % wysokości lub szybkim ruchu, animacja zamykania 0,22 s, `dirty` → „Odrzucić zmiany?” przy tle, ✕, Esc i geście
  (check-in, Progi, posiłek); tytuł skracany wielokropkiem.
- **Komunikaty** nad arkuszami (`z-[60]`), „Cofnij” i ✕ w komunikacie ≥ 44 pt.
- **Dotyk ≥ 44 pt:** RPE dwa rzędy po 5; klasa `.m-hit` i `.m-chip::after` – niewidoczne pole 44×44 wokół przycisków
  tekstowych, chipów i ✕ na miniaturach; „Wyślij” w Planie 44 pt.
- **Kontrast:** `dayColor().fill` → `--day-fill` pod biały tekst (zielony #1a7f37 5,1:1, pomarańczowy #b35c00 4,7:1,
  czerwony #d70015 5,4:1, szary #636366 6:1); dane w `--label-2` zamiast `--label-3` (podpisy kafelków Ja, dni tygodnia,
  % stref, stopka, obwódka kropek osi dnia).
- Stopka Ja bez pomiaru okna (tylko `import.meta.env.DEV`); tytuł paska `aria-hidden` (VoiceOver czyta raz).

**Etap 2 – Apple Health, odczyt (26.10.2026), sprawdzone w symulatorze iPhone 17 (bez konta, dane przykładowe):**

- Wtyczka Swift `native/trening-health` (lokalny pakiet Capacitora, `npm install ./native/trening-health`, SPM):
  `isAvailable`, `requestAuthorization`, `readDay(date)` → waga i tętno spoczynkowe (ostatnie z dnia), HRV SDNN (średnia
  z nocy 18:00–14:00), sen (fazy snu bez „w łóżku” i „przebudzony”, przedziały zegarka i telefonu łączone). Uprawnienie
  w `ios/App/App/App.entitlements`, opisy `NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription` w `Info.plist`.
  W buildzie Debug argument `-TreningHealthSeed YES` (`xcrun simctl launch … pl.felsztukier.trening -TreningHealthSeed YES`)
  zapisuje 14 dni przykładowych danych przy włączaniu (ostatnie dwie noce „zmęczone”).
- `src/native/health.ts` (na webie puste), `src/day/health.ts` (czysty TS + testy): `healthPatch` – Zdrowie wypełnia tylko
  pola puste albo wcześniej ze Zdrowia, `sourcesAfterManual` – ręczna zmiana zdejmuje źródło, `isCheckedIn` – same dane
  ze Zdrowia nie zaliczają check-inu. `upsertCheckin`/`applyHealthDay` w `repo.ts` (bez zmian = bez zapisu i synchronizacji).
- Migracja `20261026170000_checkin_health.sql`: `checkins.hrv_ms`, `sleep_min`, `field_sources` (jsonb). **Musi być na
  serwerze przed wdrożeniem kodu** – inaczej upsert check-inu z nowymi polami dostaje błąd.
- `src/engine/readiness.ts` (+ testy): HRV dnia względem średniej z 28 dni (min. 7 pomiarów), `hrvAlarm` = poniżej
  średnia − 1 SD dwa dni z rzędu → R6 („HRV jest poniżej Twojej normy drugi dzień z rzędu”, jak tętno spoczynkowe).
  Trener dostaje `hrv_ms`, `sleep_min`, `from_health` i flagi HRV oraz „sen < 6 h dwie noce” (`coachContext.ts`).
- UI: Ja → Ustawienia → „Apple Health” (tylko gdy HealthKit jest dostępny, włącznik per urządzenie w kv `health_enabled`);
  włączenie = okno uprawnień + **28 dni wstecz** (bez tego norma HRV powstawałaby tydzień) + komunikat z danymi dnia.
  Potem odczyt wczoraj + dziś przy otwarciu i powrocie do aplikacji, nie częściej niż co 10 min (`useHealthSync`).
  Karta poranna: „Ze Zdrowia: waga · tętno · HRV · sen”; arkusz check-inu: „ze Zdrowia” przy polach, HRV i sen do odczytu.
- **Nie sprawdzone:** prawdziwe dane z wagi/zegarka na telefonie; czy darmowe konto Apple (Personal Team) podpisze
  uprawnienie HealthKit; ostrzeżenie R6 z HRV na ekranie (w `/m` widać tylko `warn` – na dzień wolny/spokojny R6 jest
  `info`; logikę pokrywa test `readiness.test.ts`). Zapis posiłków do Zdrowia (v1.1) – nie zrobiony.

**Lokalizacja do pogody (§ 1 pkt 12, 26.10.2026):** Ja → Pogoda → „Użyj mojej lokalizacji” – `src/native/location.ts`
(`@capacitor/geolocation`, jednorazowo, dokładność ~1 km, na webie `navigator.geolocation`), opis
`NSLocationWhenInUseUsageDescription` po polsku; pytanie o zgodę dopiero przy dotknięciu przycisku. Zapis jak dotąd w kv
`weather_location` z nazwą „Moja lokalizacja (lat, lon)” – bez geokodowania odwrotnego (Open-Meteo go nie ma). Sprawdzone
w symulatorze (systemowe pytanie, zapis, komunikat).

**Animowany ekran startowy (26.10.2026), sprawdzone w symulatorze iPhone 16e:** natywny ekran startowy zostaje jednolity
(#f2f2f7, storyboard nie może być animowany), a po nim WebView pokazuje ok. 1,3 s sceny paralaksy w stylu grafik `/m` –
trzy warstwy krajobrazu przesuwają się z różną prędkością (daleko ±4, blisko ±14, droga ±34 % szerokości), rowerzysta
(trener z ikony) wjeżdża z lewej i kołysze się na pedałach. Bez tekstów (HIG: ekran startowy to nie reklama).

- **Wariant:** pora roku (meteorologiczna) wybiera warstwy, pora dnia (godzina względem przybliżonego wschodu i zachodu
  w danym miesiącu – w grudniu o 16:00 noc, w czerwcu o 20:00 wieczór) – niebo, słońce/księżyc z gwiazdami i odcień
  krajobrazu w CSS, a w nocy lampkę roweru i jasny tekst paska statusu. Logika: `src/m/introScene.ts` (czysty TS, test
  `src/m/__tests__/introScene.test.ts`), data i godzina z `todayISO`/`nowHour` (Europe/Warsaw).
- **Grafiki:** `public/m/intro/` – `intro-<pora roku>-{far,near,road}.webp` (4 × 3, 1800 px) i `intro-rider.webp`
  (480 px), razem **588 KB**; niebo używa istniejących `sun.png`, `night.png`, `cloud.png`. Generuje je
  `scripts/fal-art.mjs` (nano-banana-pro → birefnet, przycięcie do treści, WebP przez `cwebp`; `--webp` przerabia
  zapisane wycięcia bez fal.ai). Wysokości warstw i miejsce kół na drodze są zmierzone na obrazkach i zapisane w
  `src/m/intro.css` (`--far`, `--near`, `--road`, `--wheel`, `--fill`) – nowa warstwa = nowe pomiary.
- **Przebieg** (`src/m/Intro.tsx`, montowane w `App.tsx` nad wszystkim): intro przejmuje ekran startowy (`holdSplash`
  w `src/native/shell.ts`), wczytuje i dekoduje warstwy (najdłużej 1,5 s – inaczej start bez intro, jak dotąd), odsłania
  scenę (`revealSplash`) i znika (0,38 s) po animacji **i** narysowaniu pierwszego ekranu `/m` (`firstScreenDrawn`),
  najpóźniej po 3,5 s. Aplikacja ładuje dane pod spodem, dotknięcie pomija intro, raz na uruchomienie (powrót z tła go
  nie powtarza). **Przy „ogranicz ruch” intra nie ma** – start jak przed zmianą.
- **Tylko aplikacja iOS, nie PWA:** PWA nie ma natywnego ekranu startowego, który intro by przejmowało, iOS często ubija
  PWA w tle (intro przy co którymś otwarciu byłoby przypadkowym opóźnieniem), a 588 KB trafiałoby do pamięci każdej
  przeglądarki. WebP nie pasuje do wzorców precache (`vite.config.ts`), więc PWA ich nie pobiera.
- **Podgląd:** `?intro=autumn-morning` (albo `?intro=now`) poza produkcyjną aplikacją iOS, a do zrzutów z symulatora
  build z `VITE_INTRO_PREVIEW=winter-night` – w podglądzie scena zostaje do dotknięcia. E2E: `e2e/mobile.spec.ts`
  („Intro (podgląd…)”).
- **Propozycja (bez zmiany):** ikona aplikacji spójna ze sceną – trener na rowerze na tle gór zamiast samej twarzy;
  do decyzji użytkownika.

**Informacja zwrotna w stylu iOS (26.10.2026, § 6):** pigułka potwierdzenia u góry, „Cofnij” nad paskiem zakładek, błędy
z radą i „Ponów”, czekanie na miejscu akcji (przycisk/karta) z animacją rowerzysty z fal.ai przy dłuższych akcjach,
„Anuluj” przy rozpoznawaniu posiłku i odpowiedzi trenera, arkusz akcji także w przeglądarce; inwentarz z werdyktami
w § 6.3, katalog stanów pod `/m/czekanie`.

Zostaje z § 3.1: nic. Z § 3.2/3.3 – etap 1b i osobne zadania (Dynamic Type, VoiceOver, przejścia między ekranami).

## 1. Co daje natywna aplikacja, czego PWA nie umie

Kolejność według wartości dla zawodnika i kosztu. „Konto płatne” = wymaga Apple Developer Program (99 USD/rok).

| # | Funkcja | Po co | Jak | Konto płatne | Praca |
|---|---|---|---|---|---|
| 1 | **Apple Health – odczyt** | waga, tętno spoczynkowe, HRV i sen wpadają do check-inu same; rano zostaje „nogi” i samopoczucie | własna wtyczka Swift (§ 2) | nie* | M |
| 2 | **Haptyka** | potwierdzenie zapisu, wybór RPE/skali, podniesienie dnia w Planie, błąd walidacji | `@capacitor/haptics` | nie | S |
| 3 | **Lokalne powiadomienia** | przypomnienie o check-inie, „za godzinę jazda – plan jest na Bolcie?”, bez serwera | `@capacitor/local-notifications` | nie | S |
| 4 | **Aparat natywny** | zdjęcie posiłku/etykiety bez `<input type=file>`, od razu JPEG ≤ 1024 px | `@capacitor/camera` | nie | S |
| 5 | **Skaner kodów + Open Food Facts** | produkt ze sklepu bez zdjęcia i bez modelu – wartości na 100 g z bazy | `@capacitor-mlkit/barcode-scanning` lub VisionKit we własnej wtyczce | nie | M |
| 6 | **Apple Health – zapis** | kcal, białko, węglowodany i tłuszcz z posiłków w Zdrowiu (bilans w jednym miejscu) | ta sama wtyczka, `HKCorrelation` typu food | nie* | S |
| 7 | **Szybkie akcje ikony** | przytrzymanie ikony: Check-in, Dodaj posiłek, Trener | `@capawesome/capacitor-app-shortcuts` | nie | S |
| 8 | **Widżet „Dziś”** | trening dnia, budżet kcal i białko na ekranie początkowym i blokady | rozszerzenie WidgetKit (Swift) + App Group; dane zapisuje aplikacja przy synchronizacji | nie* | L |
| 9 | **Push z serwera (APNs)** | „jazda wgrana – podsumowanie”, odprawa rano – także przy zamkniętej aplikacji | `@capacitor/push-notifications` + `push-send` wysyła też na tokeny APNs | **tak** | M |
| 10 | **Logowanie i OAuth natywnie** | link z maila otwiera aplikację; Strava/Wahoo łączone w aplikacji | Universal Links (Associated Domains – **konto płatne**); OAuth przez `@capacitor/browser` + własny schemat `trening://` (działa bez płatnego) | częściowo | M |
| 11 | **Siri / Skróty (App Intents)** | „Zapisz wagę 103,4”, „Co mam dziś?”, „Dodaj posiłek” | Swift App Intents czytające dane z App Group | nie* | L |
| 12 | **Lokalizacja do pogody** | prognoza bez wpisywania miejscowości | `@capacitor/geolocation` („przy używaniu”) | nie | S |
| 13 | **Sesja w Keychain** | token Supabase poza `localStorage` WebView | `@capgo/capacitor-native-biometric` / własny zapis Keychain | nie | S |

\* Darmowe konto (Personal Team) pozwala na HealthKit i App Groups, ale instalacja wygasa po 7 dniach – do sprawdzenia
przy pierwszym buildzie z uprawnieniem (Xcode pokaże błąd „capability not supported”, jeśli Apple to zmieniło).

Odpada z decyzji 26.10.2026: Live Activity siłowni i timer przerwy. Apple Watch – osobny projekt, poza zakresem.
Treningi z Watcha/Health jako zapas za Stravę – nie teraz: Strava i Bolt same zapisują jazdy do Zdrowia, więc import
z Health dublowałby jazdy (do rozważenia tylko jako „jazda bez Stravy” z deduplikacją po czasie startu).

## 2. Apple Health – projekt

**Zakres v1 (odczyt, przy otwarciu aplikacji i przed check-inem):**

| Typ HealthKit | Pole w aplikacji | Zasada |
|---|---|---|
| `bodyMass` (ostatnia z dziś, inaczej z 24 h) | `checkins.weight_kg` | podpowiedź w check-inie z dopiskiem „z Wagi/Zdrowia, 6:42”; zapis dopiero po potwierdzeniu lub automatycznie, gdy pole puste – nigdy nie nadpisuje wpisu ręcznego |
| `restingHeartRate` (dziś) | `checkins.resting_hr` | jak wyżej |
| `heartRateVariabilitySDNN` (średnia z nocy) | **nowe** `checkins.hrv_ms` | tylko dane – ocenę liczy silnik |
| `sleepAnalysis` (sen główny, fazy asleep*) | **nowe** `checkins.sleep_min` | obok subiektywnej skali `sleep` 1–5, nie zamiast niej |
| `vo2Max` (opcjonalnie) | `baseline_entries` | tylko jako punkt na wykresie w Postępie (etap 5) |

- **Silnik:** nowy `src/engine/readiness.ts` (czysty TS + testy) – HRV i tętno spoczynkowe względem własnej średniej
  z 7 i 28 dni (np. HRV < średnia 7 d − 1 SD i RHR > średnia + 5 bpm dwa dni z rzędu → flaga „zmęczenie”). Flaga trafia do
  `warningsFor` (podpowiedź jak R-reguły: lżej / zamiana), do kontekstu Trenera (`coachContext.flags`) i do karty Dziś.
  Progi w programie (`rules`), nie w kodzie – drugi zawodnik może mieć inne.
- **Źródło danych:** kolumna `checkins.field_sources` (jak `field_updated_at` w profilu) – `manual` / `health`, żeby UI
  mógł pokazać „z Zdrowia” i żeby ręczny wpis zawsze wygrywał.
- **Migracja:** `checkins.hrv_ms smallint`, `sleep_min smallint`, `field_sources jsonb`; Dexie v10; web pokazuje te dane,
  ale ich nie zbiera.
- **Zapis (v1.1):** posiłek zapisany w aplikacji → korelacja `food` (energia, białko, węglowodany, tłuszcz) z metadanymi
  `HKMetadataKeyFoodType` = nazwa i własnym identyfikatorem posiłku; usunięcie posiłku usuwa próbki o tym identyfikatorze.
  Wagi z check-inu do Zdrowia nie zapisujemy (zwykle przyszła stamtąd – pętla i duble).
- **Wtyczka:** własna, lokalna (`ios/App/App/Plugins/TreningHealth.swift`, ok. 250 linii): `isAvailable`,
  `requestAuthorization(read, write)`, `readDay(date)` (zwraca wszystkie pola jednym wywołaniem), `saveMeal(meal)`,
  `deleteMeal(id)`. Interfejs TS w `src/native/health.ts` z pustą implementacją webową. Uzasadnienie: potrzebujemy
  korelacji `food`, nocnej średniej HRV i faz snu – `@capgo/capacitor-health` (MPL-2.0, aktywnie rozwijana) czyta wagę,
  RHR, HRV i sen, ale nie zapisuje białka ani korelacji; zostaje jako zapas, gdyby własna wtyczka się nie sprawdziła.
- **Uprawnienia:** włącznik w Ja → „Zdrowie” (nie pytamy na starcie), opisy po polsku w `Info.plist`
  (`NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`), capability HealthKit w Xcode. iOS nie mówi
  aplikacji, czy odmówiono odczytu – brak danych pokazujemy jako „brak danych w Zdrowiu (sprawdź uprawnienia)”.
- **App Store (docs/26 § 5):** dane HealthKit nie idą do reklam ani iCloud; do serwera trafiają tylko liczby check-inu
  (jak przy wpisie ręcznym) – wpisać to w polityce prywatności. Do Trenera (Anthropic) trafiają w kontekście, więc
  ekran zgody na AI musi wymieniać „dane ze Zdrowia”.
- **Później:** odczyt w tle (`HKObserverQuery` + background delivery) – waga z łazienki od razu w aplikacji i w
  porannej odprawie mailem; wymaga uprawnienia background delivery.

## 3. Przegląd UI/UX `/m` wobec HIG (26.10.2026)

Źródło: przegląd kodu (`src/m`, `LoginScreen`) i zrzuty z symulatora na koncie zawodnika. Ścieżki względem `src/`.
Co jest dobrze i zostaje: duże tytuły zwijane do paska, grupy w stylu listy ustawień, arkusze od dołu, pływający pasek
zakładek z osobnym przyciskiem Trener (zgodny z układem pasków w iOS 26), jasne tło `#f2f2f7`, krzywa animacji arkusza,
wyłączenie animacji przy „ogranicz ruch”, pola liczbowe z list zamiast klawiatury.

### 3.1 Do poprawy przed codziennym użyciem (wysoki priorytet)

| Problem | Gdzie | Poprawka |
|---|---|---|
| W stopce Ja widać diagnostykę okna („okno 390×844 · ekran … · leczenie ×n”) | `m/screens/MeScreen.tsx:207`, `m/useViewport.ts` | tylko w buildzie deweloperskim |
| „Wstecz” prowadzi pod stały adres (z Ja albo „Jutro” wraca do Planu) i dokłada wpis historii | `m/components/Chrome.tsx:30`, `TodayScreen.tsx:74` | `navigate(-1)`, gdy jest historia; adres tylko awaryjnie |
| Brak gestu wstecz od lewej krawędzi | powłoka | `allowsBackForwardNavigationGestures` w podklasie `CAPBridgeViewController` albo gest krawędzi w JS |
| Arkusz ma uchwyt, ale nie da się go ściągnąć w dół; znika bez animacji | `m/components/Chrome.tsx:146-164` | przeciąganie z prędkością, wysokości średnia/pełna, animacja zamykania ~0,25 s |
| Dotknięcie tła zamyka arkusz z niezapisanymi zmianami (check-in, Progi, posiłek) | `Chrome.tsx:148` | przy zmianach: „Odrzucić zmiany?” |
| Komunikaty (toast) chowają się pod otwartym arkuszem | `components/Toast.tsx:120` (z-40) vs arkusz z-50 | warstwa komunikatów nad arkuszami |
| „Wyloguj” bez potwierdzenia (26.10 wylogowało konto w symulatorze przy przypadkowym dotknięciu) | `MeScreen.tsx:183-196` | arkusz akcji z czerwonym „Wyloguj” i „Anuluj”; tak samo „Wyczyść” rozmowę w Trenerze |
| RPE 1–10 jako 10 kolumn – przyciski ok. 31 pt szerokości | `m/components/Bits.tsx:50-52` | dwa rzędy po 5 (≥ 44×44) |
| Chipy (Trener, porcje, jazdy dnia) ok. 30 pt wysokości; przyciski tekstowe „więcej”, „Inne zdjęcie” ok. 20 pt | `m/m.css:469`, `TodayScreen.tsx:79`, `MealSheet.tsx:239` | obszar dotyku 44 pt (wygląd może zostać mniejszy) |
| Biały tekst na pomarańczowym/zielonym kolorze dnia: kontrast 2,2–2,6:1 (minimum 4,5:1, duży tekst 3:1) | `m/m.css:237`, `m/dayColor.ts` | ciemniejsze odcienie do wypełnień (np. #c46a00, #1f8a3c); kolor dnia zostaje do akcentów |
| `--label-3` (kontrast ~1,9:1) niesie dane: W/kg, cel masy, TSB, dni tygodnia, strefy | `MeScreen.tsx:226`, `WeekStrip.tsx:51`, `SummaryScreen.tsx:123` | `--label-2`; `--label-3` tylko na podpowiedzi w pustych polach |

### 3.2 Ważne (średni priorytet)

- **Nawigacja:** przycisk wstecz z nazwą poprzedniego ekranu („‹ Plan”); przejście push/pop między ekranami
  (View Transitions); zapamiętanie przewinięcia przy powrocie; ponowne dotknięcie aktywnej zakładki przewija na górę;
  tytuł arkusza skracany wielokropkiem (długie „pt 24.10 · Interwały…” nachodzi na przyciski); w menu dnia „Wstecz” po
  lewej, „Zamknij” po prawej; jeden przycisk „Zapisz” w nagłówku arkusza zamiast dwóch.
- **Pomoc:** pełny ekran w `/m` zamiast `pomoc.html` z przeładowaniem WebView (tymczasowy wariant `in-app` już jest).
- **Informacja zwrotna:** „Oznacz jako pominięte” z komunikatem i „Cofnij”; błędy zapisu w arkuszach (dziś brak `catch`
  – nieudany zapis milczy); arkusz Progi otwiera się od razu z kółkiem ładowania; pociągnięcie w dół odświeża (Dziś, Ja)
  zamiast wiersza „Synchronizuj teraz”; haptyka (§ 1 pkt 2) zamiast `navigator.vibrate`, którego iOS nie ma.
- **Listy:** ważna liczba nie może ginąć w wielokropku – km/W/bpm do kolumny wartości albo podpis w dwóch liniach
  (`MeScreen.tsx:131`, `TodayScreen.tsx:133`); bez strzałki na wierszach-akcjach („Synchronizuj teraz”), ze strzałką na
  wierszach otwierających podlistę („Przenieś”, „Zamień”); „Usuń posiłek” na czerwono; cały wiersz z przełącznikiem
  przełącza (nie tylko sam przełącznik).
- **Menu dnia tylko przytrzymaniem** (`PlanScreen.tsx:142`) – trudne do odkrycia i z VoiceOverem: dodać przycisk „…”
  albo gest przesunięcia wiersza, zostawić przytrzymanie jako skrót.
- **Logowanie:** pola w `<form>` z `enterKeyHint` (Return wysyła), kod `inputmode=numeric`, `autocomplete=one-time-code`,
  automatyczne logowanie po ostatniej cyfrze; ekran w stylu `m.css` (dziś wygląd `/i`, ikona roweru zamiast ikony
  aplikacji); „Mam link z maila” ukryć w aplikacji do czasu Universal Links.
- **Teksty iOS:** Strava/Wahoo „łączenie na trening.felsztukier.pl” to ślepa uliczka – do czasu OAuth w aplikacji wiersz
  otwiera stronę w `SFSafariViewController`; komunikat „Ustawienia → Integracje” w Planie (`PlanScreen.tsx:64`) wskazuje
  ekran, którego w aplikacji nie ma.

### 3.3 Dostępność i typografia

- **Dynamic Type:** wszystkie rozmiary w px (`m/m.css:39`, `81-131`) – ustawienie wielkości tekstu w iOS nic nie zmienia.
  Minimum: skala tekstu w `rem` od korzenia i rozmiar korzenia z `-apple-system-body` (WKWebView przenosi ustawienie
  systemowe); test w rozmiarach dostępności na trzech zakładkach. Osobne zadanie (M), bo dotyka każdego ekranu.
- **VoiceOver:** tytuł w pasku czytany dwa razy (`Chrome.tsx:36` – `aria-hidden`); karta tygodnia ma etykietę, która
  zastępuje całą treść (`WeekStrip.tsx:25`) – zbudować ją z danych; oś dnia i wyniki dni w Planie tylko kolorem i
  symbolami ✓ ✕ – + (`TodayScreen.tsx:96`, `PlanScreen.tsx:27`) – ukryty tekst „zrobione/zmienione/pominięte”; w czacie
  region `aria-live` obejmuje całą historię (`CoachSheet.tsx:163`) i nie wiadomo, kto mówi – prefiksy „Ty:”/„Trener:”;
  tytuły kart i arkuszy jako nagłówki.
- **Ruch:** animacje nieskończone (kropki pisania, pasek postępu) zatrzymać przy „ogranicz ruch”; płynne przewijanie
  też; „wciśnięcie” wiersza przy przytrzymaniu startuje od razu – opóźnić ~150 ms (jak podświetlenie wierszy, 26.10).
- **Drobne:** `title` (dymek) na osi dnia, style `hover:` w komunikatach, `-webkit-touch-callout` na grafikach pasków.

## 4. Etapy (zastępują docs/26 § 7, etapy 1–4)

| Etap | Zakres | Konto płatne | Czas |
|---|---|---|---|
| **1a. Szlify HIG** | § 3.1 w całości, haptyka, potwierdzenia, nawigacja wstecz + gest, arkusze z przeciąganiem | nie | 1–1,5 dnia |
| **1b. Parytet** | ustawienia konta/maili/programu w Ja, OAuth Strava/Wahoo przez `@capacitor/browser` + `trening://`, pomoc jako ekran, aparat natywny, logowanie w stylu `/m`, § 3.2 | nie | 2 dni |
| **2. Apple Health** | wtyczka, migracja, `readiness.ts` z testami, check-in z danymi ze Zdrowia, włącznik w Ja; potem zapis posiłków | nie* | 2 dni |
| **3. Wymogi App Store** | usuwanie konta, polityka prywatności (z HealthKit), ekran zgody na AI (z danymi ze Zdrowia), „nie porada medyczna”, opisy uprawnień, konto demo | nie | 1–2 dni |
| **4. Powiadomienia** | lokalne (check-in, przed jazdą) od razu; APNs dla zdarzeń z serwera, Universal Links | APNs i Universal Links – **tak** | 1–2 dni |
| **5. Wyróżniki** | skaner kodów + Open Food Facts, szybkie akcje, widżet Dziś, Dynamic Type; App Intents na końcu | nie* | 3–4 dni |
| **6. Brakujące ekrany** | Postęp w `/m`, kalendarz miesiąca | nie | 2–4 dni |

Poprawki z § 3 są we wspólnym kodzie `/m` – poprawiają też wersję webową na telefonie. Każdy etap kończy się testem
w symulatorze i na telefonie (zrzuty z iPhone'a – ocena wyglądu wg zrzutów, nie opisu).

## 5. Decyzje do podjęcia

1. **Apple Developer Program teraz czy przed etapem 4?** Bez niego: instalacja z Xcode co 7 dni, brak APNs i Universal
   Links. Etapy 1–3 i 5 da się zrobić bez niego.
2. **Jakie urządzenia zapisują do Zdrowia?** (waga z Wi-Fi/Bluetooth, Apple Watch/opaska – HRV i sen). Bez zegarka
   z pomiarem nocnym `readiness.ts` ma tylko wagę i ewentualnie tętno spoczynkowe – wtedy wystarczy wersja minimalna.
3. **Zapis posiłków do Zdrowia** – tak/nie (przydatne, jeśli patrzysz na bilans w Zdrowiu albo innej aplikacji).
4. **Dynamic Type** – pełne skalowanie (osobne zadanie) czy tylko poprawki kontrastu i rozmiarów minimalnych.
5. **Kolejność:** rekomendacja 1a → 2 (Health) → 1b → 3; Health wcześniej, bo to główny powód aplikacji natywnej.

## 6. Informacja zwrotna: komunikaty, czekanie, potwierdzenia (26.10.2026)

Przegląd wszystkich komunikatów, stanów oczekiwania i potwierdzeń osiągalnych z `/m` i aplikacji iOS
(`VITE_TARGET=ios`) wobec HIG (Feedback, Alerts, Action sheets, Progress indicators) – i przebudowa. Ścieżki względem `src/`.

### 6.1 Zasady

- **Krótkie potwierdzenie** – pigułka u góry pod paskiem statusu (jak systemowe „Tryb cichy”, AirPods): ikona + jedno
  zdanie, ok. 2 s, dotknięcie albo przesunięcie w górę zamyka; w aplikacji iOS haptyka `success`.
- **Cofnij** – ciemny pasek nad pływającym paskiem zakładek (jak „Cofnij wysyłkę” w Poczcie), 7 s, przycisk ≥ 44 pt,
  przesunięcie w dół zamyka. Przy otwartym arkuszu (pasek zakładek schowany) – 16 pt nad dolną krawędzią.
- **Błąd** – baner u góry: tytuł „co się nie udało” (`errorTitle`, np. „Nie wysłano na Bolta”) + zdanie „dlaczego i co
  zrobić” z `lib/errors.ts` (`friendlyError`: brak sieci, przekroczony czas, sesja, limit, błąd serwera; polskie
  komunikaty z naszego kodu bez zmian, angielskie bibliotek zamienione na zdanie ogólne). Przy błędach przejściowych
  przycisk **„Ponów”** powtarza tę samą akcję. 7 s, `role="alert"`, haptyka `error`.
- **Czekanie na miejscu akcji** – `useAction()` (`components/Toast.tsx`) daje `pending`, a wynik i błąd idą przez
  `toast.run(…, { quiet: true })`, więc nie ma globalnego „w toku”. Krótkie akcje: kółko aktywności w przycisku
  (`Btn busy="Wysyłam"` – `aria-busy`, drugie dotknięcie nic nie robi). Dłuższe (≥ ~2 s): animacja z rysunkiem
  (`Waiting`/`WaitArt` w `m/components/Waiting.tsx`) w karcie albo wierszu. Akcja bez stanu na miejscu (np. wspólne
  `usePlan.applyAction`) pokazuje pigułkę „w toku” dopiero po 0,7 s – szybkie kończą się bez migania.
- **Anulowanie** tam, gdzie czekanie jest długie i nic nie zmienia na serwerze: rozpoznawanie posiłku („Anuluj”) i
  odpowiedź trenera („Zatrzymaj” – rozmowa wraca do stanu sprzed wiadomości, tekst wraca do pola). `AbortSignal` idzie
  do `functions.invoke`. Wysyłki na Bolta i synchronizacji nie anulujemy (stan po stronie Wahoo/serwera byłby niepewny).
- **Nieodwracalne** – `confirmAction` (`native/confirm.ts`): w aplikacji iOS systemowy arkusz akcji
  (`@capacitor/action-sheet`) z czerwoną akcją i „Anuluj”; w `/m` w przeglądarce ten sam układ w HTML
  (`m/components/ActionSheetHost.tsx`, rejestracja przez `setWebConfirm`, `role="alertdialog"`, fokus na „Anuluj”, Esc =
  nie); poza `/m` – `window.confirm`. **Odwracalne** (pominięcie jazdy, przeniesienie, zamiana) – bez pytania, za to z
  „Cofnij” (HIG: lepiej pozwolić cofnąć niż pytać).
- **Miejsce i dostępność** – safe areas (`env(safe-area-inset-*)`), komunikaty nad arkuszami (z-60), arkusz akcji nad
  nimi (z-70); regiony `aria-live="polite"`, błąd `role="alert"`; „ogranicz ruch” – komunikaty tylko się pojawiają
  (bez wjazdu), animacja oczekiwania stoi (pierwsza klatka), kółko aktywności się kręci (jak systemowe).
- Pełna aplikacja i `/i` zostają przy dotychczasowym wyglądzie (`web`); `/m` włącza wygląd `ios` na czas montowania
  (`useToastStyle('ios')`), aplikacja iOS ma go od startu. API `toast.run`/`notify` bez zmian dla starych wywołań.

### 6.2 Animacja oczekiwania

Czarno-biały rysunek kreską z fal.ai (`scripts/fal-art.mjs`, zasoby `wait-*`, styl `LINE`; alfa z jasności:
`scripts/line-art.py`). Trzy warianty do porównania na ukrytej stronie **`/m/czekanie`** (tam też katalog wszystkich
stanów do zrzutów):

| Wariant | Jak | Rozmiar |
|---|---|---|
| A · koło i wiatr | `wait-wheel.png` obracane w CSS, linie wiatru i drogi w SVG | 33 KB |
| B · rowerzysta | `wait-rider.png` (puste koła) + szprychy SVG obracane w CSS, kołysanie, wiatr | 48 KB |
| **C · klip (wybrany)** | Kling 2.1 (fal.ai) z rysunku rowerzysty, pierwsza = ostatnia klatka; wycięty jeden obrót korby (24 klatki → 12, pętla 1 s), alfa z jasności, animowany WebP bezstratny | **105 KB** + klatka statyczna 9 KB |

Wybór: `WAIT_VARIANT` w `Waiting.tsx`. C ma prawdziwe pedałowanie i zostaje ostry na Retinie (260 px przy 96–112 pt
to ok. 2,3×). Przy „ogranicz ruch” `<picture>` podaje `wait-clip-still.webp`. PWA trzyma klip w precache
(`vite.config.ts`), rysunki A/B są tylko do podglądu (poza precache).

### 6.3 Inwentarz i werdykty

| # | Miejsce | Było | Werdykt → teraz |
|---|---|---|---|
| 1 | `components/Toast.tsx` | pasek postępu u góry, kolorowe prostokąty u dołu z „szczegóły” (angielski błąd biblioteki wprost) | **przebudowane**: wygląd `ios` (pigułka, baner błędu, pasek „Cofnij”), `friendlyError`, „Ponów”, `useAction`, haptyka też w `notify` |
| 2 | Dziś → „Wyślij na Bolta” (`m/screens/TodayScreen.tsx`) | globalny „Wysyłam na Bolta…” + zielony prostokąt | **na miejscu**: animacja w karcie, potem pigułka „Wysłano na Bolta. Zsynchronizuj licznik.”; błąd „Nie wysłano na Bolta” + rada/„Ponów” |
| 3 | Jazda → „Wyślij na Bolta” (`RideScreen.tsx`) | jak 2 | jak 2 (przy okazji: hook przed wczesnym `return`) |
| 4 | Plan → „Wyślij” tydzień (`PlanScreen.tsx`) | globalny komunikat | **w przycisku**: kółko + „Wysyłam”; tekst „Wahoo nie jest połączone” wskazuje pełną aplikację (w `/m` nie ma Integracji) |
| 5 | Plan → przenieś/zamień/pod dachem/pomiń/cofnij (menu dnia) | „Przenoszę…” + wynik z „Cofnij” | **bez „w toku”** (zapis lokalny), pasek „Cofnij”; cofnięcie → pigułka „Przywrócono plan”. Pominięcie bez pytania (odwracalne) |
| 6 | Dziś → RPE, Podsumowanie → RPE | „Zapisuję RPE…” + wynik | pigułka „RPE 7 zapisane”, błąd „Nie zapisano RPE” |
| 7 | Dziś → „Cofnij” na karcie pominiętej | „Przywracam…” | pigułka „Trening wrócił do planu” |
| 8 | Dziś → „Oznacz jako pominięte” (dzień bez jazdy) | **bez żadnej informacji** | pigułka „Oznaczono jako pominięte” + „Cofnij” |
| 9 | Dziś → ostrzeżenie z akcją (`app/usePlan.ts` `applyAction`) | globalny „Zmieniam plan…” | zostaje wspólne z pełną aplikacją; w `/m` pigułka „w toku” dopiero po 0,7 s |
| 10 | Check-in → Zapisz (`CheckinSheet.tsx`) | zapis bez komunikatu, **błąd milczał** | pigułka „Check-in zapisany”; błąd – arkusz zostaje z danymi, baner z radą |
| 11 | Ja → Progi i miernik → Zapisz (`SettingsSheets.tsx`) | **błąd milczał** | pigułka „Zapisano progi” / baner „Nie zapisano progów” |
| 12 | Ja → Pogoda: „Użyj mojej lokalizacji”, „Szukaj” | globalne „Ustalam…”, „Znaleziono 3” | **w przycisku**; wynik widać w liście, „Nic nie znaleziono – sprawdź pisownię” pod polem; błąd z radą (np. zgoda na lokalizację) |
| 13 | Ja → „Synchronizuj teraz” (`MeScreen.tsx`) | globalny „Synchronizuję…” | **w wierszu**: „Synchronizuję…” + animacja (także przy synchronizacji w tle); błąd „Nie zsynchronizowano” + „Ponów” |
| 14 | Ja → Apple Health (włącznik) | **błąd uprawnień/odczytu milczał** | baner „Nie połączono z Apple Health” z radą; wynik jak dotąd (pigułka z danymi dnia albo rada o uprawnieniach) |
| 15 | Ja → Powiadomienia (włącznik) | globalny komunikat | zostaje `toast.run` – pigułka „w toku” po 0,7 s (subskrypcja bywa szybka), wynik w pigułce |
| 16 | Ja → Wyloguj | arkusz akcji ✓ (etap 1a) + „Wylogowuję…” | arkusz zostaje (nieodwracalne – trzeba się zalogować); bez „w toku”, pigułka „Wylogowano” |
| 17 | Posiłek → „Rozpoznaj” (`MealSheet.tsx`, ok. 10 s) | napis w przycisku „Analizuję zdjęcie… (ok. 10 s)”, bez anulowania, błąd po angielsku możliwy | **animacja + „Anuluj”** na miejscu przycisku (zamknięcie arkusza też przerywa); błąd „Nie rozpoznano posiłku. …” + „Spróbuj ponownie”; haptyka |
| 18 | Posiłek → Zapisz | prostokąt z „Cofnij”; **błąd zapisu milczał** | pasek „Cofnij” (nowy) / pigułka (edycja); błąd w banerze |
| 19 | Posiłek → „Usuń posiłek” | usuwało od razu, „Cofnij” | **arkusz akcji** z czerwonym „Usuń posiłek” (dane wpisane ręcznie, arkusz znika), potem i tak „Cofnij”; przycisk czerwony |
| 20 | Trener → odpowiedź (`CoachSheet.tsx`) | kropki pisania + „Trener odpowiada…”, błąd jako surowy tekst | **animacja + „Zatrzymaj”**; błąd „Trener nie odpowiedział. …” z radą; zmiany z narzędzi – pigułka jak dotąd |
| 21 | Trener → „Wyczyść” | arkusz akcji ✓ | bez zmian (nieodwracalne) |
| 22 | Arkusz z niezapisanymi zmianami (`Chrome.tsx`) | „Odrzucić zmiany?” ✓ | bez zmian; w przeglądarce teraz arkusz HTML zamiast `window.confirm` |
| 23 | Onboarding: brak odpowiedzi, zapis, „Usuń odpowiedzi” | prostokąty, błąd surowy, podwójna haptyka | baner z listą braków, błąd z radą, pigułki sukcesu; arkusz akcji przy usuwaniu bez zmian |
| 24 | Logowanie (`ios/screens/LoginScreen.tsx`, wspólne z `/i`) | `toast.run` „Wysyłam kod…”, „Sprawdzam kod…” | zostaje (ekran `/i` – osobne zadanie z § 3.2 „Logowanie”); w `/m` i iOS pigułka „w toku” po 0,7 s, błędy z radą |
| 25 | Logowanie Google/Strava (`OAuthButtons.tsx`) | stan w przycisku, bez limitu 60 s ✓ | bez zmian |
| 26 | `window.confirm` / `alert` | tylko w `confirmAction` (web) | w `/m` zastąpione arkuszem HTML; `alert` nie ma |
| 27 | Ekran czekania na profil/plan (`SettingsGate` → `WaitingScreen` w `App.tsx`) | pełny ekran przy pierwszym pobraniu | zostaje – musi blokować (żaden ekran nie może zobaczyć cudzego programu, CLAUDE.md) |

**Nie sprawdzone na telefonie:** haptyka (symulator jej nie ma), wygląd systemowego arkusza akcji w ciemnym motywie
telefonu, VoiceOver na prawdziwym urządzeniu (sprawdzone tylko role/`aria-live` w kodzie i drzewie dostępności).

## 7. Ekran logowania `/m` (26.10.2026)

Uwaga użytkownika: dotychczasowy ekran (wspólny z `/i`, styl `ios.css`, mała ikona roweru, szare sekcje) nie pasował do
reszty `/m`. Nowy ekran: `src/m/LoginScreen.tsx` + `src/m/login.css`; `/i` zostaje przy swoim (`ios/screens/LoginScreen.tsx`).

- **Ilustracja** `public/m/art/login-hero.webp` (33 KB, fal.ai `login-hero` w `scripts/fal-art.mjs` – trener na rowerze
  wśród wzgórz, styl grafik `/m`) od krawędzi do krawędzi, także pod paskiem statusu; dół rozpływa się w tło nakładką
  z gradientem (`::after`; `mask-image` w WKWebView zostawiał ostrą krawędź). Bez animacji obrazka – w WKWebView animowany obrazek
  dostawał własną warstwę i przykrywał nakładkę gradientu. Precache PWA
  (`m/art/*.webp`).
- **Układ:** tytuł 40 pt, jedno zdanie o aplikacji, Google i Strava jako przyciski 50 pt (`OAuthButtons large`), linia
  „albo kodem z maila”, pole e-mail w karcie (`enterKeyHint="send"`, Return wysyła), „Wyślij kod” z kółkiem w przycisku.
  „Bez konta” – szklana pigułka w rogu ilustracji (jak „Pomiń”), pod spodem jedno zdanie, co to znaczy.
- **Kod:** sześć kafelków nad jednym niewidocznym polem (`inputMode=numeric`, `autocomplete=one-time-code` – podpowiedź
  kodu z Poczty nad klawiaturą, wklejanie), logowanie samo po szóstej cyfrze, „Zmień” adres, „Nie doszedł? Wyślij
  ponownie”. Podgląd bez wysyłania maila: `/m?kod` (tylko build deweloperski).
- **Błędy** pod formularzem po polsku (`friendlyError`), haptyka sukcesu/błędu; bez komunikatów u góry.
- „Mam link z maila” tylko w przeglądarce – w aplikacji iOS link z maila nie otworzy aplikacji do czasu Universal Links.
- **Nie sprawdzone:** prawdziwe logowanie kodem i przez Google/Stravę na nowym ekranie (logika bez zmian – te same
  `auth.signIn*` i `OAuthButtons`), podpowiedź kodu z Poczty na telefonie.
