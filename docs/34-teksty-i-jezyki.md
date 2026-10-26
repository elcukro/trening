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
| `login` | `src/m/LoginScreen.tsx`, `src/components/OAuthButtons.tsx`, `src/ios/screens/LoginScreen.tsx` | logowanie |
| `m` | `src/m/**` poza onboardingiem | ekrany Dziś / Plan / Ja / jazda / podsumowanie, arkusze, czekanie |
| `coach` | czat trenera w `/m` i `/i`, chipy (`src/day/coachChips.ts`) | rozmowa |
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
- Przełącznik: `/m` → Ja → Ustawienia → Język oraz pełna aplikacja → Ustawienia → Język. Nazwy języków zawsze we własnym
  języku („Polski”, „English”).
- Profil: kolumny `profiles.language` (wybór) i `profiles.locale` (`pl`/`en` – język, w którym aplikacja ostatnio się
  wyświetlała; ustawia go aplikacja po zalogowaniu). Serwer pisze maile, push i odpowiedzi AI w `locale`, a bez niego
  w `language`, inaczej po polsku. Migracja `20261027090000_language.sql`, wpisy w `PROFILE_MAP`.
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

_(uzupełniane w trakcie – § 8 opisuje stan po wdrożeniu)_

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
| masa ciała | body weight | |
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
