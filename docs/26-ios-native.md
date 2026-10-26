# 26 · Natywna aplikacja iOS (Capacitor) – analiza i plan

Stan: analiza 26.10.2026; **etap 0 (powłoka) zrobiony 26.10.2026** – patrz „Stan wdrożenia” niżej. Decyzja: **opcja 1** – istniejąca aplikacja React (`/m`) w natywnej
powłoce iOS (Capacitor), z natywnymi wtyczkami tam, gdzie PWA nie sięga. Silnik (`src/engine/`), synchronizacja (Dexie +
Supabase), Edge Functions i wersja webowa zostają bez zmian – aplikacja iOS to trzeci „cel builda”, nie nowy projekt.

**Siłownia jest poza zakresem aplikacji iOS** – 26.10.2026 usunięta z całej aplikacji (web `/`, `/i`, `/m` i oba programy;
`docs/13` § Zmiana 26.10.2026). Nie ma czego przenosić: trybu siłowni, timera przerwy, ćwiczeń ani sesji A/B/C.

## Stan wdrożenia

**Etap 0 – powłoka (26.10.2026), działa w symulatorze (iPhone 16e, iOS 26.1, build Debug):**

- Capacitor 8.5 (`@capacitor/core`, `ios`, `status-bar`, `splash-screen`, `keyboard`; `cli` w dev), projekt Xcode w `ios/`
  (Swift Package Manager, bez CocoaPods), `capacitor.config.ts`: `pl.felsztukier.trening`, „Trening”, `webDir: dist`,
  bez `server.url`. Bundle kopiuje `cap sync` do `ios/App/App/public` (ignorowany w git, tak jak `capacitor.config.json`).
- `npm run build:ios` = `tsc -b` + `VITE_TARGET=ios vite build` + `cap sync ios`; `npm run ios:open` otwiera Xcode
  (schemat `App`). Build iOS: bez wtyczki PWA (manifest, `sw.js`), `virtual:pwa-register` podmieniony aliasem na pustą
  funkcję (`src/native/noServiceWorker.ts`), w routerze tylko `/m/*` (reszta → `/m`, bez `ModeGate`), motyw systemu
  ignorowany, `?today=`/`?hour=` działają tylko w buildzie deweloperskim (`urlParam` w `src/lib/dates.ts`).
  Kod klasycznego UI i `/i` nadal leży w bundlu (leniwe chunki), ale nie ma do niego trasy.
- `src/native/` – jedyne miejsce z importami Capacitora: `platform.ts` (`IS_IOS_APP` – stała builda, `isNative()`),
  `shell.ts` (`initShell`: klasa `native` na `<html>`, `user-scalable=no`, ciemny tekst paska statusu; `hideSplash` –
  ekran startowy znika po pierwszym rysunku `/m` albo po 4 s), `index.ts`.
- Wygląd natywny: ikona 1024 px z `public/icon-src.png` i ekran startowy w kolorze tła `/m` (#f2f2f7, bez logo) generuje
  `node scripts/icons.mjs`; `UIUserInterfaceStyle = Light`, okno też wymuszone na jasne (`SceneDelegate.swift`), tylko pion,
  tylko iPhone (`TARGETED_DEVICE_FAMILY = 1`), `CFBundleDevelopmentRegion = pl`. Bez białego błysku: tło WebView, okna,
  ekranu startowego i `/m` to ten sam kolor. CSS dla `html.native` (`src/index.css`): bez zaznaczania tekstu poza polami,
  bez menu linku po przytrzymaniu, bez przybliżania dwukrotnym dotknięciem, bez odbicia dokumentu (`ios.scrollEnabled: false`).
- Teksty w Ja (§ 3 pkt 9) w buildzie iOS: bez „Otwórz pełną aplikację” i „Wróć do poprzedniego wyglądu”, bez wiersza
  Powiadomienia (Web Push nie działa w WKWebView – APNs w etapie 3), Strava/Wahoo „łączenie na trening.felsztukier.pl”
  (bez przejścia), „Nie jesteś zalogowany” wraca do ekranu logowania. Siłowni w `/m` nie ma (usunięta z aplikacji 26.10.2026, § 9 pkt 3).
- Sprawdzone w symulatorze: start z lokalnego bundla prosto do logowania `/m`, „Zobacz tylko plan, bez konta” → Dziś,
  zakładki Dziś/Plan/Ja, arkusz „Progi i miernik”, czat Trenera z klawiaturą, długie przytrzymanie tekstu bez menu.

**Na telefonie i z kontem (26.10.2026):** aplikacja zainstalowana na iPhonie z Xcode 27.1 (darmowe konto Apple, Personal
Team – instalacja ważna 7 dni). **Logowanie kodem z maila działa** w aplikacji natywnej (telefon i symulator), sesja
przetrwa przeładowanie WebView i ponowne uruchomienie aplikacji. Synchronizacja spod `capacitor://localhost` pobiera
wszystko: check-in (waga), posiłki z budżetem, jazdy ze Stravy z notatką trenera, przeniesienia i stan „na Bolcie”, FTP
i LTHR z testu; Edge Functions (`strava-oauth`/`wahoo-oauth` status) odpowiadają – CORS nie blokuje tego originu.

**Poprawione 26.10.2026 (po teście z kontem):**
- `public/pomoc.html` ma wariant aplikacji: klasa `in-app` na `<html>`, gdy jest `window.Capacitor` (powłoka wstrzykuje go
  do każdej strony), chowa `.only-web` (Safari, ekran początkowy, „pełna aplikacja”, Powiadomienia) i pokazuje `.only-app`
  (Strava/Wahoo i ustawienia przez trening.felsztukier.pl); numery kroków z licznika CSS. „Wróć” prowadzi na ekran, który
  otworzył pomoc (`trening:pomoc-wroc` w sessionStorage, zapisuje `openHelp` w Ja) – w WKWebView `document.referrer` bywa
  pusty. W aplikacji przewija się `body` (dokument ma wyłączone przewijanie), nagłówki sekcji mają `scroll-margin-top`.
  Pełny ekran instrukcji w `/m` (bez przeładowania WebView) zostaje w etapie 1.
- Kafelek formy w Ja: rozmiar od szerokości kafelka (`container-type: inline-size`, `min(17px, 15.5cqi)`) – „Przeciążony”
  w jednej linii także na 375 pt; web i iOS.
- Wiersze `button.m-row`: podświetlenie z opóźnieniem 90 ms i płynnym gaśnięciem (jak `UITableView`) – dotyk, który
  zaczyna przewijanie, nie zapala wiersza; web i iOS.
- Tło `html.native` = #f2f2f7 – start bez zmiany odcienia między ekranem startowym a `/m`.

**Uwaga do testów w symulatorze:** dotknięcie tuż po przewinięciu trafia w miejsce, w którym lista będzie po odbiciu,
a zrzuty są o 1–2 s spóźnione – przed dotknięciem zrób zrzut z nieruchomą stroną. Tak przypadkiem nacisnąłem „Wyloguj”
(26.10.2026, tylko symulator).

**Nie sprawdzone:** praca przy faktycznie odciętej sieci (symulator korzysta z sieci Maca; bundle jest lokalny),
przybliżanie szczypnięciem, wznowienie z tła z otwartą klawiaturą na telefonie, build Release i rozmiar aplikacji.

## 1. Architektura

- **Capacitor** (aktualna stabilna wersja) w tym samym repo: katalog `ios/` (projekt Xcode), `capacitor.config.ts`.
  Bundle (`dist/`) **wbudowany w aplikację** (nie `server.url` na trening.felsztukier.pl) – działa offline od pierwszego
  uruchomienia i nie wygląda dla recenzenta jak opakowana strona (§ 6, wytyczna 4.2).
- Build z flagą `VITE_TARGET=ios`: wejście prosto do `/m` (bez `ModeGate`, bez klasycznego UI i `/i`), bez service workera
  (WKWebView pod `capacitor://` go nie potrzebuje – zasoby są lokalne), bez `?today=`/`?hour=` w produkcji.
- Warstwa `src/native/` – jedyne miejsce, które importuje wtyczki Capacitora; reszta kodu woła interfejsy
  (`camera`, `haptics`, `notify`, `health`, `openAuth`) z implementacją webową i natywną (`Capacitor.isNativePlatform()`).
  Dzięki temu web i iOS mają jeden kod ekranów, a testy Vitest/Playwright działają jak dziś.
- **Aktualizacje**: zmiana programu (`data/program.json`) albo kodu = nowy build. Dla jednego użytkownika przez TestFlight to
  minuty. Aktualizacje JS „na żywo” (Capgo/Appflow) odkładamy – dopuszczalne przez Apple tylko bez zmiany charakteru aplikacji.
- Supabase: ta sama baza i funkcje. Sesja w `localStorage` WKWebView działa; bezpieczniej przenieść token do Keychain
  (`@capacitor/preferences` + secure storage) – krok 3.

## 2. Przeniesienie funkcji (co działa od razu, co wymaga pracy)

| Funkcja | Dziś (web/PWA) | W aplikacji iOS | Praca |
|---|---|---|---|
| Dziś, Plan, Ja, jazda, podsumowanie, Trener | React `/m` | bez zmian | — |
| Dane offline, synchronizacja | Dexie (IndexedDB) + `runSync` | bez zmian (IndexedDB w WKWebView jest trwała) | test |
| Logowanie | kod OTP z maila; ekran logowania w `/i` reużywany przez `/m` | ten sam ekran w `/m`; link z maila jako **Universal Link** otwiera aplikację | S |
| Strava / Wahoo – połączenie | `window.location.assign(OAuth)` w **pełnej aplikacji** (`IntegrationsSection`) | ekran w `/m` + `ASWebAuthenticationSession` (`@capacitor/browser` lub wtyczka auth) i powrót przez własny schemat / Universal Link; Edge Functions `strava-oauth`/`wahoo-oauth` dostają adres powrotu aplikacji | M |
| Ustawienia konta, maile, powiadomienia, program, kopia | tylko pełna aplikacja (`/wiecej/ustawienia`) | **przenieść do `/m` → Ja** (arkusze) – w aplikacji nie ma „Otwórz pełną aplikację” | M |
| Powiadomienia push | Web Push (VAPID) przez `src/sw.ts`, Edge Function `push-send` | **APNs** (`@capacitor/push-notifications`); `push-send` wysyła też na tokeny APNs (klucz `.p8` – sekret ustawia użytkownik); tabela `push_subscriptions` z kolumną `kind` | M |
| ~~Timer przerwy (siłownia)~~ | usunięty z aplikacji 26.10.2026 | **nie dotyczy** – siłowni nie ma w aplikacji (web i iOS) | — |
| Zdjęcie posiłku / etykiety | `<input type=file capture>` + zmniejszanie w canvas | `@capacitor/camera` (aparat lub biblioteka, od razu JPEG ≤ 1024 px) | S |
| Długie przytrzymanie, przeciąganie | pointer events | bez zmian + haptyka przy „podniesieniu” | S |
| Pogoda | miejscowość wpisana ręcznie (kv) | opcjonalnie **Core Location** „przy użyciu” zamiast wpisywania | S |
| Wysyłka planów na Wahoo | automat raz dziennie **przy otwarciu aplikacji** (`useWahoo`) | bez zmian; opcjonalnie `BGAppRefreshTask` (iOS nie gwarantuje pory) | S |
| Instrukcja | `public/pomoc.html` poza routerem | ekran w aplikacji (ten sam HTML w WKWebView lub komponent) – bez wyjścia do Safari | S |
| Pełna aplikacja (kalendarz z przenoszeniem, Postęp z wykresami, Biblioteka, Sprzęt, Wyjazd, raporty) | tylko `/` | **v1: bez nich** (zostają w webie na komputerze); do `/m` w kolejnych etapach – najpierw Postęp. Trybu siłowni nie ma co przenosić – usunięty z całej aplikacji 26.10.2026 | L |

S ≈ do pół dnia, M ≈ 1 dzień, L ≈ kilka dni.

## 3. UI – co zmienić, żeby aplikacja „czuła się” natywnie (Human Interface Guidelines)

`/m` od początku naśladuje iOS (duże tytuły, grupy, arkusze, pasek zakładek, skala SF, cele ≥ 44 pt), więc zmiany są
punktowe. Do zrobienia:

1. **Zachowania przeglądarki do wyłączenia**: przybliżanie, zaznaczanie tekstu poza polami, menu „Kopiuj/Otwórz link”
   po przytrzymaniu (`-webkit-touch-callout: none`), podświetlenie dotknięcia, odbicie całego `body` (rubber band) –
   przewija się treść ekranu, nie dokument.
2. **Gest „wstecz”** od lewej krawędzi na ekranach z przyciskiem wstecz (jazda, podsumowanie, dzień) – dziś go nie ma.
3. **Arkusze**: przeciągnięcie w dół zamyka arkusz (dziś tylko ✕ i tło); rozważyć wysokości jak systemowe (`medium`/`large`).
4. **Haptyka** (`@capacitor/haptics`): zapis, przełącznik, podniesienie dnia w Planie, błąd walidacji, koniec przerwy.
5. **Pasek statusu i ekran startowy**: ikona i ekran startowy z Xcode (bez białego błysku WebView), styl paska dopasowany
   do ekranu. Większość obejść `useViewport` (kurczenie okna PWA o pasek statusu) w aplikacji jest zbędna – zostaje tylko
   zachowanie klawiatury (`@capacitor/keyboard`, tryb `resize: native`) – sprawdzić na urządzeniu i uprościć.
6. **Pola**: liczby i daty z list/kalendarza (już w Progach, 26.10.2026); tak samo w check-inie (waga, tętno) zamiast klawiatury.
7. **Dynamic Type i VoiceOver**: dziś rozmiary w px. HIG zaleca skalowanie tekstu – minimum: etykiety dostępności na
   przyciskach-ikonach i kartach (część już jest), test z VoiceOver na trzech zakładkach. Pełne Dynamic Type – później.
8. **Tryb ciemny**: `/m` ma tylko jasny motyw (świadoma decyzja, docs/24). Apple nie odrzuca za brak ciemnego, ale przy
   ciemnym systemie trzeba wymusić jasny wygląd (`UIUserInterfaceStyle = Light`), żeby nie mieszać pasków.
9. **Teksty i komunikaty**: żadnych odwołań do „przeglądarki”, „pełnej aplikacji”, „dodaj do ekranu początkowego”,
   „odśwież stronę”; przycisk „Wróć do poprzedniego wyglądu” (`ui_mode`) znika.
10. **Linki zewnętrzne** (Strava, Wahoo, pomoc): `SFSafariViewController` (`@capacitor/browser`), nie wyjście
    z aplikacji.

## 4. Nowe możliwości iOS (niedostępne dla PWA)

Szczegółowy plan funkcji natywnych (Apple Health, haptyka, powiadomienia, skaner, widżet) i przegląd UI/UX wobec HIG
z nowymi etapami: **docs/27-ios-funkcje-natywne-i-ux.md** (26.10.2026).

Kolejność według wartości dla zawodnika:

1. **HealthKit**
   - *odczyt*: masa ciała (waga łazienkowa z Apple Health → check-in sam się wypełnia), tętno spoczynkowe i HRV z zegarka,
     sen – rano zostaje tylko „nogi” i samopoczucie; treningi kolarskie z Watcha jako zapas, gdy Strava milczy.
   - *zapis*: energia i białko z posiłków (Dietetyk) – Zdrowie widzi bilans.
   - Uprawnienia per typ danych, z opisem po polsku; dane HealthKit nie trafiają do reklam ani iCloud (§ 6).
2. **Skaner kodu kreskowego** (VisionKit `DataScannerViewController` albo AVFoundation) → Open Food Facts → wartości
   na 100 g bez zdjęcia etykiety i bez modelu. Naturalne rozwinięcie „Ostatnich produktów” (docs/25 Beta 2).
3. **Rozpoznawanie tekstu na urządzeniu** (Vision `VNRecognizeTextRequest`): etykietę można przeczytać lokalnie i wysłać do
   modelu tylko tekst – szybciej niż 10 s i taniej; zdjęcie nie opuszcza telefonu.
4. **Widżety** (WidgetKit, mała część w Swift): „Dziś: Z2 1 h · zostało ~1 060 kcal · białko 95/180” na ekranie
   początkowym i blokady. Dane z App Group zapisywane przez aplikację przy synchronizacji.
5. **Lokalne powiadomienia** bez serwera: koniec przerwy, przypomnienie o check-inie, „za godzinę jazda – wyślij na Bolta”.
6. **Szybkie akcje ikony** (przytrzymanie): „Dodaj posiłek”, „Check-in”, „Trener”.
7. **App Intents / Siri / Skróty**: „Co mam dziś?”, „Zapisz wagę 103,4”, „Dodaj posiłek” – także na Watchu przez Siri.
8. **Udostępnianie do aplikacji** (Share Extension): zdjęcie z Rolki → posiłek.
9. ~~**Live Activity** w czasie siłowni (seria, przerwa) na Dynamic Island~~ – odpada (siłownia usunięta 26.10.2026).
10. **Apple Watch** – osobny projekt, poza zakresem.

## 5. Elementy do przebudowy pod wytyczne App Store

Najważniejsze luki, które dziś **na pewno** skończyłyby się odrzuceniem albo pytaniem recenzenta:

| Wymóg | Stan dziś | Zmiana |
|---|---|---|
| **Usunięcie konta w aplikacji** (5.1.1(v)) | brak | „Usuń konto” w Ja → Konto: potwierdzenie, Edge Function `account-delete` (usuwa dane we wszystkich tabelach i użytkownika auth, odłącza Stravę/Wahoo) |
| **Polityka prywatności** (5.1.1(i)) – link w aplikacji i w App Store Connect | brak | strona `public/prywatnosc.html` (co zbieramy, gdzie: Supabase UE, OpenRouter/Google, Anthropic, Strava, Wahoo, Resend; okres przechowywania; kontakt) + wiersz w Ja |
| **Zgoda na wysyłkę danych do zewnętrznej AI** (5.1.2(i)) | zdjęcia posiłków → OpenRouter/Google, rozmowy i jazdy → Anthropic, bez osobnej zgody | jednorazowy ekran zgody przed pierwszym użyciem Trenera i zdjęć posiłków (kto dostaje dane, po co, czy są przechowywane); odmowa = funkcja wyłączona, reszta działa |
| **Minimalna funkcjonalność – nie „opakowana strona”** (4.2) | — | bundle lokalny, działanie offline, HealthKit, aparat, powiadomienia natywne, widżet, brak elementów przeglądarkowych (§ 3) |
| **Kompletność i konto demo** (2.1) | rejestracja tylko z listy `private.allowed_emails`, logowanie kodem z maila | konto demo dla recenzenta z danymi (jazdy, posiłki); logowanie kodem nie działa dla recenzenta → stały kod dla konta demo albo hasło tylko dla niego; w notatce do recenzji opis Stravy/Wahoo (wymagają kont zewnętrznych) |
| **Treści zdrowotne** (1.4.1) | budżet kcal, deficyt, zalecenia przy chorobie | widoczna informacja „szacunki, nie porada medyczna” przy Jedzeniu i Trenerze (ogólne komunikaty już są – CLAUDE.md); bez twierdzeń o dokładności |
| **HealthKit** (5.1.3, 2.5.1) | — | tylko typy faktycznie używane, opisy uprawnień, brak wymuszania zgody, dane z HealthKit nie w reklamach/iCloud, wzmianka w polityce prywatności |
| **Uprawnienia** (5.1.1(iv)) | przeglądarka pyta sama | opisy w `Info.plist` po polsku (aparat, zdjęcia, lokalizacja, Zdrowie, powiadomienia); pytanie dopiero przy użyciu funkcji, nie na starcie |
| **Logowanie zewnętrzne / Sign in with Apple** (4.8) | od 26.10.2026 logowanie przez Google i Stravę obok kodu z maila (docs/28) | **przed zgłoszeniem do App Store wymagane też Sign in with Apple** (albo inna opcja spełniająca 4.8: tylko imię i e-mail, ukrycie adresu, bez śledzenia) – logowanie Google to „third-party login service”. Wymaga płatnego Apple Developer Program (Service ID, klucz, capability w Xcode), więc **teraz go nie robimy**; na TestFlight i instalację z Xcode wystarczy obecny stan. Strava jako logowanie to też zewnętrzna usługa logowania – 4.8 dotyczy wszystkich |
| **Powiadomienia** (4.5.4) | — | tylko treningowe, wyłączalne w aplikacji; zgoda pytana przy włączaniu |
| **Linki do zakupów / płatności** (3.1) | brak | nic do zrobienia |
| **Metadane** (2.3) | — | zrzuty z aplikacji (nie makiety), opis bez obietnic medycznych, kategoria Zdrowie i fitness, kwestionariusz prywatności w App Store Connect |

Poza Apple: **regulamin API Stravy** (od 2024 ogranicza m.in. przetwarzanie danych Stravy przez modele AI i pokazywanie ich
innym niż właściciel) – dla aplikacji publicznej z notatkami trenera trzeba to sprawdzić przed zgłoszeniem; prywatne
użycie przez TestFlight tego problemu nie zmienia, ale go nie znosi.

## 6. Dystrybucja – rekomendacja

- **TestFlight, testerzy wewnętrzni** (do 100 osób z dostępem do App Store Connect): bez recenzji aplikacji, build ważny
  90 dni, instalacja z aplikacji TestFlight. **Wystarcza dla dwóch kont** – rekomendacja na start.
- **App Store (publicznie albo „Unlisted”)**: pełna recenzja, wszystkie punkty z § 5 obowiązkowo, plus decyzja o otwarciu
  rejestracji (dziś lista dozwolonych e-maili) – aplikacja, do której nikt nie może się zarejestrować, nadaje się raczej na
  dystrybucję „Unlisted” niż publiczną.
- Oba warianty wymagają **płatnego Apple Developer Program** (99 USD/rok). Bez niego: instalacja z Xcode na własny telefon
  z darmowym kontem, ważna 7 dni.

Plan prac zakłada, że punkty z § 5 robimy od razu (są też dobre same w sobie: usuwanie konta, prywatność, zgoda na AI),
żeby późniejsze zgłoszenie do App Store nie wymagało przeróbek.

## 7. Etapy

**Uwaga 26.10.2026:** etapy 1–4 poniżej zastępuje kolejność z docs/27 § 4 (1a szlify HIG → 2 Apple Health → 1b parytet → 3 App Store).

| Etap | Zakres | Czas |
|---|---|---|
| **0. Powłoka** | Capacitor + `ios/`, build `VITE_TARGET=ios` prosto do `/m`, ikona i ekran startowy, wyłączenie zachowań przeglądarki, test w symulatorze i na telefonie (Xcode, konto darmowe lub płatne) | 1 dzień |
| **1. Parytet `/m`** | logowanie + Universal Links, Strava/Wahoo przez `ASWebAuthenticationSession`, ustawienia konta/maili/powiadomień/programu w Ja, instrukcja w aplikacji, aparat natywny, haptyka, gest wstecz, zamykanie arkuszy gestem | 2–3 dni |
| **2. Wymogi App Store** | usuwanie konta (Edge Function + UI), polityka prywatności, ekran zgody na AI, informacja „nie porada medyczna”, opisy uprawnień, konto demo | 1–2 dni |
| **3. Natywne funkcje** | APNs (zamiast Web Push w aplikacji), lokalne powiadomienia (check-in), HealthKit odczyt (masa, tętno spocz., HRV, sen) → check-in, zapis posiłków do Zdrowia, sesja w Keychain | 2–3 dni |
| **4. Wyróżniki** | widżet Dziś, szybkie akcje, skaner kodów + Open Food Facts, OCR etykiety na urządzeniu, App Intents | 3–4 dni |
| **5. Brakujące ekrany** | Postęp w `/m` (dziś tylko w pełnej aplikacji), potem kalendarz miesiąca; siłowni nie ma (usunięta z aplikacji 26.10.2026) | 2–4 dni |
| **6. Dystrybucja** | App Store Connect, TestFlight; ewentualnie zgłoszenie do recenzji | 0,5 dnia + czas Apple |

Etapy 0–3 dają aplikację lepszą od PWA na co dzień; 4–5 robią z niej coś, czego PWA nie umie.

## 8. Ryzyka

- **WKWebView nadal jest WebKitem** – część błędów układu z klawiaturą może zostać; sprawdzić w etapie 0 na telefonie, zanim
  zaczniemy usuwać obejścia.
  **Wyniki z symulatora (26.10.2026, `@capacitor/keyboard`, `resize: native`):** klawiatura zmniejsza cały WebView do
  obszaru nad nią – pole e-mail na logowaniu i pole czatu Trenera stoją tuż nad klawiaturą, nagłówek arkusza zostaje
  widoczny, nic nie chowa się pod klawiaturą. Po zamknięciu klawiatury (logowanie, czat) układ wraca do pełnej wysokości –
  błąd PWA „okno krótsze o pasek statusu” (docs/24 § 6) się nie pojawił. Pod zaokrąglonymi rogami klawiatury było widać
  czarne tło okna – naprawione tłem okna #f2f2f7 w `SceneDelegate.swift`. Obejścia `useViewport` zostają, dopóki ten sam
  test nie przejdzie na telefonie (zwłaszcza wznowienie aplikacji z tła z otwartą klawiaturą); wtedy do usunięcia
  w buildzie iOS: leczenie `display` i podłoga `100lvh`, zostaje pomiar `--m-vvh` (albo zdarzenia `keyboardWillShow`).
  Uwaga do testów: w buildzie Debug zrzuty z symulatora bywają ~1–2 s za dotknięciem – brak reakcji na zrzucie to zwykle
  opóźnienie, nie zgubione dotknięcie.
- **Dwa kanały powiadomień** (Web Push dla webu, APNs dla iOS) – `push-send` musi wysyłać na oba bez dubli na tym samym
  telefonie (subskrypcja web na iPhonie wygasa po instalacji aplikacji – usuwać ją przy rejestracji tokenu APNs).
- **Testy E2E** pokrywają web, nie powłokę iOS – dla iOS zostają testy ręczne w symulatorze (narzędzie symulatora
  w Claude Code działa: zrzuty, dotknięcia, klawiatura ekranowa) i ewentualnie XCUITest dla ścieżek krytycznych.
- **Wersja programu w bundlu**: aplikacja z TestFlight może mieć starszy `PROGRAM_VERSION` niż web – synchronizacja już
  zapisuje `program_version` w profilu; pokazać „zaktualizuj aplikację”, gdy serwer zna nowszy.

## 9. Decyzje do podjęcia

1. **Apple Developer Program (99 USD/rok)** – teraz (TestFlight, APNs, HealthKit na urządzeniu bez 7-dniowego limitu) czy
   etap 0 na darmowym koncie? *Rekomendacja: wykupić przed etapem 3 – APNs i dystrybucja TestFlight go wymagają.*
2. **Cel dystrybucji**: tylko TestFlight dla dwóch kont, czy docelowo App Store? Od tego zależy, czy etap 2 jest
   obowiązkowy przed pierwszą instalacją (rekomendacja: zrobić i tak).
3. ~~**Zakres v1**~~ – **rozstrzygnięte 26.10.2026**: siłownia znika z aplikacji iOS całkowicie (aplikacja tylko kolarska),
   Postęp zostaje i wchodzi w późniejszym etapie (5). Tego samego dnia siłownia zniknęła też z webu i z obu programów (`PROGRAM_VERSION` 2026.10.26-1).
4. **Identyfikator aplikacji i nazwa**: np. `pl.felsztukier.trening`, nazwa „Trening” (nazwa w App Store musi być unikalna –
   ewentualnie „Trening – Kolarski Trener”).
