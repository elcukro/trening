# 25 · Dietetyk (beta) – zdjęcie posiłku → danie, kalorie, białko

Projekt z 26.10.2026. Cel: zamknąć pętlę odchudzania. Plan liczy deficyt dnia (`docs/13` § 29.09.2026), ale nikt nie liczy
spożycia; zawodnik zgłasza ad hoc („deficyt 800–900 kcal”, „40 g węgli to 160 kcal?”). Dietetyk ma zajmować **jedno dotknięcie
i jedno zdjęcie**, nie formularz.

## 1. Co dziś jest w aplikacji (wynik przeglądu kodu)

- **UI `/m`**: żywienie to jeden wiersz na Dziś (`TodayScreen.tsx:104`: `label` + `protein_g`) i zdanie w dzień wolny (l.268).
  Chipy trenera (`src/day/coachChips.ts`) nie mają nic o jedzeniu. W całej aplikacji nie ma pola `input type=file` dla zdjęć.
- **Silnik** (`src/engine/nutrition.ts`): `nutritionForDay` → `Nutrition {energy, label, protein_g_per_kg, on_bike_carbs_g_per_h,
  post_workout}`. **Nie ma bezwzględnego budżetu kcal** – deficyt liczbowy żyje tylko w tekście `label` (`personalizeNutrition`,
  l.124). Brak TDEE/BMR, brak wzrostu i wieku w ustawieniach.
- **Dane**: Dexie v8, nowa tabela = interfejs `extends SyncedRow` + `version(9)` + `SYNC_TABLES`; wzór zapisu `upsertCheckin`
  (`repo.ts:23`); wzór migracji `20260925120000_bikes.sql` (RLS „all own”, `lww_guard`).
- **Czat trenera**: narzędzia w `src/day/coachTools.ts` (klient wykonuje) i `TOOLS` w `_shared/coach_chat.ts`; kontekst
  (`coachContext.ts`) nie zawiera żywienia; bloki `image` są odrzucane w `sanitizeMessages`.
- **Edge Functions**: wzór `checkin-parse` (JWT, `underLimit`, `underUserDailyLimit`, rezerwacja w `ai_calls`); `callClaude`
  przyjmuje tylko tekst. Żadna funkcja nie przyjmuje obrazów.
- **Maile/list tygodnia**: liczą wyłącznie plan, nic ze spożycia.

## 2. Zasady projektu

1. **Zdjęcie jest dla modelu, nie dla bazy.** Zdjęć nie przechowujemy (prywatność, rozmiar, offline). Zapisujemy wynik: nazwę,
   składniki, kcal, makro, pewność. Zdjęcie zmniejszamy na telefonie do ≤ 1024 px / ~150 kB JPEG i wysyłamy raz.
2. **Model szacuje, zawodnik potwierdza.** Podgląd przed zapisem z dwoma szybkimi korektami: porcja (−25 % / +25 % / ×2) i nazwa.
   Pewność < 0,5 → model zadaje jedno pytanie („jaki rozmiar talerza?”, „z olejem?”) zamiast zgadywać.
3. **Kod liczy budżet, model tylko rozpoznaje.** Jak w notatkach: liczby dnia (budżet, zjedzone, zostało, białko) liczy czysty TS.
4. **Dwa konta, zero wycieków.** Funkcja włączana ustawieniem profilu `diet_enabled` (jak `gym_enabled`), domyślnie wyłączona;
   cele (białko, deficyt) z programu konta.
5. **Bez wagi kuchennej.** Dokładność ±20 % na posiłek wystarczy – liczy się trend tygodnia zestawiony z masą.

## 3. Jak to wygląda dla zawodnika

### Dziś (`/m`)
Wiersz „Żywienie” staje się **kartą „Jedzenie”**:
```
Jedzenie                                  deficyt ok. 350 kcal
[████████░░░░]  1 240 z ~2 300 kcal · zostało ~1 060
białko 95 / 180 g
śniadanie 08:10 · owsianka z bananem · 520 kcal
obiad 13:40 · kurczak z ryżem · 720 kcal
[ 📷 Dodaj posiłek ]      [ napisz trenerowi ]
```
- Pasek liczy się z budżetu dnia (§ 4). Gdy brak wzrostu/wieku w profilu: tylko „zjedzone 1 240 kcal · białko 95 / 180 g”
  i link „Uzupełnij wzrost i rok urodzenia, żeby zobaczyć budżet dnia”.
- Dotknięcie posiłku → arkusz z pozycjami, korekta porcji, usunięcie.
- Dzień ciężki/test: nagłówek „bez deficytu – paliwo przed i po treningu”, budżet bez odejmowania.

### Arkusz „Posiłek” (jedno zdjęcie, dwa dotknięcia)
1. Przycisk „Dodaj posiłek” otwiera od razu aparat (`<input type="file" accept="image/*" capture="environment">`); drugi
   przycisk „Z galerii”. Opcjonalnie jedna linia tekstu („duża porcja”, „bez sosu”).
2. Po 3–6 s podgląd: nazwa dania, lista składników z gramami i kcal, suma kcal/białko/węgle/tłuszcz, pewność (kropki).
   Przyciski porcji: „mniej” (×0,75) / „więcej” (×1,25) / „podwójna”. Nazwa edytowalna.
3. „Zapisz” → wpis w `meals`, karta na Dziś odświeża się, toast „Zapisane: 720 kcal · białko 42 g” z „Cofnij”.

### Produkt z etykietą (żelki, napój, baton)
Przy produktach z opakowania kalorie są wydrukowane – model ich nie szacuje, tylko **przepisuje z etykiety**.
1. Ten sam przycisk aparatu; zdjęcie tabeli wartości odżywczych (opcjonalnie drugie: przód opakowania, dla nazwy).
   Arkusz przyjmuje 1–2 zdjęcia w jednym wywołaniu.
2. Model rozpoznaje, że to etykieta (`kind: 'label'`), i zwraca wartości **na 100 g / 100 ml** (oraz na porcję, jeśli jest),
   masę opakowania i wielkość porcji z etykiety. Nic nie zgaduje: pole nieczytelne = `null`.
3. Podgląd pyta tylko o ilość: „Całe opakowanie (200 g)”, „Połowa”, „Porcja z etykiety (25 g)” albo pole „g / ml”.
   Kcal i makro **liczy kod** (`wartość_na_100 × ilość / 100`), nie model.
4. Etykieta nieczytelna albo brak kcal → „Nie widzę tabeli kalorii – zrób zdjęcie bliżej” zamiast szacunku.
5. Beta 2: zapisany produkt trafia do „Ostatnie produkty” (tabela `products` per konto) – drugi raz bez zdjęcia, jednym dotknięciem.

### Trener (czat)
- Nowy chip w fazach `after`/`evening`: **„Zjadłem…”** – tekst bez zdjęcia („zjadłem 2 jajka, 2 kromki, masło”) → narzędzie
  `log_meal` (model sam szacuje kcal i białko ze słów; źródło `text`).
- Kontekst dostaje `nutrition_today: {budget, eaten, left, protein_target, protein_eaten, meals[]}`; trener może odpowiedzieć
  „masz jeszcze 1 060 kcal i 85 g białka do wieczora – kolacja białkowa”.
- Zdjęcia w czacie: faza 2 (wymaga bloków `image` w `coach_chat.ts`).

### Ja (`/m`)
- Kafelek „Jedzenie – 7 dni”: średnie kcal/dzień vs budżet, białko/dzień, bilans tygodnia vs zmiana masy (patrz § 4.3).

## 4. Dane i obliczenia

### 4.1 Tabela `meals` (synchronizowana, per konto)
```
id uuid pk, user_id, date, time (HH:MM), name text, kcal int, protein_g int, carbs_g int, fat_g int,
items jsonb [{name, grams, kcal, protein_g}], source text ('photo'|'label'|'text'|'manual'), confidence numeric,
portion_factor numeric default 1, note text,
label jsonb null {per_100:{kcal,protein_g,carbs_g,fat_g}, unit:'g'|'ml', package, serving}, amount numeric null (g/ml zjedzone), deleted_at, created_at, updated_at, server_updated_at
```
Dexie `version(9).stores({ meals: 'id, date, updated_at' })`, `SYNC_TABLES` + `meals`, repo `addMeal/updateMeal/deleteMeal`
przez `putSynced`/`softDelete`. Migracja wg wzoru `bikes.sql` (RLS „all own”, `lww_guard`, `revoke anon`).

### 4.2 Budżet dnia – `src/engine/intake.ts` (czysty TS, testy)
```
bmr = 10·masa + 6,25·wzrost − 5·wiek + 5           (Mifflin-St Jeor, mężczyzna)
tdee_bez_roweru = bmr × 1,35                           (praca siedząca, spacery)  → kalibrowane, § 4.3
energia_jazdy = kJ z miernika (≈ kcal) albo plan: minuty × IF² × FTP × 3,6/1000 … (gdy brak jazdy jeszcze)
budżet = tdee_bez_roweru + energia_jazdy − deficit_kcal_dnia
```
- `deficit_kcal` trzeba wystawić z `personalizeNutrition` jako liczbę (dziś tylko w `label`); dni `no_deficit` → 0.
- Nowe pola profilu: `height_cm`, `birth_year` (kolumny `profiles` + `PROFILE_MAP` + Ustawienia → Profil i arkusz „Progi” w `/m`).
- Białko: cel już jest (`protein_g` z masy docelowej); zjedzone = suma `meals.protein_g`.

### 4.3 Kalibracja (po 3 tygodniach danych)
Bilans tygodnia = Σ(budżet − zjedzone); oczekiwana zmiana masy = bilans / 7700. Porównanie z trendem masy z check-inów
(średnia 7-dniowa) daje poprawkę mnożnika 1,35 (ogranicz 1,2–1,6). Pokazane w Ja: „Twój organizm spala ok. 2 450 kcal/dzień
bez roweru (liczone z 3 tygodni)”. To jedyna rzecz, która robi z szacunków ±20 % użyteczne narzędzie.

### 4.4 Edge Function `meal-parse`
- `POST {images_b64?: [1–2], text?, note?, hint:{protein_target}}` + JWT; limity jak `checkin-parse` (30/dzień/konto).
- Model przez OpenRouter (klucz `OPENROUTER_API_KEY`), nazwa modelu w sekrecie `MEAL_MODEL` – domyślnie
  `google/gemini-3.8-flash`, zapas `anthropic/claude-sonnet-5.5` (wynik próby w § 6). Zmiana modelu = zmiana sekretu, bez wdrożenia.
- Odpowiedź JSON: `{kind:'dish'|'label', name, items[], total:{kcal,protein_g,carbs_g,fat_g}, confidence, question?,
  label?:{unit, per_100:{…}, per_serving?, package?, serving?}}`; walidacja w czystym `_shared/meal_parse.ts` (danie: kcal
  20–3000, białko ≤ kcal/4, suma składników ≈ total ±15 %; etykieta: kcal/100 ≤ 900, 4·B + 4·W + 9·T ≈ kcal ±15 %), testy Vitest.
  Odpowiedź w trybie JSON; zepsuty JSON → jedna ponowna próba.
- Czas odpowiedzi Gemini 3.8 Flash ~10 s – arkusz pokazuje wyraźny stan „Analizuję zdjęcie…”.
- Prompt: polskie nazwy dań, porcje „domowe” (talerz, kromka, łyżka), zawsze podaj gramy, nie zgaduj przy pewności < 0,5 – zadaj
  jedno pytanie.

### 4.5 Trener
- `coachContext.ts`: `nutrition_today` (z `intake.ts` + `meals` dnia).
- `coachTools.ts`: `log_meal {name, kcal, protein_g, carbs_g?, fat_g?, time?}` → `addMeal(source:'text')`; `TOOLS` w
  `coach_chat.ts` + zdanie w `COACH_SYSTEM`: „kcal z opisu szacuj po polskich porcjach domowych; przy wątpliwości dopytaj o porcję”.

### 4.6 Maile i list tygodnia (faza 2)
- „Dzień w liczbach” 21:00: wiersz „Jedzenie: 2 140 kcal (budżet 2 300) · białko 165 g”.
- List tygodnia: `WeekFacts.intake {avg_kcal, avg_protein, days_logged, balance_kcal, expected_kg, actual_kg}` – trener komentuje
  tylko, gdy `days_logged ≥ 4`.

## 5. Fazy

| Faza | Zakres | Czas |
|---|---|---|
| **Beta 1** | migracja `meals` + Dexie + repo; `intake.ts` z testami; `height_cm`/`birth_year`; `meal-parse` (OpenRouter) + `_shared/meal_parse.ts`; karta Jedzenie na Dziś; arkusz Posiłek (aparat, podgląd, porcja, zapis; etykieta produktu → ilość g/ml); `diet_enabled` | 2 dni |
| **Beta 2** | „Ostatnie produkty” (`products`); `log_meal` + chip „Zjadłem…” + `nutrition_today` w kontekście trenera; „Dzień w liczbach”; kafelek Ja 7 dni | 1 dzień |
| **Beta 3** | kalibracja TDEE z masy; list tygodnia; zdjęcia w czacie; wybór dostawcy Anthropic | 1 dzień |

## 6. Próba modeli (26.10.2026)
Pięć modeli przez OpenRouter, ten sam prompt, temperatura 0. Dwa zestawy: **Nutrition5k** (Google, 14 dań ze stołówki, każdy
składnik zważony – twarda prawda) i **13 polskich posiłków** z diety.nfz.gov.pl i ncez.pzh.gov.pl (kcal na porcję z przepisu,
zdjęcia często poglądowe – prawda przybliżona). Błąd = średni bezwzględny błąd kcal.

| Model | Nutrition5k: błąd / skrzywienie | Polskie: błąd / skrzywienie | ≤ 20 % (oba) | Czas | Koszt/posiłek |
|---|---|---|---|---|---|
| **google/gemini-3.8-flash** | **21 % / +1 %** | **23 % / −4 %** | **17/27** | 10–11 s | 0,005 USD |
| anthropic/claude-sonnet-5.5 | 44 % / +33 % | 26 % / +6 % | 11/27 | 4 s | 0,004 USD |
| anthropic/claude-haiku-5.5 | 62 % / +53 % | 27 % / +14 % | 11/27 | 5–6 s | 0,0005 USD |
| openai/gpt-6.1-sol | 68 % / +67 % | 30 % / +25 % | 12/27 | 13–15 s | 0,006 USD |
| google/gemini-2.5-flash | 34 % / +28 % | 36 % / +22 % | 9/27 | 3–4 s | 0,0008 USD |

Wniosek: Gemini 3.8 Flash jako jedyny trzyma ~20 % bez systematycznego zawyżania w obu zestawach; pozostałe zawyżają kcal.
Ograniczenia: mała próba, brak klasyków (schabowy, pierogi), zdjęcia z góry albo poglądowe. Etykiet nie testowaliśmy – to
przepisywanie tekstu, sprawdzimy na pierwszych produktach. Skrypt i dane: scratchpad sesji (`mealbench/`), nie w repo.

## 7. Decyzje (26.10.2026)
1. **Wzrost i rok urodzenia** wchodzą do profilu (`height_cm`, `birth_year`).
2. **Budujemy od razu Beta 1**, bez tygodniowej próby. Model rozpoznawania (po próbie z § 6): `google/gemini-3.8-flash` przez
   OpenRouter (sekret `OPENROUTER_API_KEY` wgrany 26.10, model w sekrecie `MEAL_MODEL`), zapas `anthropic/claude-sonnet-5.5`. Inne klucze
   w `~/code` (fal.ai, Replicate – generowanie obrazów; stary klucz OpenAI w `clipblossom`) nie nadają się albo nie są potrzebne.
   Pierwsze 10 posiłków porównujemy ręcznie: jeśli Gemini myli się > 30 % na kcal, przełączamy sekretem na Claude bez wdrożenia.
4. **Produkty z etykietą** (26.10.2026): zdjęcie tabeli wartości odżywczych → model przepisuje wartości na 100 g/ml, ilość
   podaje zawodnik, kcal liczy kod (§ 3 „Produkt z etykietą”).
3. Miniatur zdjęć nie zapisujemy (prywatność); drugie konto dostaje funkcję przez przełącznik `diet_enabled`, domyślnie wyłączony.
