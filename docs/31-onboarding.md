# 31 · Onboarding – kim jesteś i jaki masz cel (26.10.2026)

Pierwsza część przepływu z [docs/30](30-flow-produktu.md) (etapy 1–2): kwestionariusz w `/m` dla nowego konta. Zbiera dane
dla przyszłego generatora planów w TS ([docs/29](29-komercjalizacja.md) § 1). Generator jeszcze nie istnieje, więc onboarding
kończy się podsumowaniem i zapisem ustrukturyzowanych danych. **Kod liczy, model opowiada**: same wybory z list i liczby
z zakresów, walidowane schematem Zod, bez tekstu do interpretacji.

## 1. Przepływ

Powitanie → 10 kroków → podsumowanie → „Gotowe!”. Pasek z dziesięcioma odcinkami i napis „Krok n z 10” u góry, wstecz
(chevron i gest od lewej krawędzi – `useEdgeBack`), „Później” po prawej (odkłada onboarding do końca sesji).

| # | Krok (`STEPS`) | Pytania | Kontrolki |
|---|---|---|---|
| 1 | `time` | godziny w tygodniu, dostępne dni | lista systemowa 1–20 h co 0,5; kółka pn–nd |
| 2 | `time_detail` | najdłuższa jazda w dzień roboczy i w weekend, stałe punkty tygodnia (opcjonalne) | listy; wiersz na każdy dostępny dzień (jazda z grupą / dojazd / wyścig / inne) |
| 3 | `current` | średnio godzin w ostatnich 4 tygodniach, najdłuższa jazda w miesiącu, lata jazdy | chipy |
| 4 | `measure` | moc / tętno / odczucie (docs/30 § 3), progi FTP, LTHR, HRmax, jeśli zna | karty wyboru; listy z „nie wiem” |
| 5 | `gear` | dyscypliny, rowery, trenażer, komputer/zegarek (marka – wybór integracji) | chipy (wielokrotne) |
| 6 | `consent` | zgoda na dane o zdrowiu (art. 9 RODO) | pole wyboru; bez zgody „Dalej” nieaktywne |
| 7 | `body` | wzrost, masa, data urodzenia, płeć | listy, kalendarz systemowy, chipy; **„Pomiń”** |
| 8 | `health` | 7 pytań przesiewowych (na wzór PAR-Q) | Tak/Nie; komunikaty „Najpierw lekarz” / „Będziemy ostrożni” |
| 9 | `goal` | typ celu | karty: wydarzenie, moc (FTP), tempo, masa, forma, powrót po przerwie |
| 10 | `goal_detail` | mierzalne kryterium i data | zależnie od typu (niżej) |

**Zgoda jest przed ciałem i zdrowiem** – pierwsze dane szczególnej kategorii padają dopiero po niej. Klawiatura pojawia się
tylko przy opcjonalnej nazwie wydarzenia. Liczby wybiera się z listy systemowej iOS: przezroczysty `<select>` leży na całym
wierszu, więc koło wyboru otwiera się na bieżącej wartości. Daty pochodzą z kalendarza systemowego (`<input type="date">`).
To pamięć projektu o klawiaturze w PWA iOS (docs/24 § 6).

**Kryteria celu** (`goalSchema`, unia po `type`):
- wydarzenie: data, dystans, przewyższenie, nawierzchnia, opcjonalnie nazwa, „ukończyć” albo docelowy czas;
- FTP: docelowe W, data opcjonalna;
- tempo: km/h przez ile godzin, data opcjonalna;
- masa: docelowe kg i data (tempo ocenia `checks`);
- forma: godziny tygodniowo przez ile tygodni;
- powrót: długość przerwy, powód, docelowe godziny.

**Podsumowanie** ma jeden wiersz na krok. Dotknięcie otwiera krok, a „Gotowe” wraca prosto do podsumowania, bez
przechodzenia przez resztę. Wiersz niewypełniony jest oznaczony „do uzupełnienia”. Na górze są uwagi spójności (`checks`).
„Zapisz” przepuszcza dane przez `finalize` (pełny schemat); gdy czegoś brakuje, przenosi do pierwszego brakującego kroku.

**Haptyka** (aplikacja iOS, `src/native/haptics.ts`): `selection` przy każdym wyborze, `warning` przy pierwszej czerwonej
fladze, `success` po zapisie, `error` przy próbie zapisu niepełnych danych.

## 2. Logika (czysty TS, testy)

`src/engine/onboarding.ts` (testy `src/engine/__tests__/onboarding.test.ts`):
- `athleteProfileSchema` – sekcje `time`, `current`, `measure`, `gear`, `consent`, `body`, `health`, `goal`; pola opcjonalne
  mają `default(null)`, więc zapisany profil ma zawsze pełny kształt (`version: 1`);
- `STEPS`, `stepValid`, `nextStep`, `prevStep`, `firstIncomplete`, `withDays` (stałe punkty tylko w dni dostępne),
  `withGoalType` (zmiana typu czyści pola celu), `finalize`;
- `healthScreen` – **czerwone flagi** (choroba serca/nadciśnienie, ból w klatce, omdlenia/zawroty, zalecony nadzór lekarski)
  → `doctor`: plan tylko spokojny; **żółte** (inna choroba przewlekła, stałe leki, świeża kontuzja) → `caution`: plan
  łagodniejszy, bez testów maksymalnych. Granica jest robocza, do potwierdzenia z prawnikiem (docs/30 § 5 pkt 6);
- `checks` – ostrzeżenia, które nie blokują zapisu:
  - godziny ponad limit dni;
  - skok objętości względem ostatnich 4 tygodni;
  - data celu minęła albo zostały mniej niż 4 tygodnie;
  - tempo chudnięcia > 0,7 % masy/tydz.;
  - miernik mocy bez urządzenia;
  - czerwona flaga;
- `planInputs(profile, today)` – **wejście generatora**:
  - `weekly_hours` (przycięte do limitu dni);
  - `start_weekly_hours` (obecna objętość +10 %);
  - `day_caps_min` na każdy dzień;
  - `fixed`, `measure`, progi;
  - `discipline` (wydarzenia albo pierwsza z listy);
  - `indoor`;
  - `experience` (`novice` / `intermediate` / `experienced`);
  - `intensity_allowed`, `cautious`;
  - `goal`, `weeks_to_goal`.

`src/day/onboarding.ts` (testy `src/day/__tests__/onboarding.test.ts`): `onboardingDue` (kiedy pokazać), `startFrom` (od
czego zacząć), `prefill` (wzrost i data urodzenia z profilu; progi i miernik tylko dla kont `legacy` – nowe konto ma
w ustawieniach wartości domyślne programu, nie swoje).

## 3. Zapis i synchronizacja

Tabela `onboarding` (migracja `20261026190000_onboarding.sql`, Dexie v10). Jeden wiersz na konto z `id = 'v1'` (wersja
kwestionariusza) i kluczem `(user_id, id)`, więc jest w `USER_SCOPED_ID_TABLES`. Kolumny:
- `status` – `draft` / `done` / `legacy`;
- `step`, `draft` – szkic i krok, zapisywane po każdym „Dalej”, więc wznowienie działa też na innym urządzeniu;
- `data` – profil po `finalize`;
- `consent_health_at`, `consent_version` – zgoda w osobnych kolumnach, do sprawdzenia bez czytania JSON-a;
- `completed_at`.

CHECK: `done` wymaga obiektu `data` i zgody. LWW przez `lww_guard`, RLS „all own”.

- **Istniejące konta** dostają w migracji wiersz `legacy` (wszyscy z `auth.users`), więc nie są zmuszane do onboardingu.
  Wejście zostaje w Ja → „Ty i Twój cel” → „Uzupełnij swoje potrzeby”, z progami już wypełnionymi z profilu.
- **Kiedy pokazać sam** (`useOnboardingDue`): zalogowane konto, brak wiersza, szkic (`draft`) albo usunięte odpowiedzi.
  Warunek dodatkowy: tabela przeszła pełne pobranie. `runSync` zapisuje w kv `synced_tables` listę tabel po udanej
  synchronizacji. Bez tego istniejące konto na nowym telefonie zobaczyłoby kwestionariusz, zanim dojdzie jego wiersz
  `legacy` (`last_sync` sprzed dodania tabeli tego nie gwarantuje). „Później” → `sessionStorage` `trening:onboarding-later`.
- **Poprawki** skończonego onboardingu (wejście z Ja) zaczynają się od podsumowania. Szkic nie jest zapisywany w trakcie,
  zmiany idą do bazy dopiero po „Zapisz zmiany”.
- **Wycofanie zgody**: podsumowanie → „Usuń moje odpowiedzi i wycofaj zgodę” robi soft delete wiersza (`deleted_at`).
- **Profil**: wzrost i data urodzenia trafiają też do `profiles` (`settingsApi.update`, tylko gdy się zmieniły), bo budżet
  kcal Dietetyka czyta je z profilu. Reszta danych zostaje w `onboarding.data`. Onboarding nie zmienia FTP, LTHR ani
  `power_meter` w profilu – to zadanie kalibracji (etap 4).

## 4. Ilustracje

Dziewięć renderów 3D w stylu `public/m/art/`. Nazwy: `ob-time`, `ob-form`, `ob-measure`, `ob-gear`, `ob-consent`,
`ob-body`, `ob-health`, `ob-goal`, `ob-done`. Każdy ma 256 px i 26–52 KB, razem ok. 330 KB w precache. Generuje je
`scripts/fal-art.mjs` (`nano-banana-pro` → `birefnet/v2`), wpisy w `ASSETS`. Powitanie i podsumowanie używają
`coach-wave` i `coach`. Tylko jasny motyw.

## 5. Testy

- Vitest: `src/engine/__tests__/onboarding.test.ts` (25 testów, pokrycie modułu ~99 %), `src/day/__tests__/onboarding.test.ts`.
- E2E `e2e/onboarding.spec.ts` (viewport iPhone 390×844):
  - cały przepływ: czerwona flaga i jej cofnięcie, poprawka z podsumowania, zapis w IndexedDB (kształt profilu), wejście z Ja;
  - wznawianie: wstecz zachowuje odpowiedzi, „Później”, „Dokończ: krok 2 z 10”.
  - Zrzuty: `test-results/onboarding-*.png`.

## 6. Na później

- **„Opowiedz o sobie”** (docs/30, etap 1): miejsce na ekranie powitania, nad listą kroków – pole „jednym zdaniem” i Edge
  Function na wzór `checkin-parse`, która zwraca `Draft` (ten sam schemat, `stepValid` sprawdza wynik). Po rozpoznaniu
  onboarding startuje od podsumowania z wypełnionymi polami i „do uzupełnienia” przy brakach. Model tylko wypełnia pola,
  liczb nie wymyśla.
- Generator planów: wejście to `planInputs`; po jego powstaniu „Gotowe!” pokaże pierwszy tydzień (etap 3) i przykład bez
  konta (etap 0).
- Drugi cel (poboczny), GPX trasy wydarzenia, ocena realności celu w liczbach (dziś tylko `checks`).
- Wycofanie zgody nie czyści wzrostu i daty urodzenia z profilu (to nie są dane o zdrowiu, ale do decyzji z prawnikiem).
- Adres e-mail do przysyłania plików jazd (odłożone przez użytkownika).
