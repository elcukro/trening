# 11 · Wahoo – eksport treningów na Bolta (Etap 4)

## Jak to działa
1. **Połączenie** (Ustawienia → Integracje → „Połącz z Wahoo”): Edge Function `wahoo-oauth` wydaje adres autoryzacji ze stanem podpisanym HMAC (10 min), Wahoo wraca na `…/functions/v1/wahoo-oauth/callback`, funkcja wymienia kod na tokeny i zapisuje je zaszyfrowane w `integration_tokens`. Zakres: `user_read workouts_write plans_write offline_data`. Access token żyje 2 h, refresh token jest rotowany przy każdym odświeżeniu i trzymamy tylko jeden (limit 10 aktywnych tokenów od 01.01.2026).
2. **Budowa `plan.json`** dzieje się w aplikacji, w silniku (`src/engine/wahoo.ts`), z tych samych danych co ekran Dziś. Kroki treningu stają się interwałami: czas w sekundach, `intensity_type` wprost (wu, active, tempo, lt, map, ac, recover, cd), cele tętna jako **ułamek LTHR** (`threshold_hr`), kadencja jako `rpm`, powtórzenia jako zagnieżdżone `exit_trigger_type: "repeat"`. Bez LTHR cele idą jako `rpe`. Jazdy parametryczne (Z2, długie) dostają czas z kalendarza, `LONG_TEMPO` zachowuje blok tempa w środku.
3. **Wysyłka** (`wahoo-push`): dla każdego dnia `POST /v1/plans` + `POST /v1/workouts` (start 6:00 czasu warszawskiego, `workout_type_id` 0 dla jazdy na zewnątrz, 61 dla Wattbike'a). Ponowna wysyłka tego samego dnia robi `PUT` istniejącego planu i treningu zamiast duplikatu – klucz to `wahoo_pushes(user_id, date)`, a `external_id` ma postać `data:trening:wersja_programu`.
4. **Tryb automatyczny**: raz dziennie, po uruchomieniu aplikacji, wysyłane jest **dziś + 6 dni**. Przełącznik w Ustawieniach. Ręcznie: „Wyślij 7 dni” albo przycisk **„Wyślij na Wahoo”** przy konkretnym dniu.
5. Na Bolcie treningi są w **Planned Workouts** po synchronizacji zegarka (Wi-Fi albo aplikacja ELEMNT).

## Konfiguracja (jednorazowo)
1. Portal https://developers.wahooligan.com → Twoja aplikacja (ta z `~/code/wahoo-routes`) → dodaj **Redirect URI**:
   `https://kgllegvlnmchdvkkbitt.supabase.co/functions/v1/wahoo-oauth/callback`
   (dotychczasowy `http://localhost:5173/callback` zostaw, jeśli jest potrzebny w tamtym projekcie).
2. Sekrety, wartości przepisz z `~/code/wahoo-routes/.env` (nie kopiuj pliku do tego repozytorium):
   ```bash
   supabase secrets set WAHOO_CLIENT_ID=… WAHOO_CLIENT_SECRET=…
   ```
3. Funkcje są już wdrożone (`wahoo-oauth`, `wahoo-push`) i migracja `20260911160000_wahoo.sql` wgrana.

## Dlaczego bez crona
Specyfikacja przewidywała dzienny cron po stronie Supabase. Plan budowany jest jednak z `program.json` i silnika, a wstawienie ich do Edge Function oznaczałoby drugą kopię logiki planu w Deno i złamanie zasady „treść planu pochodzi z `data/`”. Zamiast tego wysyła aplikacja, raz dziennie przy starcie, zawsze na tydzień do przodu. Przy codziennym zaglądaniu do aplikacji efekt jest ten sam, a źródło prawdy zostaje jedno. Gdyby okazało się to za mało (dłuższa przerwa od aplikacji), wracamy do crona i portujemy silnik do Deno.

## Sprawdzenie (scenariusz 17)
1. Ustawienia → Integracje → „Połącz z Wahoo”, zatwierdź dostęp.
2. Wejdź na dzień z akcentem (np. środa z `THR_4x6`) i kliknij **„Wyślij na Wahoo”**. Powinno pokazać „Wysłano na Bolta”.
3. Kliknij drugi raz – komunikat zmieni się na „Zaktualizowano trening na Bolcie” (bez duplikatu).
4. W aplikacji ELEMNT albo na Bolcie sprawdź Planned Workouts: nazwa treningu, długość i cele tętna w interwałach.

## Rozwiązywanie problemów
- **`invalid scope`** – w portalu Wahoo aplikacja musi mieć zgodę na `plans_write` i `workouts_write`; przy braku `user_read` API zwraca 403.
- **`redirect_uri_mismatch`** – adres zwrotny w portalu musi być znakowo identyczny z tym z sekcji Integracje.
- **Trening nie pojawia się na Bolcie** – zegarek synchronizuje się po Wi-Fi albo przez aplikację ELEMNT; sprawdź, czy dzień nie jest w przeszłości.
- **Limity Wahoo (sandbox)**: 25 zapytań / 5 min, 100 / h, 250 / dzień. Wysyłka 7 dni to około 28 zapytań, dlatego między dniami jest krótka przerwa.
