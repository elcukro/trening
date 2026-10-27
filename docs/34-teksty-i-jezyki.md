# 34 · Nazwa „Bicycle Coach”, przegląd tekstów i dwa języki (26.10.2026)

Decyzja użytkownika z 26.10.2026: oficjalna nazwa aplikacji to **Bicycle Coach**; wszystkie teksty do przeglądu; aplikacja
po polsku i po angielsku – język z ustawień systemu, do zmiany w Ustawieniach. Ten dokument to plan (§ 1–7), potem lista
istotnych zmian w tekstach (§ 8) i słowniczek (§ 9).

## 1. Zakres

| Obszar | Co się zmienia |
|---|---|
| Nazwa | „Bicycle Coach” wszędzie, gdzie aplikacja mówi o sobie: logowanie, `<title>`, manifest PWA, nazwa pod ikoną iOS (`CFBundleDisplayName`, `capacitor.config.ts`), pomoc, wiersz wersji, nadawca maili i stopki, tytuły push, podpis na Stravie („Notatki: Bicycle Coach”), onboarding |
| Teksty | `/m`, aplikacja iOS, pełna aplikacja `/`, `/i`, maile, push, pomoc, komunikaty błędów: jaśniej, krócej, jedna nazwa na pojęcie (§ 9), błąd = co się stało + co zrobić |
| Języki | PL i EN: UI, treść programów z `data/`, maile/push/komunikaty Edge Functions, odpowiedzi AI (czat, notatka, list tygodnia), pomoc |
| Grafika | tytuł „Bicycle Coach” do animowanego ekranu startowego (fal.ai, 2–3 propozycje do wyboru przed podpięciem) |

**Bez zmian (identyfikatory):** repozytorium, baza i tabele, bundle id `pl.felsztukier.trening`, domena
`trening.felsztukier.pl`, adres nadawcy `trening@felsztukier.pl` (zmienia się tylko nazwa wyświetlana), nazwa bazy Dexie
`trening`, klucze `trening:*` w `sessionStorage`, ścieżki URL (`/m/jazda`, `/postep` …), schemat URL `trening://`.
Zmiana któregokolwiek zerwałaby dane lokalne, logowanie albo linki z maili.

## 2. Podejście: własny typowany słownik, bez biblioteki

i18next dałby interpolację w łańcuchach i ładowanie zasobów, których nie potrzebujemy (dwa języki, wszystko w bundlu,
offline-first). Zamiast tego **słownik TS** w `src/i18n/`:

- `pl/<przestrzeń>.ts` – źródło prawdy (`export default { … }`), `en/<przestrzeń>.ts` typowany `typeof pl`, więc
  **brak klucza albo klucz nadmiarowy to błąd `tsc`**; do tego test `src/i18n/__tests__/dict.test.ts` porównuje
  drzewa kluczy i liczbę argumentów funkcji w czasie wykonania.
- Interpolacja i liczba mnoga przez **funkcje** w słowniku: `rides: (n: number) => plCount(n, 'jazda', 'jazdy', 'jazd')`
  i `(n) => enCount(n, 'ride', 'rides')`. `plWord`/`plCount` używają `Intl.PluralRules('pl')` (1 / 2–4 / 5+, ułamki jak
  „1,5 godziny”). Typ argumentów wymusza tę samą sygnaturę w obu językach.
- `useT()` w komponentach (`src/i18n/react.tsx`), `t()` poza React (silnik, synchronizacja, formatery).
- **Bieżący język to stan modułu** (`getLang()` w `src/i18n/core.ts`) – formatery (`num`, `fmtShort`), mapy etykiet
  (`DAY_TYPE_LABEL` przez `localized()`) i silnik czytają go w chwili wywołania. Zmiana języka **przemontowuje drzewo
  React** (`LangProvider` z `key={lang}`), więc nic nie zostaje w starym języku. Zakaz: wyliczania tekstów na poziomie
  modułu (stałe z `t()` przy imporcie) – tylko w funkcjach albo przez `localized()`.
- Daty i liczby przez `Intl`/date-fns wg języka: `pl-PL` (przecinek dziesiętny, „śr 16.09”) i `en-GB` (kropka,
  „Wed 16 Sep”, 24 h). Tydzień od poniedziałku w obu (en-GB ma poniedziałek). Jednostki metryczne w obu.
- Błędy: `UserError` (`@/i18n`) = komunikat z naszego kodu już w języku zawodnika; `friendlyError` pokazuje go wprost,
  resztę zamienia na zdanie ze słownika `errors`.

## 3. Przestrzenie nazw

| Przestrzeń | Pliki | Zawartość |
|---|---|---|
| `common` | wszędzie | przyciski i słowa wspólne (Zapisz, Anuluj, Cofnij…), nazwa aplikacji, jednostki, wybór języka |
| `errors` | `src/lib/errors.ts`, `Toast` | ogólne komunikaty błędów |
| `login` | `src/m/LoginScreen.tsx`, `src/components/OAuthButtons.tsx` | logowanie (`/i` ma własne `ios.login`) |
| `m` | `src/m/**` poza onboardingiem | ekrany Dziś / Plan / Ja / jazda / podsumowanie, arkusze, czekanie |
| `coach` | czat trenera w `/m` | rozmowa (chipy są w `day.chips`, czat `/i` w `ios.coach`) |
| `onboarding` | `src/m/onboarding/**`, `src/engine/onboarding.ts` (etykiety) | „Ty i Twój cel” |
| `ios` | `src/ios/**` | stary wygląd `/i` |
| `classic` | `src/features/**` poza Postępem i Ustawieniami, `src/app/**` | pełna aplikacja |
| `progress` | `src/features/progress/**` | Postęp, raporty |
| `settings` | `src/features/settings/**`, arkusze ustawień `/m` | ustawienia (wspólne pojęcia) |
| `day` | `src/day/**` | logika dnia dla `/i` i `/m` (stany, odprawa, podsumowania) |
| `sync` | `src/sync/**`, `src/native/**`, `src/db/**` | synchronizacja, Strava, Wahoo, powiadomienia |
| `engine` | `src/engine/**` | ostrzeżenia reguł, żywienie, pogoda, analiza jazdy, raporty, generator planów |

Serwer (Deno) nie importuje `src/`, więc ma własny słownik `supabase/functions/_shared/i18n.ts` (te same zasady,
`Lang` = `'pl' | 'en'`, jawny parametr `lang` – jedna funkcja obsługuje wielu zawodników).

## 4. Wybór języka i profil

- `settings.language` = `system` | `pl` | `en` (stare zapisy mają `pl` – zostają przy polskim); programy mają
  domyślnie `system`. `system` → `navigator.languages` (`pl*` → polski, każdy inny → angielski).
- Aplikacja iOS: `CFBundleLocalizations` = `pl`, `en` w `Info.plist` – wtedy WKWebView podaje w `navigator.language`
  język telefonu; opisy uprawnień (Zdrowie, lokalizacja) w `pl.lproj`/`en.lproj/InfoPlist.strings`.
  `CFBundleDevelopmentRegion` zmieniony z `pl` na `en` – telefon w języku innym niż pl/en dostaje angielski (polski
  telefon nadal polski).
- Przełącznik: `/m` → Ja → Ustawienia → Język oraz pełna aplikacja → Ustawienia → Język. Nazwy języków zawsze we własnym
  języku („Polski”, „English”).
- Profil: kolumny `profiles.language` (wybór) i `profiles.locale` (`pl`/`en` – język, w którym aplikacja ostatnio się
  wyświetlała; ustawia go aplikacja po zalogowaniu). Serwer pisze maile, push i odpowiedzi AI w `locale`, a bez niego
  w `language`, inaczej po polsku. Migracja `20261027090000_language.sql`, wpisy w `PROFILE_MAP`.
- Aplikacja wysyła nagłówek `x-app-lang` do funkcji AI i integracji (`langHeaders()` w `src/sync/supabase.ts`);
  serwer: nagłówek → `locale` → `language` → `pl`. Do czasu wgrania migracji serwer pisze po polsku.
- Przed zalogowaniem: język z `localStorage` (`bc:lang`) albo systemu. `?lang=en` w URL wymusza język (testy, podgląd).

## 5. Treść programów (`data/`)

Teksty programów (nazwy i opisy treningów, kroki, notatki tygodni, zasady R1–R16, fazy, żywienie, rowery, zadania
sprzętowe, cel, `coach_notes`) mają **tabelę tłumaczeń** `data/i18n/program_en.json` („tekst polski” → „tekst angielski”).
Generatory wpisują do `program.json` / `program-ftp300.json` sekcję `translations.en` z wpisami użytymi w danym programie
i przerywają się, gdy jakiegoś tekstu brakuje. `localizeProgram` (`src/data/localize.ts`) podmienia teksty przy wczytaniu
(`loadProgram(id, lang)`) – struktura, liczby i identyfikatory zostają, więc silnik liczy to samo. **`calendar.json` zostaje
po polsku** i identyczny poza polami `version` i `settings.language` (golden test działa na polskim). Podbite
`PROGRAM_VERSION` obu programów. Pliki pomocnicze czytane przez aplikację (`gear_templates.json`, `packing_list.json`,
`clothing.json`, `gear_tasks_alps.json`) dostają pola angielskie tym samym sposobem. Generator planów w TS
(`src/engine/generator/`) bierze teksty ze słownika `engine` dla języka przekazanego przy regeneracji.

## 6. Serwer i AI

- Maile (`_shared/email_templates.ts`, `email_send.ts`), push (`push-send`), strony potwierdzeń (RPE, nogi, wypisanie)
  i komunikaty błędów Edge Functions – teksty w `_shared/i18n.ts`, język z profilu (`locale` → `language` → `pl`).
  Nazwa nadawcy: `Bicycle Coach <trening@felsztukier.pl>`.
- Prompty (`COACH_SYSTEM`, notatka po jeździe, `WEEK_SYSTEM`, `checkin-parse`, `meal-parse`) zostają polskie jako
  instrukcja; dostają parametr `lang` i dla `en` dopisek „Odpowiadaj wyłącznie po angielsku…”. Weryfikacja liczb
  (`numbersOk`) akceptuje oba separatory dziesiętne. Podpis na Stravie: „Notatki: Bicycle Coach” / „Notes: Bicycle Coach”.
- Pliki `email_*`, `ride_facts.ts`, `week_facts.ts`, `coachContext.ts` zmienia równolegle inna sesja (dane AI z Wahoo,
  docs/33) – tu tylko wyciągnięcie tekstów bez zmiany logiki.

## 7. Co zostaje tylko po polsku (na razie)

- Dokumentacja w `docs/`, komentarze w kodzie, nazwy plików i tras.
- Historyczne dane użytkownika (notatki trenera i listy już zapisane, tytuły jazd na Stravie) – nie tłumaczymy wstecz.
- Fakty dla modeli (`ride_facts`, `week_facts`) mają polskie etykiety – model dostaje je jako dane, a odpowiedź pisze
  w języku zawodnika.
- Ukryte strony diagnostyczne (`/m/czekanie`, linia „Okno: …”).

## 8. Istotne zmiany w tekstach

Notatki z przeglądu każdego obszaru (było → jest, dlaczego). Zmiany drobne (odmiana liczebników, interpunkcja) pominięte.

### 8.1 Mobilny `/m` i komponenty wspólne

- Logowanie `/m`/iOS: tytuł „Trening” → „Bicycle Coach” (`common.appName`).
- Ja → stopka: „Program <wersja> · cel FTP …” → „Bicycle Coach <wersja programu> · cel FTP …” (aplikacja nie ma własnego numeru wersji – pokazujemy wersję programu).
- Ja → Ustawienia → nowy wiersz „Język” (arkusz `LanguageSheet` w `SettingsSheets.tsx`): Język systemu (wykryty, nazwa we własnym języku) / Polski / English, wybór dotknięciem, zapis `settings.language`. Widoczny też w aplikacji iOS.
- Podpowiedź o uprawnieniach Zdrowia: „… → Trening” → „… → Bicycle Coach” (nazwa pod ikoną się zmieniła).
- „klucz” → „akcent”: pasek tygodnia „· klucz: X” → „· akcent: X”; w Planie „★ klucz” → samo „★” (etykieta typu dnia już mówi „Akcent”).
- „lżejszy” (tydzień) → „rozładowanie”: podtytuł Dziś „· tydzień 6 (rozładowanie)”, Plan „Tydzień 6 · … · rozładowanie”.
- „Odpuszczone” → „Pominięty”; „Oznacz jako pominięte” → „Oznacz jako pominięty” (trening); toasty „Oznaczono jako pominięty”.
- Tam, gdzie chodzi o zaplanowaną sesję, „jazda” → „trening”: ekran `/m/jazda` ma tytuł „Trening”, „Tego dnia nie ma treningu w planie”, menu dnia „przytrzymaj dzień z treningiem”, narzędzie trenera „przeniesienie treningu”, powitanie czatu „…poprosić o przeniesienie treningu”.
- „Waga” w check-inie → „Masa ciała” (pole i opis Apple Health: „masa ciała, tętno, HRV i sen…”); karta rano „ostatnia waga 92 kg” → „ostatni pomiar 92 kg”.
- Maile w Ja: „Podsumowanie po treningu” → „Podsumowanie jazdy”, „List trenera w niedzielę” → „List tygodnia w niedzielę”.
- Pogoda: „trafia do odprawy przed jazdą” → „trafia do porannej odprawy”.
- Menu dnia → Przenieś: „dzisiejszy dzień zostanie wolny” (błąd – chodziło o dzień źródłowy) → „a ten dzień stanie się wolny”.
- Karta „Bez jazdy”: „nie było treningu ani oznaczenia” → „nie było jazdy ani oznaczenia… oznacz trening jako pominięty”.
- Brak celów w menu: „Brak wolnych dni w tym miesiącu od dziś.” → „Do końca miesiąca nie ma już wolnych dni.”
- Progi: „Po teście progowym…” → „Po teście FTP…”; „Szukam” → „Szukam…”; „Nie wyszukano” → „Wyszukiwanie nie powiodło się”.
- Połączenia: „łączenie na …/w pełnej aplikacji” → „połączysz na …/w pełnej aplikacji”; status „brak” → „niepołączone”.
- Konto: „Zalogowany” → „Zalogowano”; „Wyloguj” (wiersz) → „Wyloguj się”; „nie pobierają się z konta” → „nie synchronizują się z kontem”.
- Logowanie: przycisk „Zaloguj” → „Zaloguj się”, „Zaloguj linkiem” → „Zaloguj się linkiem”.
- Posiłek: „węgle” → „węglowodany”; błąd zdjęcia + rada „Wybierz inne.”; jazda w karcie Jedzenie „(plan)” → „(wg planu)”; „ponad o ~X” → „ponad budżet o ~X”.
- Wysyłka tygodnia na Bolta: „Wysłano 3 dni” z odmianą; błędy rzucane jako `UserError` („Wysyłka na Bolta wymaga konta. Zaloguj się w zakładce Ja.”, „Wysyłka na Bolta się nie udała. Spróbuj ponownie.”).
- Toast: wewnętrzny błąd limitu czasu po angielsku („Timed out after 60 s”) – nadal rozpoznaje go `friendlyError` (TIMEOUT), użytkownik widzi zdanie ze słownika `errors`.
- Przypomnienie przed testem: „ostatnie 2–3 dni przed nim lekko” → „2–3 dni przed nim lekko”.
- Zakładki: Today / Plan / Me, przycisk „Coach”; „Bilans tygodnia” → „Week so far”; „zgodność” → „plan match”; „Na liczniku” → „On your Bolt”; „Zsynchronizuj licznik” → „Sync your bike computer”.
- Rozpoznawanie posiłku: „Identify meal” (neutralne UK/US zamiast recognise/recognize).
- `/m/czekanie` (`WaitPreview.tsx`) – ukryty katalog komunikatów do zrzutów (docs/34 § 7).
- Linia diagnostyczna okna („· okno …”, `useViewport.ts`) – tylko build deweloperski.
- Zapisana nazwa lokalizacji „Moja lokalizacja (…)” zostaje w języku z chwili zapisu (dane w kv).
- Nowy `e2e/mobile-en.spec.ts` (6 testów, `locale: en-GB` + `?lang=en`): Dziś + check-in, ekran treningu, dzień testu, podsumowanie, Plan z menu dnia, Ja z progami, przełącznik języka PL↔EN, Trener; każdy ekran bez polskich liter.

### 8.2 Onboarding i logika dnia

- „Ja → Twoje potrzeby” (zgoda, „Najpierw lekarz”, podsumowanie, „Gotowe!”) → **miejsce zależne od wyglądu**: `/m` „Ja → Ty i Twój cel” (tak nazywa się grupa w Ja), pełna aplikacja „Więcej → Twoje potrzeby”. Wybór po propsie `me` (`/m…` vs `/wiecej`). Jeśli agent `m` zmieni nazwę grupy w Ja, trzeba poprawić `onboarding.place.m`.
- Zgoda: „Aplikacja nie jest narzędziem medycznym” → „Bicycle Coach nie jest narzędziem medycznym” (`common.appName`).
- Powitanie: dopisane, że plan ułoży Bicycle Coach z odpowiedzi („…ok. 3 minuty – z Twoich odpowiedzi Bicycle Coach ułoży plan”).
- „Gotowe!”: „Twój plan: 22 tygodni” → poprawna odmiana przez `common.weeks(n)` („22 tygodnie”); regex w `e2e/onboarding.spec.ts` poluzowany do `tygodni(e)?`.
- Stopka „Gotowe!”: „Plan liczy kod z Twoich odpowiedzi” (zbyt techniczne) → „Plan powstaje z Twoich odpowiedzi według stałych zasad treningu – trener go tylko objaśnia”.
- Krok Cel: „Jeden główny. Drugi dodasz później.” (obietnica funkcji, której nie ma) → „Wybierz jeden, najważniejszy. Zmienisz go w każdej chwili.”
- Krok Pomiar: „Od tego zależy język planu” → „Od tego zależy, w czym plan poda intensywność: w watach, tętnie albo na odczucie”.
- „Komputer albo zegarek” → „Licznik albo zegarek” (jedno słowo jak „licznik” przy Bolcie); ostrzeżenie `power_no_device` analogicznie.
- Brak odpowiedzi przy zapisie: toast pokazywał ścieżki Zod („current.hours_4w”) → „Brakuje odpowiedzi” + „Uzupełnij krok „Obecna forma”.” (tytuł kroku). Komunikaty Zod (`'dni się powtarzają'`) zostają po polsku w schemacie – nie trafiają już na ekran.
- „Nie zapisano odpowiedzi” → „Nie udało się zapisać odpowiedzi”; potwierdzenie usunięcia: „Plan nie będzie ich uwzględniał” → „Plan przestanie je uwzględniać”.
- `checks`: „Data celu już minęła.” → „… – wybierz nową.”; „kg/tydz.” → „kg tygodniowo”; liczby przez `intlLocale()` (kropka po angielsku).
- Daty w podsumowaniu i kontrolkach przez `fmtDate` (PL bez zmian: 20.06.2027; EN „20 Jun 2027”); masa i przewyższenie przez `num` zamiast `replace('.', ',')` / `toLocaleString('pl-PL')`.
- Etykiety opcji przeniesione z `labels.ts` (stałe modułu) do słownika; `labels.ts` składa zdania w chwili wywołania. `STEP_HEAD` → `STEP_ART` (same ilustracje) + `onboarding.stepHead`.
- EN: dni w wyborze dni dwuliterowe (Mo Tu…), „sex” zamiast „gender” (wzór kalorii), „Heads up” / „Good to know”, „All set!”.
- Chipy trenera neutralne płciowo: „Spałem słabo, nogi ciężkie” → „Słaby sen, ciężkie nogi” (wysyła „Sen słaby, nogi ciężkie”), „Spałem dobrze…” → „Dobry sen, lekkie nogi”, „Jestem chory” → „Choruję”, „Odpuściłem dzisiejszy trening – odrabiać…” → „Dzisiejszy trening odpadł – odrobić go w tym tygodniu?”.
- Chipy są w przestrzeni `day.chips` (polecenie), nie `coach` jak w tabeli docs/34 § 3 – do ujednolicenia w dokumencie.
- Wyniki narzędzi trenera (`coachTools.ts`) są tłumaczone, bo zawodnik widzi je w czacie (rola `tool`); model dostaje je w języku zawodnika. Daty zostają ISO. Polskie oczekiwania testów bez zmian. Liczba dni z odmianą („Wysłano 1 dzień”, wcześniej „1 dni”).
- „Zła data.” → „Zła data – podaj ją w formacie RRRR-MM-DD.”; „Plan na Bolcie wymaga wysyłki” → „…wymaga ponownej wysyłki”; „reguły planu” → „nie pozwalają na to reguły planu”.
- Wysyłka na Bolta: „Aplikacja działa lokalnie – wysyłka wymaga konfiguracji Supabase / konta” → „Ta wersja aplikacji działa bez serwera – wysyłka na Bolta jest niedostępna”; „Najpierw połącz Wahoo w Ustawieniach → Integracje” i „Wahoo nie jest połączone (Ustawienia → Integracje)” → jedno zdanie „Wahoo nie jest połączone. Połącz je w Ustawieniach → Integracje.”; „Trening utworzony, ale Wahoo nie podpięło do niego planu” → „Trening jest na Wahoo, ale bez planu kroków. Wyślij go jeszcze raz.” Błędy rzucane jako `UserError`; surowe kody serwera zostają `Error`.
- `healthLine` po angielsku „resting HR” zamiast „heart rate” (to tętno spoczynkowe).
- Bez zmian po polsku: `coachContext.ts` (kontekst AI, inna sesja).

### 8.3 Stary wygląd `/i`

- Ekran logowania `/i`: tytuł „Trening” → „Bicycle Coach” (`t.common.appName`); e2e `e2e/ios.spec.ts` (nagłówek) poprawiony.
- Teksty logowania `/i` są w `ios.login` (przestrzeń `login` była pusta w chwili pracy) – do ewentualnego scalenia z `login` po pracy agenta /m.
- Czat trenera w `/i` ma własne klucze `ios.coach` (nie `coach`), żeby nie wchodzić w przestrzeń innego agenta.
- „poprosić o przeniesienie jazdy” → „…przeniesienie treningu” (czat, sekcja Trener, etykieta narzędzia `move_ride`) – słowniczek: trening = zaplanowana sesja.
- Pełna aplikacja (Więcej): „biblioteka ćwiczeń” → „biblioteka treningów” – ćwiczenia zniknęły z siłownią 26.10.2026.
- Postęp: z listy funkcji pełnej aplikacji wypadła „historia siły” (siłownia usunięta).
- Trening bez stref: „Po sobotnim teście zakresy pojawią się same” → „Po teście FTP…” – test co 5 tygodni, nie zawsze w sobotę.
- Więcej → E-mail: „List trenera w niedzielę” → „List tygodnia w niedzielę” (słowniczek); stopka wymienia teraz też list tygodnia (niedziela 19:00).
- Więcej → Nowy wygląd: „Mobilny interfejs v2 … W budowie – ten widok zostaje, dopóki nowy nie będzie gotowy” → „Jedna karta stanu dnia i trener pod kciukiem. Ten widok zostaje jako zapasowy.” (/m jest domyślny od 18.10).
- Połączenia: stan „brak” → „niepołączone” (czytelniejsze obok „połączone”); „plany lecą na Bolta” → „plany trafiają na Bolta”.
- Pasek synchronizacji: „N zapisów czeka w kolejce – pojadą…” → poprawna odmiana („1 zapis czeka”, „2 zapisy czekają”) + „wyślą się po powrocie zasięgu”.
- Odprawa: „prognoza z bufora (offline)” → „prognoza zapisana wcześniej (offline)”; „Odczuwalne” → „Odczuwalna”; porcje węglowodanów z odmianą (porcja/porcje/porcji).
- Check-in: „Wpisuj z dziesiątkami” → „Wpisuj z jednym miejscem po przecinku”; błąd rozpoznania mówi, co zrobić („Wypełnij pola poniżej.”).
- Pole wagi w check-inie: przecinek dziesiętny po polsku, kropka po angielsku (parsowanie przyjmuje oba).
- Czat: „Trener nie odpowiada” → „…Spróbuj ponownie za chwilę.”
- RPE 6: „równo, można gadać” → „równo, można rozmawiać”.
- Tydzień: „Dotknij dzień, żeby otworzyć jego ekran.” → „Dotknij dnia, żeby zobaczyć szczegóły.” (składnia).
- Ekran dnia dla innej daty niż dziś: nagłówek kroków „Dzisiaj” → „Kroki dnia”, wiersz żywienia „Dziś” → „Ten dzień”.
- Nazwy dni tygodnia w tytułach bierzemy z `WEEKDAY_LONG` (wielka litera), zamiast własnej polskiej tablicy.
- Stan „Odpuszczone” zostaje (spójnie z /m `TodayScreen`), po angielsku „Skipped”.
- „Waga” zostaje w `/i` (potocznie; słowniczek ma „masa ciała”) – do decyzji, czy ujednolicić.
- Po polsku zostaje adres nadawcy maili `trening@felsztukier.pl` (identyfikator) i nazwy marek (Strava, Wahoo, Bolt).

### 8.4 Pełna aplikacja

- Nazwa: boczna nawigacja i ekran oczekiwania („Trening”) → `common.appName` („Bicycle Coach”).
- Wysyłka na zegarek: przyciski „Wyślij na Wahoo / Zaktualizuj na Wahoo” → „Wyślij na Bolta / Zaktualizuj na Bolcie” (słowniczek: Bolt; `/i` już tak mówi). Podpowiedź w odprawie odsyła do „Wyślij na Bolta”. E2E `stage2.spec.ts` poprawione.
- „Wysłano na Bolta. Zsynchronizuj zegarek.” → „… Zsynchronizuj licznik.” – Bolt to licznik rowerowy, nie zegarek.
- Błędy wysyłki na Bolta to teraz `UserError` z zaleceniem („Wahoo odrzuciło trening (…). Spróbuj ponownie za chwilę.”, „Trening jest na Wahoo, ale bez planu kroków. Wyślij go ponownie.”); „Aplikacja działa lokalnie – wysyłka wymaga konfiguracji Supabase” → „Aplikacja działa bez serwera – wysyłka na Bolta wymaga konta.” (bez nazwy technologii).
- Jazda z Bolta bez nazwy: „Trening z Bolta” → „Jazda z Bolta” (jazda = zarejestrowana aktywność).
- Odznaka akcentu w Tygodniu: „Klucz” → „Akcent” (+ title „Akcent – najważniejszy trening tygodnia”); w Kalendarzu title „Klucz: …” → „Akcent: …”, legenda „Akcent (★ trening kluczowy)” → „Akcent (★)”, „Lekko” → „Spokojnie”. E2E `smoke.spec.ts` poprawione.
- Check-in: „Waga (kg)” → „Masa ciała (kg)” (słowniczek), „tętno sp.” → „tętno spocz.”, „(słaby dzień – R6 w Etapie 5)” → „(słabszy dzień – zasada R6)” (usunięty wewnętrzny „Etap 5”). Przykład masy 104,5 → 82,5 (neutralny dla każdego konta). E2E `stage2.spec.ts` poprawione.
- Zmiany planu: „Dzień obniżony” → „Trening złagodzony” / plakietka „Złagodzony”; plakietki zmian w rodzaju męskim (Pominięty, Przeniesiony – o treningu).
- Statusy logu zostały w rodzaju nijakim (Wykonane/Zmienione/Pominięte) – tak sprawdzają e2e i tak są w `/i`.
- Podpowiedź pod Tygodniem: usunięta wzmianka o „sesji z nogami 48 h przed testem” (siłownia usunięta 26.10.2026) → „Zamiana pilnuje zasad, np. żadnych dwóch akcentów dzień po dniu.”
- Kalendarz: komunikat po przeniesieniu „Wyślij 7 dni na Bolta, jeśli to najbliższe dni.” → „Wyślij plan na Bolta, jeśli zmiana dotyczy najbliższych dni.”; podpowiedź „kafelek z jazdą” → „kafelek z treningiem” (to zaplanowana sesja). Miesiąc poza planem pokazuje nazwy miesięcy zamiast „2026-09”.
- Licznik jazd w miesiącu z odmianą (`common.rides`: 2 jazdy / 5 jazd) – wcześniej zawsze „jazd”. E2E `calendar.spec.ts` (regex) poprawione.
- Strzałki tygodnia mają `aria-label` „Poprzedni/Następny tydzień” (wcześniej nazwa przycisku = „›”). E2E `smoke.spec.ts` poprawione.
- Odprawa: „Brak prognozy (offline i bez bufora)” → „Brak prognozy (jesteś offline, a w pamięci nic nie ma)”, „Prognoza z bufora” → „Prognoza z pamięci”, „zachód” → „zachód słońca”, porcje z odmianą („3 porcje (porcja ok. 25 g: żel, banan albo 500 ml izotoniku)”), bidony z odmianą.
- „g węgli” → „g węglowodanów” wszędzie w pełnej aplikacji.
- Analiza jazdy: „Plan vs wykonanie” → „Plan a wykonanie”; „Rozprzężenie moc:tętno” → „Dryf tętna względem mocy” (słowniczek); komunikat o braku strumieni: „kliknij … w Integracjach” → „w Ustawieniach → Integracje dotknij „Pobierz ostatnie 30 dni”” – EN „Fetch last 30 days” musi zgadzać się z przyciskiem w przestrzeni `settings`.
- IF i 0,97 w wyniku testu formatowane wg języka (wcześniej zawsze kropka: „IF 0.75”).
- Wynik testu: komunikat po zapisie nie pokazuje już „LTHR null bpm”, gdy wpisano samą moc.
- Strefy: „W interwałach ≥ SS” → „od SS w górę”, „W upale > 28 °C cele … niżej” → „W upale (> 28 °C) cele … obniż o 3–5 bpm”.
- Więcej: „Prosty widok na iPhone'a” → „Prosty widok na telefon”, opis „licznik” → „Bolt”; „Twoje potrzeby” zostaje (tak nazywa to `onboarding` dla komputera). Kalendarz w opisie: „jazdy” → „treningi”.
- Sprzęt: liczba zadań z odmianą („1 zadanie / 3 zadania / 5 zadań do zrobienia”), „co N dni” z odmianą; ceny po angielsku jako „PLN 120”.
- Pasek starego adresu: dopisane „kodem z maila”; liczba zaległych zmian z odmianą.
- Nieprawidłowe ustawienia: „…użyto domyślnej daty wyjazdu.” → „Zapisane ustawienia są nieprawidłowe – przyjęto domyślną datę wyjazdu. Popraw ją w Ustawieniach.”
- Fazy w pasku kalendarza: EN „Ph I…”, PL bez zmian („F I…”).
- Zostaje po polsku: `src/app/emailViews.ts` (migawki dni wysyłane na serwer do maili – „Dziś test – rozgrzewka…”, „Tydzień N · faza”, „g węglowodanów na godzinę”, „g w ciągu dnia”); serwer tłumaczy maile sam (`_shared/i18n.ts`). Uwaga: `day.warnings` w migawce idą w bieżącym języku aplikacji (z silnika), a nazwy treningów z programu wczytanego w języku zawodnika – do decyzji, czy migawki mają być zawsze po polsku/neutralne.
- Zostaje: komunikat dewelopera „useSettings poza SettingsProvider”, przycisk „Auto” (taki sam w EN), skróty bpm/W/rpm/TSS/IF/NP.
- Etykiety z innych przestrzeni używane w pełnej aplikacji: `BIKE_KIND_LABEL`/`BRAKES_LABEL` (`src/engine/gear.ts`), nazwy pogody i ubioru (`engine/weather`), opisy rowerów z programu – po stronie `engine`/danych programu.

### 8.5 Postęp i Ustawienia

- Ustawienia: nowa karta „Język” (Język systemu (wykryty) / Polski / English), zapis `settings.language`, podpowiedź z `common.language.hint`.
- Raport tygodnia: „Trening kluczowy:” → „Akcent tygodnia:”, „(klucz)” → „(akcent)”, „Bez treningu kluczowego” → „Bez akcentu” – słowniczek § 9 (akcent = key session). E2E `smoke.spec.ts` poprawiony.
- Raport: „Opuszczona jednostka przepada” → „Opuszczony trening przepada”; „żeby raport i forma były prawdziwe” → „…się zgadzały”.
- Raport: „wolne” → „Wolne” (jak w słowniczku); „jazda poza planem” bez zmian.
- Forma i zmęczenie: liczba w nagłówku karty to TSB – „forma” → „świeżość” (karta nazywa CTL formą, TSB świeżością; EN: fitness/fatigue/form). „mocno zmęczony / wypoczęty” → „duże zmęczenie / świeże nogi” (bez rodzaju). „plan z silnika” → „prognoza z planu”.
- Obciążenie: podpowiedź „IF … · z moc/tętno” (błąd gramatyczny) → „z mocy / z tętna”.
- Punkt wyjścia: „Luka: … / Luka: cel osiągnięty” → „Brakuje: … / Cel osiągnięty”; „Zapisano 1 mierników” → poprawna odmiana (`plCount`); „Zapisz N dostępnych” → „Zapisz jako punkt wyjścia: N mierników”.
- Propozycja FTP: toast „strefy od 12.10 + 1 dzień” → „nowe strefy od dnia po 12.10”; „≥ 3 %” → „co najmniej 3 %”. Notatka zapisywana przy teście powstaje w języku w chwili zapisu.
- Masa: seria wykresu „Waga” → „Masa” (słowniczek: masa ciała). Opis pustego wykresu przeredagowany na dwa zdania.
- Testy: „FTP W (szac.)” → „FTP W (szacunek)”.
- Kadencja: „Linia = cel 85 rpm.” → „Przerywana linia: cel 85 rpm.”
- Ustawienia/walidacja: „Podaj liczbę 50–200.” → „Podaj liczbę od 50 do 200.” (liczby przez `num`, np. „0,7”); „Nieprawidłowa data.” → „Podaj poprawną datę.”; „Popraw zaznaczone pole – zapis jest zablokowany.” → „… – do tego czasu zapis jest zablokowany.”
- Ustawienia/program: wiersze „Tygodni”/„Faz” → „Liczba tygodni”/„Liczba faz”; „FTP szacunek (W)” → „FTP – szacunek (W)”.
- Konto: „E-mail (magic link)” → „E-mail”; „Wyślij link logowania” → „Wyślij kod logowania” (słowniczek: kod z maila; mail zawiera i kod, i link). E2E `stage2.spec.ts` poprawiony. „Zalogowany” → „Zalogowano jako”; „W kolejce: 3 zmian” → odmiana („3 zmiany”).
- Konto: komunikat o braku Supabase mówi „Bicycle Coach działa tylko lokalnie” zamiast „Aplikacja…”.
- Kopia: „To nie jest kopia aplikacji Trening.” → „To nie jest kopia aplikacji Bicycle Coach. Wybierz plik wyeksportowany przyciskiem „Eksport JSON”.”; tytuł udostępniania „Kopia Bicycle Coach”; nazwa pliku `bicycle-coach-kopia-RRRR-MM-DD.json` (EN `bicycle-coach-backup-…`). Identyfikator w pliku (`app: 'trening'`) bez zmian – stare kopie dalej się wczytują.
- E-mail: „List trenera w niedzielę” → „List tygodnia w niedzielę”, „Podsumowanie po treningu” → „Podsumowanie po jeździe” (słowniczek). Błędy maili próbnych mówią, co zrobić.
- Powiadomienia: „wykreślono N wygasłe urządzenie” / „Wysłane na N urządz.” → odmiana; „niepytana” → „jeszcze nie pytano”; „czasu warszawskiego” → „czasu polskiego”; data w historii przez `fmtDayMonth`.
- Strava: podpowiedź zapisu tytułu mówi „z podpisem Bicycle Coach” zamiast „Notatki: Kolarski Trener AI”. **Do decyzji/obszaru serwera:** `supabase/functions/_shared/strava_title.ts` `SIGNATURE` nadal ma „Notatki: Kolarski Trener AI” – trzeba wyrównać.
- Strava: „atleta” → „zawodnik”; „Strava nie dała zgody na pisanie” → „na zapis”; błąd połączenia „Błąd połączenia: X.” → „Nie udało się połączyć: X. Spróbuj ponownie.”
- Wahoo: „podpięty” → „powiązany z treningiem”; „synchronizacji zegarka” → „synchronizacji urządzenia” (Bolt to licznik); usunięte „sandbox:” z komunikatu o limicie; daty w komunikatach przez `fmtDayMonth` zamiast ISO. EN „Wyślij od zera” = „Resend all”.
- Pogoda: współrzędne przez `num(…, 2)` i separator „;” (po polsku przecinek dziesiętny kolidował z przecinkiem między liczbami).
- Formaty: `toLocaleString('pl-PL')` w Koncie/Wahoo → `intlLocale()`; skala objętości przez `num`; IF w podpowiedzi przez `num`.
- Po polsku zostaje: `program.goal.*`, `policy.tip`, etykiety `BASELINE_DEFS`, komunikaty `trend.warning`, `ramp.warning`, `lowCadenceWarning`, `TripDateError.message`, krzywa mocy `p.label` (silnik/program – przestrzeń `engine`); `sync.error` i błędy auth (obszar sync); `attempt.outcome` z `src/sync/wahoo.ts`.
- Adres nadawcy `trening@felsztukier.pl` i ścieżka `docs/09-supabase.md` w tekstach – identyfikatory, bez zmian.

### 8.6 Silnik i synchronizacja

- Słowniki: `src/i18n/{pl,en}/engine.ts` (reguły, plan, pogoda, żywienie, punkt wyjścia, sprzęt, generator planów) i `src/i18n/{pl,en}/sync.ts` (logowanie, Strava/Wahoo, powiadomienia, trener, lokalizacja). Silnik czyta `t()` w chwili wywołania; stałe z tekstem zamienione na funkcje/gettery (`hrZones()`, `terrain()`, `cadence()`, `BASELINE_DEFS` z getterami `label`/`hint`, `BIKE_KIND_LABEL`/`BRAKES_LABEL` przez `localized()`).
- Generator planów: wynik po polsku identyczny co do bajtu (porównanie 120 losowych profili z wersją z HEAD); po angielsku bez polskich znaków. Polska odmiana przymiotników dni („sobotnia długa jazda”) została w słowniku PL; po angielsku „Saturday long ride”.
- Generator: `default_settings.language` z `'pl'` na `'system'` (zgodnie z § 4 – inaczej nowe konto z wygenerowanym planem dostawałoby polski na sztywno).
- Liczby w tekstach silnika po polsku bez zmian (surowe `${n}`, przecinek tam, gdzie był); po angielsku kropka (`en-GB`). Żywienie (`personalizeNutrition`): dopiski „cały tydzień ≈ …”, „deficyt ok. …” i data punktu kontrolnego przez słownik – EN „≈ 0.56 kg over the week, towards 91 kg by 1 Mar”.
- Ostrzeżenie kadencji: było „celuj w 90–90 rpm” przy celu 90 (generator) → przy celu ≥ 90 sam cel („celuj w 90 rpm”), przy niższym „85–90”.
- Walidacja przeniesienia: „Cel jest poza planem.” → „Ten dzień jest poza planem.”; ostrzeżenie o przeszłości: „jednostka z przeszłości” → „trening z przeszłości” (słowniczek).
- Pogoda: „trasa pod wiatr na wyjeździe, z wiatrem do domu” → „pod wiatr na początku, z wiatrem do domu”; „Trening na czczo/bez jedzenia” → „Trening bez jedzenia”.
- PMC: „albo dzień wolny więcej” → „albo dodatkowy dzień wolny”.
- Punkt wyjścia: „Rozprzężenie Pw:HR” → „Dryf Pw:HR” (słowniczek), „Masa” → „Masa ciała”, „do estymacji CdA” → „do szacunku CdA”, „z jazd z miernikiem” → „z jazd z miernikiem mocy”.
- Wahoo (opis planu na Bolcie): „celów HR” → „celów tętna”; krok przecięty wstawką „(c.d.)” / EN „(cont.)”.
- Za wczesna data wyjazdu: data jako „1.05.2027” / „1 May 2027” zamiast ISO.
- Sync: komunikaty błędów, które mają trafić na ekran, rzucane jako `UserError` (push, Strava/Wahoo – znane kody, trener, rozpoznawanie, lokalizacja, przekroczony czas). Nieznane kody serwera zostają zwykłym `Error` dla `friendlyError`.
- „Brak konfiguracji Supabase.” → „Ta wersja aplikacji nie ma połączenia z serwerem – logowanie i integracje są wyłączone.”
- „Nieznana akcja – zgłoś błąd.” / „Nieobsługiwane żądanie.” → z radą „zaktualizuj aplikację”.
- „Nie wyraziłeś zgody na powiadomienia.” → „Powiadomienia są zablokowane – zezwól na nie w ustawieniach przeglądarki albo telefonu.” (bez formy męskiej, z radą).
- „Bez konta trener nie odpowiada” / „Bez konta rozpoznawanie nie działa” → „Rozmowa z trenerem wymaga konta – zaloguj się.” / „Rozpoznawanie wymaga konta – zaloguj się.”
- „Za dużo prób – spróbuj za chwilę.” → „Za dużo prób – odczekaj chwilę i spróbuj ponownie.”
- Dziennik wysyłki na Bolta: „3 ok, 1 błędów” → „3 wysłanych, 1 z błędem”.
- Nazwa: tytuł próbnego powiadomienia i ścieżka w Ustawieniach iPhone’a (lokalizacja) używają `common.appName` („Bicycle Coach”); arkusz potwierdzenia w iOS – `common.cancel`.
- Nagłówek `x-app-lang` (helper `langHeaders()` w `src/sync/supabase.ts`) przy coach-chat, checkin-parse, meal-parse, push-send, strava-oauth, wahoo-oauth/push i POST strava-login (redeem). Start logowania Stravą to nawigacja – bez nagłówka.
- Geokodowanie Open-Meteo w języku aplikacji (`language=${getLang()}`) – nazwy miejscowości po angielsku dla EN.
- Zostaje po polsku: wewnętrzne błędy niezmienników silnika (`layout.ts` „Brak szablonu tygodnia…”, „Błąd układu tygodni…”, `calendar.ts` „Nieznany trening…”, `dates.ts` „Nieprawidłowa data ISO”) – błędy programisty, nie dla zawodnika; regexy dopasowujące polską treść błędu z serwera („nie ma dostępu” z triggera `check_allowed_email`).
- Do serwera: `_shared/strava_title.ts` rozpoznaje dopisek „(pod dachem)” przy tytułach domyślnych – w EN aplikacja dopisuje „(indoors)”, warto dodać do `norm`.

### 8.7 Treść programów (`data/`)

- Tabela `data/i18n/program_en.json`: 336 unikalnych tekstów (alpejski 259, FTP 300 222, część wspólna). Polskich tekstów nie zmieniałem – `calendar.json` i `calendar-ftp300.json` identyczne poza `version` i `settings.language`.
- Reguła „tekst dla ludzi” (generator `human_texts`, test `translations.test.ts`): ma słowo małymi literami i spację, polską literę albo stoi w polu `name/title/short/default/label/until/today/after`. Kody typu „LONG 150′”, „Z2”, „SS_2x10” odpadają.
- Generatory dopisują `translations.en` (tylko użyte wpisy) i przerywają się z listą brakujących tekstów. `default_settings.language` = `system`. `PROGRAM_VERSION` obu: 2026.10.27-1.
- Terminy: akcent → key session; tydzień lżejszy/rozładowania → „Lighter week” w notatkach, „Recovery week” w tytule reguły; pobudzenie → openers; długa jazda → long ride; jazda spokojna → easy ride; trenażer → trainer; „rowerek na siłowni” → gym bike; „pod dachem” → indoors/indoor version.
- Kroki: Rozgrzewka → Warm-up, Schłodzenie → Cool-down, Przerwa → Recovery, Luz/Luźno/Swobodnie → Easy, Odpoczynek → Rest, „Interwał 10 min” → „10 min interval”.
- Strefy tętna: Regeneracja → Recovery, Wytrzymałość (baza) → Endurance (base), Podprogowa → Sub-threshold, Progowa (interwały) → Threshold (intervals), Nadprogowa → Supra-threshold, Beztlenowa → Anaerobic; Tempo, Sweet spot, VO2max bez zmian.
- „Próg pod górę 4×6 min” → „Uphill threshold 4×6 min”; „Test progowy 30 min (LTHR)” → „30 min threshold test (LTHR)”.
- Żywienie: etykiety zachowują układ „Rodzaj dnia: …” (silnik `personalizeNutrition` dzieli po dwukropku) – „Training day: deficit about 300 kcal”. Sufiks ` (only if weight > target)` zachowuje spację na początku. Dopiski liczone w `personalizeNutrition` są po stronie silnika (agent „engine”).
- `meta.target` alpejski: Trip date / trip / until the trip / Trip day! / Trip in progress; FTP 300: End of the program / end / until the end of the program / … / Program complete.
- Kwoty: „zł” → „PLN”; liczby z kropką dziesiętną (0.95, 1.85 mm), tysiące „10,000 mAh”. Daty w treści zostały w formacie 26.04.2027 / 1.03 (jednoznaczne, bez przeliczania na format US).
- Nazwy własne bez tłumaczenia: Łódź, Koniaków (test dopuszcza te dwie z polskimi literami), Karkonosze, Great Escape, Dell (trasa), nazwy sprzętu. Przełęcze: Okraj Pass, Karkonosze Pass, Salmopol Pass; Beskid Śląski → Silesian Beskids; Pradziad → Praděd (Jeseníky).
- Odwołania do UI w treści: „wg Części „Strategia na przełęcz”” → „the “Pass strategy” section”; „przycisk „pod dachem”” → „the “indoors” button”; „moduł Wyjazd” → „Trip section”; „Nie dotyczy” w szablonie serwisu → „Not applicable”. Agenci UI: trzymajcie te nazwy (Pass strategy, Indoors, Trip, Not applicable) albo dajcie znać.
- `coach_notes` przetłumaczone (kontekst dla AI przy języku `en`); polskie zostają w programie.
- Pliki pomocnicze: pola `*_en` obok polskich (`clothing.json`: `label_en`, `items_en`, `extras_en`; `gear_templates.json`: `title_en`, `details_en`; `packing_list.json`: `system_en`, `name_en`, `content_en`, `cat_en`). `gear_tasks_alps.json` czyta tylko generator – teksty idą przez tabelę programu.
- Wczytywanie wg `getLang()`: `loadClothing()` (nowy `src/data/clothing.ts`, użyty w `useBriefing.ts` i `BriefingCard.tsx`), `loadGearTemplates()`, `loadPackingList()` w `src/data/gear.ts`. Klucz pozycji checklisty (`itemKey`) liczony z polskiej nazwy (`key_name`) – zaznaczenia nie giną po zmianie języka.

### 8.8 Serwer: maile, push, AI

- Słownik serwera: `_shared/i18n.ts` (`strings(lang)`, `Dict = typeof pl`, `langOf`, `langFromRequest`, `fix`, `fmtDate`, `weekRange`, `weekdayOf`, `aiLangRule`). Czysty TS, testy `src/engine/__tests__/server_i18n.test.ts`.
- Język: webhook/cron/maile – `userLang(admin, userId)` (osobne zapytanie o `locale, language`, więc przed wgraniem migracji 20261027090000 wszystko działa po polsku); żądania z aplikacji – `requestLang` (nagłówek `x-app-lang`, inaczej profil). Strony z linków w mailu – język właściciela linku; zły link – Accept-Language przeglądarki.
- `x-app-lang` dopisany do CORS `access-control-allow-headers` – bez tego preflight z przeglądarki odrzuci nagłówek. **Aplikacja jeszcze go nie wysyła** – do dodania po stronie klienta (np. `global.headers` klienta Supabase albo w `functions.invoke`).
- Nadawca maili: „Trening <…>” → „Bicycle Coach <trening@felsztukier.pl>”; stopka, `<title>` maili i stron potwierdzeń, domyślny tytuł testowego push: „Trening” → „Bicycle Coach”.
- Podpis na Stravie: „Notatki: Kolarski Trener AI” → „Notatki: Bicycle Coach” / „Notes: Bicycle Coach” (`signatureFor(lang)`; `SIGNATURE` = polski). `checkDraft` odrzuca też „bicycle coach”/„notes:” wpisane przez model; `parseDraft` czyta „Title:/Description:” obok „Tytuł:/Opis:”.
- Mail poranny: „dzień kluczowy” → „akcent” (słowniczek § 9; EN „key session”).
- List tygodnia z reguł: „Treningi kluczowe wykonane” → „Akcenty tygodnia wykonane”; „Z treningów kluczowych wykonane X z Y” → „Z akcentów tygodnia wykonane X z Y”; poprawiona odmiana („5 treningów wypadło”, „w 1 jeździe”).
- Mail po treningu: temat „Dzień w liczbach: N jazdy” miał zawsze „jazdy” – teraz odmiana (1 jazda / 5 jazd); w treści „Razem: …, N jazd” – też odmiana.
- Obserwacja „N jazdy jednego dnia – druga liczy się do obciążenia…” → „N jazdy jednego dnia – każda liczy się do obciążenia…” (przy 3 jazdach „druga” było mylące).
- Mail próbny: przedrostek „[PRÓBA] ” / „[TEST] ”.
- Strony potwierdzeń: data jako „26.10.2026” / „26 Oct 2026” zamiast ISO; powody zamiast surowych komunikatów („za stary link” → „link jest już nieaktualny”, „brak jazdy tego dnia” → „tego dnia nie ma zapisanej jazdy”, błąd bazy → „błąd zapisu – spróbuj później w aplikacji”, surowy błąd zostaje w `detail`). „Możesz kliknąć inną liczbę, żeby ją poprawić” → „Żeby ją zmienić, kliknij w mailu inną liczbę”. „Wagę” → „Masę” (słowniczek: masa ciała).
- Wypisanie z listu tygodnia mówiło „Wyłączone: podsumowanie po treningu” (błąd) – teraz „list tygodnia”.
- Push: „Otwórz aplikację, żeby zobaczyć dzisiejszy trening i odprawę (pogoda, ubiór, jedzenie).” → „Zobacz dzisiejszy trening i odprawę: pogoda, ubiór, jedzenie.” (dotknięcie i tak otwiera aplikację); „zajmie 20 s” → „zajmie 20 sekund”; „co poszło” → „co się udało”.
- Błędy dla aplikacji: „brak klucza” → „Trener AI jest chwilowo niedostępny – spróbuj później.”; „limit miesięczny” → „Miesięczny limit AI jest wyczerpany – odnowi się na początku miesiąca.”; limity dzienne jako pełne zdania „co się stało + co zrobić”; „Nie udało się rozpoznać” → „Nie udało się rozpoznać posiłku…”.
- Prompty AI zostają po polsku; dla `en` dopisek `aiLangRule` (odpowiedź po angielsku, kropka dziesiętna, bez separatora tysięcy – `numbersOk` czytałby „2,400” jako 2,4). Dla `pl` prompty i system bajt w bajt jak dotąd (cache bez zmian). `checkin-parse` i `meal-parse` – dopisek w wiadomości użytkownika (system wspólny, cache bez zmian).
- `numbersOk` już akceptował oba separatory – bez zmian w `ride_facts.ts`, tylko test.
- Zostaje po polsku: fakty dla modeli (`ride_facts`, `week_facts`: dni tygodnia, flagi, etykieta tygodnia) – list z reguł tłumaczy flagi mapą `letter.flags` (nowa flaga w `weekFacts` = nowy wpis tam, inaczej w angielskim liście zostanie polski tekst flagi); statusy wysyłek („wysłane”, „pusty tydzień” – logika na nich polega), logi `console`, diagnostyka szkiców dla modelu, komunikaty techniczne z wyjątków.
- Treść zbudowana przez aplikację i wgrana w migawce (`email_days`: `dateLabel`, `weekLabel`, nazwy treningów, żywienie, `notes`) jest w języku aplikacji w chwili wgrania – `src/app/emailViews.ts` (obszar klienta) powinien budować ją wg `getLang()` i przekazać `lang` do `buildWorkoutView`.
- `hm()` („1 h 30 min”) wspólne dla obu języków.
- Przy okazji: poprawiony istniejący błąd typów w `push-send` (`kind: 'weekly'` nie było w typie – `deno check` nie przechodził).

### 8.9 Pomoc, manifest, iOS

- Pomoc: tytuł „Pomoc – Trening” → „Pomoc – Bicycle Coach”; lead „aplikacji Trening” → „Bicycle Coach”.
- Nowa `public/help.html` (EN, ta sama struktura/klasy/ikony); w pasku obu stron link „English” / „Polski” (`location.replace` – „Wróć” dalej do aplikacji). Kotwice sekcji w EN mają angielskie id (`#today`, `#coach`…), więc przełącznik nie zachowuje sekcji.
- `src/lib/help.ts` `helpUrl()`; podmienione w MorePage (getter w stałej `ITEMS`, żeby nie liczyć przy imporcie), MoreScreen (/i), MeScreen (/m).
- Kod logowania: „8-cyfrowy” → „6-cyfrowy” (zgodnie z `CODE_LEN = 6` w `src/m/LoginScreen.tsx`) – do potwierdzenia, czy Supabase wysyła 6 cyfr.
- Podpis na Stravie: „Notatki: Kolarski Trener AI” → „Notatki: Bicycle Coach” (EN „Notes: Bicycle Coach”) – zgodnie z docs/34 § 1; serwer zmienia inny agent.
- Słowniczek: „List trenera” → „List tygodnia”, „Po treningu” → „Podsumowanie jazdy”, „Trening kluczowy” → „Akcent tygodnia”, test FTP „zastępuje mocny trening” → „zastępuje akcent tygodnia”, Trener „przenosi jazdę” → „przenosi trening” (zaplanowany = trening).
- „Automat” (Bolt) → „Wysyłka automatyczna”; „Dzień wolny i odpuszczone” → „Dzień wolny i pominięty trening”; „Gdy plan odjedzie od…” → „Gdy plan różni się od…”.
- Przykład check-inu „Waga 104,8” → „Waga 80,5” (bez danych konkretnej osoby).
- Ustawienia w Ja: dopisane Apple Health (tylko aplikacja iOS) i „język”; maile nazwane wg słowniczka (podsumowanie jazdy, list tygodnia).
- „Wyjazd” w pełnej aplikacji → „Wyjazd (w programach z wyjazdem)” – ekran włącza program (`features.trip`).
- Siłowni w pomocy już nie było; usunięta wzmianka z docs/22.
- Nazwa: `index.html` (title, apple-mobile-web-app-title, nowa meta description po angielsku), manifest PWA (`name`/`short_name` „Bicycle Coach”, opis po angielsku, `lang: 'en'` – manifest jest jeden dla obu języków), `capacitor.config.ts` `appName`, `Info.plist` `CFBundleDisplayName`, zapasowy tytuł push w `src/sw.ts`. `tag: 'trening'` push zostaje (identyfikator).
- iOS: `CFBundleLocalizations` = pl, en; `CFBundleDevelopmentRegion` pl → **en** (zgodnie z `developmentRegion = en` w pbxproj): telefon w innym języku niż pl/en dostaje angielski zamiast polskiego (docs/34 § 4: „każdy inny → angielski”). Polski telefon dalej dostaje pl.
- iOS: `pl.lproj`/`en.lproj/InfoPlist.strings` (nazwa + 3 opisy uprawnień), grupa wariantów w pbxproj, `pl` w `knownRegions`. Bazowe teksty w Info.plist teraz po angielsku (zapas dla regionu deweloperskiego). PL: „Trening używa…” → „Bicycle Coach używa…”, lokalizacja skrócona („tylko po to, żeby pokazać prognozę” → „tylko do prognozy pogody”).
- Ekran startowy (LaunchScreen) bez zmian.

## 9. Słowniczek (PL ↔ EN)

Jedna nazwa na pojęcie w każdym języku. **Trening** = zaplanowana sesja z planu, **jazda** = zarejestrowana aktywność
(Strava, Bolt).

| PL | EN | Uwagi |
|---|---|---|
| Bicycle Coach | Bicycle Coach | nazwa aplikacji, nie tłumaczymy |
| trener (Trener) | coach (Coach) | przycisk i rozmowa |
| trening | workout | zaplanowana sesja |
| jazda | ride | zarejestrowana aktywność |
| akcent | key session | najważniejszy trening tygodnia |
| jazda spokojna | easy ride | Z1–Z2 |
| długa jazda | long ride | |
| dzień wolny / Wolne | rest day / Rest | |
| tydzień rozładowania | recovery week | ang. „deload” tylko w danych |
| faza, blok | phase, block | |
| taper | taper | |
| test FTP | FTP test | |
| FTP | FTP | moc progowa (W) |
| LTHR | LTHR | tętno progowe (bpm) |
| strefa Z2 | zone 2 (Z2) | strefy tętna Z1–Z5 |
| RPE | RPE | odczucie wysiłku 1–10 |
| nogi (1–5) | legs (1–5) | samopoczucie nóg w check-inie |
| check-in | check-in | poranny wpis: masa, tętno spoczynkowe, sen, nogi |
| odprawa (poranna) | morning briefing | mail i karta rano |
| podsumowanie jazdy | ride summary | |
| list tygodnia | weekly letter | mail w niedzielę |
| notatka trenera | coach's note | po jeździe |
| deficyt (kaloryczny) | calorie deficit | |
| masa ciała | body weight | w polach formularzy „Masa ciała”; w chipach i wiadomościach do trenera potocznie „Waga …” (głos zawodnika) |
| kadencja | cadence | rpm |
| dryf tętna, Pw:HR | heart-rate drift, Pw:HR | |
| TSS, CTL, ATL, TSB | TSS, CTL (fitness), ATL (fatigue), TSB (form) | |
| punkt wyjścia | baseline | |
| przenieś / zamień / pomiń | move / swap / skip | zmiany planu |
| Cofnij | Undo | |
| pod dachem (trenażer) | indoors (trainer) | |
| Bolt (Wahoo ELEMNT BOLT) | Bolt | wyślij na Bolta = send to Bolt |
| plan / program | plan / program | program = cały plan sezonu |
| Dziś / Plan / Ja | Today / Plan / Me | zakładki `/m` |
| kod z maila | code from the email | logowanie |
