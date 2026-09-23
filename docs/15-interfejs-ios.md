# 15. Uproszczony interfejs w stylu iOS (`/i`)

Drugi, równoległy interfejs aplikacji: te same dane i ten sam silnik, ale wygląd i zakres jak w natywnej
aplikacji na iPhone'a. Powstał 23.09.2026. Pełna aplikacja (`/`) nie zmienia się – to ona zostaje miejscem
funkcji zaawansowanych.

## Po co

Codzienna praca z planem to pięć czynności: **check-in rano → odprawa (pogoda, ubiór, jedzenie) → wysłanie
treningu na licznik → trening → podsumowanie**. W pełnej aplikacji te czynności są wymieszane z kalendarzem,
regułami R1–R16, krzywą mocy, biblioteką i ustawieniami. Uproszczony interfejs pokazuje tylko je, w kolejności
dnia, z jednym wyróżnionym działaniem („co teraz?”).

## Zakres

| Jest w `/i` | Zostaje tylko w `/` |
|---|---|
| Ekran dnia z kartą treningu i krokami dnia | Kalendarz miesiąca i przenoszenie treningów |
| Check-in (waga co drugi dzień, sen/nogi/motywacja) | Krzywa mocy, wykres formy (PMC), kadencja |
| Odprawa: pogoda w oknie treningu, ubiór, jedzenie | Raporty tygodnia i miesiąca |
| Wysyłka treningu na Bolta i stan na liczniku | Biblioteka treningów i ćwiczeń, strefy, zasady |
| Szczegóły treningu: kroki z celami, wersja pod dachem | Sprzęt, wyjazd, kopia danych, logowanie |
| Podsumowanie jazdy: czas, moc, TSS, zgodność z planem | Historia siły, objętość, punkt wyjścia |
| Tydzień: siedem dni, obciążenie plan vs wykonanie | Sezon (53 tygodnie, fazy) |
| Postęp: cel 30 km/h, FTP, waga, forma, ostatnie jazdy | Integracje (łączenie Stravy i Wahoo) |
| Progi (FTP, LTHR), miernik mocy, powiadomienia, motyw | Reszta ustawień |

Tryb siłowni (`/silownia/:date`) jest wspólny – był od początku pełnoekranowy i prosty, więc uproszczony
interfejs po prostu do niego prowadzi.

## Nawigacja i przełączanie

- Cztery zakładki: **Dziś**, **Tydzień**, **Postęp**, **Więcej**.
- `/i` – dziś, `/i/dzien/:date` – dowolny dzień (ten sam ekran), `/i/trening/:date` – szczegóły jazdy,
  `/i/tydzien/:monday`, `/i/postep`, `/i/wiecej`.
- Ustawienie `ui_mode` w `kv` (`classic` | `ios`) decyduje, czy start aplikacji (`/`) przekierowuje do `/i`
  (`ModeGate` w `App.tsx`). „Otwórz pełną aplikację” ustawia znacznik `trening:full-ui` w `sessionStorage`,
  więc przekierowanie odpuszcza do końca sesji; „Prosty widok na iPhone'a” w Więcej kasuje znacznik.

## Przepływ dnia

`src/ios/dayState.ts` (czysty TypeScript, testy `src/ios/__tests__/dayState.test.ts`) liczy listę kroków
i jeden następny:

1. **Poranny check-in** – zrobiony, gdy jest wpis z wagą albo samopoczuciem.
2. **Plan na Bolcie** – tylko dla treningów, które da się wysłać; zrobiony, gdy `wahoo_pushes` ma aktualny
   `external_id`. Nie proponowany dla dni przeszłych.
3. **Trening** – jazda (albo siłownia w dniu bez jazdy); zrobiony, gdy jest jazda ze Stravy albo zapisany log.
4. **Podsumowanie** – zrobione, gdy log dnia ma status inny niż „zaplanowane”.

Dzień w przyszłości ma tylko krok „Plan na Bolcie” jako działanie; dzień wolny – tylko check-in.

## Wygląd

`src/ios/ios.css` odwzorowuje systemowe kolory (System Grouped Background, Label, Separator), skalę pisma
SF Pro (34/22/20/17/15/13/12) i elementy: pasek nawigacji z dużym tytułem zwijanym przy przewijaniu, listy
„inset grouped” z separatorami od 16 px, arkusze wysuwane od dołu, segmented control, dolny pasek zakładek
z rozmyciem tła. Motyw ciemny steruje ta sama klasa `dark` co w pełnej aplikacji. Ikony to kreskowe SVG
w duchu SF Symbols (`src/ios/components/Icons.tsx`) – bez emoji, żeby rytm typograficzny się zgadzał.

Uwaga: dolny pasek zakładek jest `position: fixed`. W zwykłej karcie Safari dolne 20–30 px potrafi przykryć
pasek przeglądarki; aplikacja jest przeznaczona do uruchamiania z ekranu początkowego (PWA), gdzie problemu nie ma.

## Pliki

```
src/ios/ios.css              tokeny i klasy wyglądu
src/ios/IosApp.tsx           powłoka: trasy i pasek zakładek
src/ios/dayState.ts          kroki dnia, ważenie co drugi dzień, forma i ocena w słowach (testowane)
src/ios/summary.ts           główny cel treningu i etykieta struktury („3 × 12 min”)
src/ios/useIos.ts            tryb interfejsu, dane dnia, zgodność jazdy, liczby na Postęp
src/ios/useBriefing.ts       pogoda w oknie treningu + ubiór i jedzenie
src/ios/components/          Chrome.tsx (ekran, listy, arkusz, przyciski), Icons.tsx, arkusze
src/ios/screens/             DayScreen, WorkoutScreen, WeekScreen, ProgressScreen, MoreScreen
e2e/ios.spec.ts              testy przepływu (bez emulacji `isMobile` – patrz komentarz w pliku)
```
