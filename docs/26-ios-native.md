# 26 · Natywna aplikacja iOS (Capacitor) – analiza i plan

Stan: analiza 26.10.2026, przed implementacją. Decyzja: **opcja 1** – istniejąca aplikacja React (`/m`) w natywnej
powłoce iOS (Capacitor), z natywnymi wtyczkami tam, gdzie PWA nie sięga. Silnik (`src/engine/`), synchronizacja (Dexie +
Supabase), Edge Functions i wersja webowa zostają bez zmian – aplikacja iOS to trzeci „cel builda”, nie nowy projekt.

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
| Timer przerwy (siłownia) | `navigator.vibrate` (iOS nie obsługuje) + powiadomienie z SW | **lokalne powiadomienie** zaplanowane na koniec przerwy + **haptyka** – działa przy zablokowanym ekranie | S |
| Zdjęcie posiłku / etykiety | `<input type=file capture>` + zmniejszanie w canvas | `@capacitor/camera` (aparat lub biblioteka, od razu JPEG ≤ 1024 px) | S |
| Długie przytrzymanie, przeciąganie | pointer events | bez zmian + haptyka przy „podniesieniu” | S |
| Pogoda | miejscowość wpisana ręcznie (kv) | opcjonalnie **Core Location** „przy użyciu” zamiast wpisywania | S |
| Wysyłka planów na Wahoo | automat raz dziennie **przy otwarciu aplikacji** (`useWahoo`) | bez zmian; opcjonalnie `BGAppRefreshTask` (iOS nie gwarantuje pory) | S |
| Instrukcja | `public/pomoc.html` poza routerem | ekran w aplikacji (ten sam HTML w WKWebView lub komponent) – bez wyjścia do Safari | S |
| Pełna aplikacja (kalendarz z przenoszeniem, Postęp z wykresami, Biblioteka, tryb siłowni, Sprzęt, Wyjazd, raporty) | tylko `/` | **v1: bez nich** (zostają w webie na komputerze); do `/m` w kolejnych etapach – najpierw tryb siłowni i Postęp | L |

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
10. **Linki zewnętrzne** (Strava, YouTube przy ćwiczeniach): `SFSafariViewController` (`@capacitor/browser`), nie wyjście
    z aplikacji.

## 4. Nowe możliwości iOS (niedostępne dla PWA)

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
9. **Live Activity** w czasie siłowni (seria, przerwa) na Dynamic Island – później.
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
| **Logowanie zewnętrzne / Sign in with Apple** (4.8) | własne logowanie e-mailem | nie wymagane (brak logowania przez Google/Facebook); Strava/Wahoo to połączenia, nie logowanie |
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

| Etap | Zakres | Czas |
|---|---|---|
| **0. Powłoka** | Capacitor + `ios/`, build `VITE_TARGET=ios` prosto do `/m`, ikona i ekran startowy, wyłączenie zachowań przeglądarki, test w symulatorze i na telefonie (Xcode, konto darmowe lub płatne) | 1 dzień |
| **1. Parytet `/m`** | logowanie + Universal Links, Strava/Wahoo przez `ASWebAuthenticationSession`, ustawienia konta/maili/powiadomień/programu w Ja, instrukcja w aplikacji, aparat natywny, haptyka, gest wstecz, zamykanie arkuszy gestem | 2–3 dni |
| **2. Wymogi App Store** | usuwanie konta (Edge Function + UI), polityka prywatności, ekran zgody na AI, informacja „nie porada medyczna”, opisy uprawnień, konto demo | 1–2 dni |
| **3. Natywne funkcje** | APNs (zamiast Web Push w aplikacji), lokalne powiadomienia (przerwa, check-in), HealthKit odczyt (masa, tętno spocz., HRV, sen) → check-in, zapis posiłków do Zdrowia, sesja w Keychain | 2–3 dni |
| **4. Wyróżniki** | widżet Dziś, szybkie akcje, skaner kodów + Open Food Facts, OCR etykiety na urządzeniu, App Intents | 3–4 dni |
| **5. Brakujące ekrany** | tryb siłowni i Postęp w `/m` (dziś tylko w pełnej aplikacji), potem kalendarz miesiąca | 3–5 dni |
| **6. Dystrybucja** | App Store Connect, TestFlight; ewentualnie zgłoszenie do recenzji | 0,5 dnia + czas Apple |

Etapy 0–3 dają aplikację lepszą od PWA na co dzień; 4–5 robią z niej coś, czego PWA nie umie.

## 8. Ryzyka

- **WKWebView nadal jest WebKitem** – część błędów układu z klawiaturą może zostać; sprawdzić w etapie 0 na telefonie, zanim
  zaczniemy usuwać obejścia.
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
3. **Zakres v1**: czy tryb siłowni i Postęp muszą być w pierwszej wersji aplikacji (dziś są tylko w pełnej aplikacji)?
4. **Identyfikator aplikacji i nazwa**: np. `pl.felsztukier.trening`, nazwa „Trening” (nazwa w App Store musi być unikalna –
   ewentualnie „Trening – Kolarski Trener”).
