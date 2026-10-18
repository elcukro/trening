# 24 – Mobilny interfejs v2 (`/m`): podejście (18.10.2026)

Alternatywny widok mobilny projektowany od zera, z tym, co wiemy po trzech tygodniach używania (`docs/21`) i po
miesiącu z `/i` (`docs/15`). Nadal PWA (bez sklepów), ale wzorce i rytm jak w natywnej aplikacji na iPhone'a.
Obecny `/i` zostaje jako fallback (`ui_mode`), dopóki v2 nie jest doszlifowany; pełna aplikacja `/` zostaje na komputer.

## 1. Czego nauczyło nas używanie

1. **Wejście przegrywa z czatem, wyjście działa.** Konto A: 9 check-inów na 26 dni, 0 RPE na 20 jazd – dane podaje
   słownie. Import ze Stravy, notatki, maile, push, Bolt – codziennie, bez błędów. Pierwszego dnia czatu zawodnik
   dostał od razu poprawną odpowiedź o tygodniu i odmowę złego przeniesienia. **Wniosek: zdanie jest główną formą
   wprowadzania danych, formularz jest podglądem i korektą.**
2. **Aplikacja jest otwierana krótko i z powodu.** Powody to push (odprawa rano, podsumowanie po imporcie, list
   w niedzielę), mail i „co dziś”. Każde wejście powinno lądować od razu na właściwym stanie dnia, nie na ekranie ogólnym.
3. **Pięć kroków dnia** (check-in → Bolt → trening → podsumowanie) jest trafne, ale ekran Dziś w `/i` urósł do 6 sekcji
   i 468 linii: karta treningu, kroki, odprawa, uwagi, zmiany w planie, trener, żywienie. Na telefonie widać 1,5 sekcji.
4. **Nieużywane:** tryb siłowni (0 serii na obu kontach), sprzęt/pakowanie/serwis (za wcześnie), biblioteka, kalendarz
   z przeciąganiem (działa, ale 6 nadpisań w 3 tygodnie – wystarczy prostszy gest albo czat).
5. **Trzy miejsca wejścia dla tych samych danych** (arkusz check-inu, arkusz po jeździe, czat) to za dużo; w v2 jest
   jedno – rozmowa – i dwa szybkie dotknięcia tam, gdzie liczby są jednowymiarowe (RPE 1–10, nogi 1–5).
6. **Bolt i Strava są „automatami”**, nie krokami: wysyłka raz dziennie sama, import sam. W UI mają być stanem
   („na liczniku”, „jazda wczytana”), nie przyciskiem do wciśnięcia – przycisk tylko, gdy automat zawiódł.

## 2. Zasady projektowe v2

1. **Jedno wejście: rozmowa.** Przycisk „Trener” jest zawsze w zasięgu kciuka (środek dolnego paska). Otwiera arkusz
   z klawiaturą od razu (dyktowanie z klawiatury iOS). Podpowiedzi-chipy zależą od stanu dnia: rano „Waga …, tętno …,
   nogi …”, po jeździe „RPE …”, wieczorem „Jutro nie dam rady”. Czat zapisuje, a ekran pokazuje skutek od razu.
2. **Ekran odpowiada na jedno pytanie.** Dziś = „co teraz?”. Plan = „co dalej?”. Ja = „jak idzie?”. Nic więcej na
   ekranie, reszta pod dotknięciem.
3. **Rzut oka bez przewijania.** Pierwszy ekran każdej zakładki mieści się w jednym widoku iPhone'a (ok. 700 pt pod
   tytułem): jedna karta stanu z 1–3 dużymi liczbami i jednym działaniem.
4. **Stan zamiast kroku.** Zamiast listy czterech kroków z chevronami – jedna karta, która zmienia się w ciągu dnia
   (rano → przed jazdą → na liczniku → po jeździe → wieczór). Historia dnia jako cienka oś pod kartą.
5. **Natywne wzorce, bez udawania:** duży tytuł zwijany, arkusze od dołu z uchwytem, przewijanie tygodni gestem
   (`scroll-snap`), przejścia push/pop (View Transitions API), pociągnięcie w dół = synchronizacja, wibracja tam,
   gdzie się da (Android), cele dotyku ≥ 44 pt, safe areas, `100dvh`, bez podświetlenia dotyku WebKit.
6. **Push prowadzi do stanu.** Każde powiadomienie ma deep link: rano `/m?focus=brief`, po imporcie `/m/jazda/<data>`,
   niedziela `/m/ja?week=…`. To samo z maili.

## 3. Architektura informacji

Trzy zakładki i jeden przycisk:

```
┌──────────────────────────────────┐
│  Dziś          Plan         Ja   │   ← dolny pasek
│         ( Trener ●  )            │   ← wyróżniony środkowy przycisk (otwiera rozmowę)
└──────────────────────────────────┘
```

| Zakładka | Pytanie | Pierwszy ekran | Pod dotknięciem |
|---|---|---|---|
| **Dziś** | co teraz? | karta stanu dnia + oś dnia + „jutro” jednym wierszem | szczegół jazdy (kroki, strefy, pod dachem), odprawa, podsumowanie jazdy |
| **Plan** | co dalej? | tydzień jako 7 wierszy (dzień, nazwa, czas, znacznik Klucz/Test, stan), przewijany gestem na kolejne tygodnie; TSS plan/wykonanie w nagłówku | dzień (jak Dziś, ale dla innej daty), przeniesienie („Przenieś” → lista wolnych dni z walidacją R15, bez przeciągania), zamiana dwóch dni |
| **Ja** | jak idzie? | cel 30 km/h (FTP teraz vs wymagane), masa z trendem i punktem kontrolnym, forma (CTL/TSB jednym słowem), ostatni test i następny | ostatnie jazdy, historia FTP, waga wykres, ustawienia (progi, miernik, powiadomienia, maile, konto, integracje jako stan + „Połącz ponownie”), „Wróć do poprzedniego wyglądu” |
| **Trener** | – | rozmowa: jeden ciągły wątek (ostatnie 7 dni), chipy wg stanu dnia, wyniki narzędzi jako zielone linie | – |

Wypada z mobile (zostaje w `/`): kalendarz miesiąca z przeciąganiem, krzywa mocy, kadencja, raporty tygodnia/miesiąca
(mail i tak prowadzi do `/`), biblioteka, sprzęt, wyjazd, kopia, tryb siłowni (gdy `gym_enabled`, wiersz dnia z siłownią
prowadzi do istniejącego `/silownia/:date`).

## 4. Ekran po ekranie

### Dziś – karta stanu
Stany liczone czystym TS (`dayState.ts` rozszerzony o `phase`), kolejność w ciągu dnia:

| Stan | Kiedy | Karta pokazuje | Jedno działanie |
|---|---|---|---|
| `morning` | brak check-inu | „Jak się czujesz?” + ostatnia waga + trening dnia jednym wierszem | **Powiedz trenerowi** (otwiera rozmowę z chipem check-inu) · „wpisz ręcznie” jako drugi, mały |
| `brief` | check-in jest, jazda przed nami | nazwa i czas jazdy, 3 cele (W, bpm, rpm) dużą czcionką, pogoda na godzinę jazdy + ubiór jednym zdaniem, stan Bolta („na liczniku” / „wysyłam” / błąd) | **Pokaż kroki** (szczegół jazdy); gdy Bolt zawiódł: „Wyślij na Bolta” |
| `riding` | jazda dziś, jeszcze bez importu, po godzinie startu | jak `brief`, ale ciszej („Jazda w toku / czekam na Stravę”) | brak |
| `after` | jazda zaimportowana | 3 liczby: zgodność z planem %, TSS, Pw:HR (dryf); notatka trenera 2 pierwsze zdania; **rząd RPE 1–10** – jedno dotknięcie zapisuje | **Podsumowanie** (pełna notatka, strefy, plan vs wykonanie) |
| `evening` | RPE jest albo po 20:00 | „Jutro: …” (nazwa, czas, stan Bolta) + żywienie jutra jednym zdaniem | **Powiedz trenerowi** (chip „Jutro nie dam rady…”) |
| `rest` | dzień wolny | check-in jak `morning`, potem „Wolne. Jutro: …” + żywienie na dzień wolny | – |
| `skipped` | oznaczone pominięte | „Odpuszczone: …” + jutro | Cofnij |

Pod kartą **oś dnia**: 4 kropki (check-in · Bolt · jazda · RPE) z podpisami, zrobione = wypełnione – to dawna lista
kroków zbita do jednego wiersza. Niżej jeden wiersz „Żywienie: deficyt ok. 700 kcal · 180 g białka · 60–80 g/h”
(rozwijany). Uwagi z reguł R1–R16 tylko, gdy są (`warn`), jako żółty pasek nad kartą z jednym przyciskiem.

Przykład (`brief`):
```
  Dziś                                   ●  (stan sync)
  niedziela 18 października · tydzień 5 · deload

  ┌────────────────────────────────────────┐
  │ Baza tlenowa Z2                1 h 30  │
  │                                        │
  │   132–176 W     130–142 bpm   80–95   │
  │                                        │
  │ ☀ 9 °C · wiatr 9 km/h · długi rękaw   │
  │ ◉ Na liczniku                          │
  │                                        │
  │ [        Pokaż kroki         ]         │
  └────────────────────────────────────────┘
  ●───●───○───○   check-in · Bolt · jazda · RPE
  Żywienie  deficyt ok. 700 kcal · 180 g białka     ›
  Jutro     60 min Z2 · na liczniku
```

### Jazda (szczegół)
Pełny ekran push: kroki jako pionowa oś czasu ze strefami (kolory z `lib/zones`), waty i bpm przy każdym, łączny czas,
przyciski „Pod dachem” (override `indoor`) i „Wyślij na Bolta” (tylko gdy nie ma na liczniku). Bez żywienia i pogody –
one są na karcie.

### Podsumowanie jazdy
Nagłówek 3 liczby, pełna notatka trenera, pasek plan vs wykonanie (czas w strefach), moc/tętno/kadencja/dryf w jednej
siatce 2×3, RPE 1–10 (zapis natychmiastowy, bez „Zapisz”), pole „jedno zdanie” → to samo co wysłanie do trenera.
Gdy dwie jazdy w dniu – segment na górze.

### Plan
Lista 7 dni; `scroll-snap` w poziomie między tygodniami, nagłówek „Tydzień 5 · 13–19.10 · deload · 6 h 30 / 4 h 10”.
Wiersz: dzień tygodnia i data, nazwa treningu, czas, pigułki (Klucz ★ / Test / Góry), stan (✓ zrobione, ✗ pominięte,
◉ na liczniku, – wolne). Dotknięcie = ekran dnia. Przytrzymanie = menu: „Przenieś na…” (arkusz z listą dni wolnych,
te zabronione przez R15 wyszarzone z powodem), „Zamień z…”, „Pomiń”, „Pod dachem”. Zmiany kończą się toastem z „Cofnij”
i proponują wysyłkę na Bolta.

### Ja
Trzy karty u góry: **Cel** (FTP teraz → wymagane, W/kg, pasek), **Masa** (ostatnia, trend/tydz., następny punkt
kontrolny i czy w terminie), **Forma** (CTL/TSB jednym słowem: świeży / w rytmie / zmęczony + liczba). Niżej lista:
ostatnie jazdy (nazwa, data, TSS, Pw:HR), test FTP (ostatni, następny w planie), i grupa Ustawienia.

### Trener
Jeden ciągły wątek zamiast rozmowy per dzień (kv `coach_thread`, przycinany do 7 dni – zmiana w `coachChat.ts`).
Chipy nad klawiaturą zależne od `dayState`. Wyniki narzędzi jak dziś. Mikrofon = dyktowanie klawiatury (Web Speech
API nie działa w PWA na iOS – nie udajemy własnego nagrywania).

## 5. Wygląd

- Własny arkusz `src/m/m.css` z tokenami (`--bg`, `--card`, `--label`, `--accent`, `--zone-*`, skala 34/28/22/17/15/13),
  jasny i ciemny z `prefers-color-scheme` i klasą `dark` (jak dziś). Czcionka systemowa (`-apple-system`), liczby
  `font-variant-numeric: tabular-nums`.
- Jedna karta na ekran w akcencie dnia (kolor strefy głównego kroku: Z2 zielony, akcent pomarańczowy, test czerwony,
  wolne szary) – ekran mówi kolorem, jaki to dzień, zanim przeczytasz.
- Ikony kreskowe z `Icons.tsx` (reużycie), bez emoji. Animacje tylko CSS (`view-transition`, `transform`), bez bibliotek.
- Dostępność: `role`, `aria-label`, kontrast ≥ 4,5, Dynamic Type przez `rem` od 17 px.

## 6. Technika

- **Nowy katalog `src/m/`** (`MobileApp.tsx`, `m.css`, `screens/`, `components/`, `state/`), trasa `/m/*`.
  Logika bez UI, która dziś siedzi w `src/ios/` (`dayState.ts`, `useIos.ts`, `useBriefing.ts`, `summary.ts`, `useCoach.ts`,
  `coachContext.ts`, `coachTools.ts`), **najpierw przechodzi do `src/day/`** i oba interfejsy ją importują – żeby v2
  nie dublował hooków i żeby `/i` dało się potem skasować jednym `rm`.
- **`ui_mode`** dostaje trzecią wartość `'m'`; `ModeGate` kieruje poniżej 1024 px na `/i` (domyślnie) albo `/m`
  (gdy ustawione). Przełączniki: w `/i` Więcej → „Wypróbuj nowy wygląd”, w `/m` Ja → „Wróć do poprzedniego wyglądu”.
  Po doszlifowaniu domyślne staje się `/m`, `/i` zostaje jako fallback do skasowania.
- **`FULL_ESCAPE` i `NO_ACCOUNT`** działają jak dziś; logowanie reużywa `LoginScreen` (przeniesiony do `src/day/`).
- **Push**: `push-send` dostaje `url` per typ powiadomienia (`/m?focus=brief`, `/m/jazda/<data>`), `sw.ts`
  `notificationclick` już otwiera `url`. Maile: linki do `/m/...` tylko dla kont z `ui_mode = 'm'`? Nie – `ui_mode` jest
  per urządzenie w kv; linki w mailach prowadzą do `/i`/`/` jak dziś, a `ModeGate` przekieruje. Trzeba dopisać mapę
  ścieżek `iosPathFor` → `mobilePathFor`.
- **Ograniczenia PWA na iOS, które projekt szanuje:** brak `navigator.vibrate` i haptyki, brak Web Speech API w trybie
  standalone, brak synchronizacji w tle (push działa od 16.4 i już jest), 7 dni nieużywania może wyczyścić storage
  (dlatego wszystko ma kopię w Supabase – jest), dolny pasek `fixed` wymaga PWA z ekranu początkowego (jak dziś).
- **Testy:** `dayState` v2 czystym TS (Vitest), e2e `e2e/mobile.spec.ts` z viewportem iPhone i `?today=` (jak `/i`),
  test przeciw wyciekom literałów programu (`LEAKS` w `e2e/program-ftp300.spec.ts`) rozszerzony o `/m`.
- Bez nowych zależności.

## 7. Etapy

| # | Krok | Gotowe, gdy | Czas |
|---|---|---|---|
| 0 | Wyciągnięcie logiki bez UI z `src/ios/` do `src/day/` | `/i` działa bez zmian, testy zielone, `src/ios/` zawiera tylko komponenty | 0,5 dnia |
| 1 | Szkielet `/m`: tokeny, Chrome (pasek z przyciskiem Trener, duży tytuł, arkusz), `ui_mode 'm'`, przełączniki w obie strony | da się przełączyć i wrócić, puste ekrany z tytułami | 0,5 dnia |
| 2 | Dziś: `dayState` z `phase`, karta stanu z 7 stanami, oś dnia, żywienie, jutro | wszystkie stany pokazane przez `?today=` i dane testowe; test jednostkowy stanów | 1,5 dnia |
| 3 | Trener jako centrum wejścia: jeden wątek, chipy wg stanu, RPE/nogi jednym dotknięciem na karcie | check-in i RPE da się zrobić bez otwierania formularza | 1 dzień |
| 4 | Jazda i Podsumowanie | kroki, pod dachem, Bolt; notatka, strefy, RPE | 1 dzień |
| 5 | Plan: tydzień ze snapem, dzień, przeniesienie z listy, zamiana, pomiń | przeniesienie odrzucone z powodem R15, toast z Cofnij | 1 dzień |
| 6 | Ja: cel, masa, forma, jazdy, test, ustawienia | parytet z Postęp + Więcej w `/i` (bez sprzętu/wyjazdu) | 1 dzień |
| 7 | Push deep linki, pomoc, e2e, domyślne `/m` dla nowych urządzeń | `pomoc.html` opisuje v2, e2e zielone, `/i` tylko przez przełącznik | 0,5 dnia |

**Stan: kroki 0 i 1 zrobione 18.10.2026** (`src/day/`, `src/m/` ze szkieletem trzech ekranów, `ui_mode 'm'`, przełączniki, `mobilePathFor`).

Razem ok. 7 dni pracy; po kroku 3 v2 nadaje się do codziennego użycia równolegle z `/i`.

## 8. Decyzje do podjęcia przed startem

1. **Trener jako środkowy przycisk paska** (3 zakładki + przycisk) czy zawsze widoczne pole tekstowe nad paskiem?
   Propozycja: przycisk – pole zabrałoby 56 pt na każdym ekranie.
2. **Jeden ciągły wątek rozmowy** zamiast per dzień – propozycja: tak (zawodnik pyta wieczorem o jutro).
3. **Zapis natychmiastowy** RPE i nóg po dotknięciu (bez „Zapisz”, z „Cofnij” w toaście) – propozycja: tak.
4. **Tryb siłowni** – wejście z wiersza dnia tylko przy `gym_enabled`, czy całkiem poza mobile? Propozycja: wiersz dnia
   (konto B ma włączone), bez rozwijania.
5. Nazwa trasy `/m` (kontra `/app`, `/v2`).
