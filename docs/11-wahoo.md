# 11 · Wahoo – eksport treningów na Bolta (Etap 4)

## Jak to działa
1. **Połączenie** (Ustawienia → Integracje → „Połącz z Wahoo”): Edge Function `wahoo-oauth` wydaje adres autoryzacji ze stanem podpisanym HMAC (10 min), Wahoo wraca na `…/functions/v1/wahoo-oauth/callback`, funkcja wymienia kod na tokeny i zapisuje je zaszyfrowane w `integration_tokens`. Zakres: `user_read workouts_write plans_write offline_data`. Access token żyje 2 h, refresh token jest rotowany przy każdym odświeżeniu i trzymamy tylko jeden (limit 10 aktywnych tokenów od 01.01.2026).
2. **Format `plan.json`** wynika z oficjalnego dokumentu Wahoo (`https://cloud-api.wahooligan.com/docs/plan-json-format.pdf`). Dwie pułapki, na które trzeba uważać: blok powtórzeń liczy iteracje **po pierwszym przejściu** (cztery interwały to `exit_trigger_value: 3`), a blok z `exit_trigger_type: "repeat"` **nie może mieć własnych celów**. Dopuszczalne `intensity_type`: active, wu, tempo, lt, map, ac, nm, ftp, cd, recover, rest. Cele względne (`threshold_hr`, `ftp`) działają tylko wtedy, gdy odpowiednia wartość jest w nagłówku.
3. **Budowa `plan.json`** dzieje się w aplikacji, w silniku (`src/engine/wahoo.ts`), z tych samych danych co ekran Dziś. Kroki treningu stają się interwałami: czas w sekundach, `intensity_type` wprost (wu, active, tempo, lt, map, ac, recover, cd), cele tętna jako **ułamek LTHR** (`threshold_hr`), kadencja jako `rpm`, powtórzenia jako zagnieżdżone `exit_trigger_type: "repeat"`. Bez LTHR cele idą jako `rpe`. Jazdy parametryczne (Z2, długie) dostają czas z kalendarza, `LONG_TEMPO` zachowuje blok tempa w środku.
4. **Przesłanie pliku – dokumentacja Wahoo myli.** Opisuje `plan[file]` jako „Base64 encoded JSON file”, ale API parsuje plik wprost jako JSON. Base64 kończy się błędem `Plan validation error: Could not serialize plan for validation. unexpected character: 'eyJoZWFkZXIi…' at line 1 column 1`, a base64 w zwykłym polu formularza błędem `Invalid file`. Działa **tylko przesyłka multipart z surowym JSON-em**, i taka jest pierwsza w kolejności. Pozostałe dwa warianty zostają jako zapas na wypadek zmiany po stronie Wahoo.
5. **Powiązanie planu z treningiem** idzie przez `workout[plan_id]`. Pole `plan_ids` w odpowiedzi to lista alternatywnych planów i **pusta tablica jest stanem normalnym** – przykładowa odpowiedź w dokumentacji Wahoo wygląda tak samo. Weryfikacja po zapisie sprawdza więc `plan_id`, nie `plan_ids`. Dla pewności wysyłamy oba parametry.
6. **Gdy licznik pokazuje „Select workout plan”** mimo ustawionego `plan_id`, najpierw zsynchronizuj zegarek i odśwież aplikację ELEMNT – dane treningu bywają w niej nieaktualne przez kilka minut po wysyłce.
7. **Wysyłka** (`wahoo-push`): dla każdego dnia `POST /v1/plans` + `POST /v1/workouts` (start 6:00 czasu warszawskiego, `workout_type_id` 0 dla jazdy na zewnątrz, 61 dla Wattbike'a). Ponowna wysyłka tego samego dnia robi `PUT` istniejącego planu i treningu zamiast duplikatu – klucz to `wahoo_pushes(user_id, date)`, a `external_id` ma postać `data:trening:wersja_programu`.
8. **Tryb automatyczny**: raz dziennie, po uruchomieniu aplikacji, wysyłane jest **dziś + 6 dni**. Przełącznik w Ustawieniach. Ręcznie: „Wyślij 7 dni” albo przycisk **„Wyślij na Wahoo”** przy konkretnym dniu.
9. Na Bolcie treningi są w **Planned Workouts** po synchronizacji zegarka (Wi-Fi albo aplikacja ELEMNT).

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

## ELEMNT nie obsługuje celów tętna w planach
To najważniejsze ograniczenie całej integracji i wynika wprost z dokumentacji formatu: przy polach `threshold_hr`, `max_hr` i `threshold_speed` stoi przypis „Currently **not** supported on ELEMNT Bike Computers or RIVAL”. Potwierdzone na urządzeniu: plik planu po konwersji (`/data/data/com.wahoofitness.bolt/files/plans/FID<id aplikacji>/<plan>_WKT<trening>.plan`) zawiera nazwy interwałów, czasy i kadencję (`CAD_LO`, `CAD_HI`), ale **żadnego celu tętna**. Licznik po prostu je pomija.

Ponieważ plan jest w całości oparty na tętnie (brak miernika mocy), obejście wygląda tak: **zakres bpm wchodzi na początek nazwy interwału**, np. `152-160 · TEST 30 min…`. Nazwa jest widoczna na ekranie w trakcie jazdy, a umieszczenie liczb na początku sprawia, że przetrwają obcięcie na wąskim ekranie. Opis planu uprzedza, gdzie szukać celów. Cele `threshold_hr` zostają w pliku – nic nie kosztują, a zadziałają, jeśli Wahoo kiedyś doda ich obsługę.

Kadencja działa, więc bloki kadencyjne (Z2_CADENCE) prowadzą się na liczniku normalnie.

## Podgląd na urządzeniu (adb)
Bolt to Android, więc przez USB można sprawdzić, co naprawdę dotarło:
```bash
adb devices                       # po podłączeniu zatwierdź autoryzację na ekranie licznika
adb shell 'ls /data/data/com.wahoofitness.bolt/files/plans/FID3830/'
adb shell 'cat /data/data/com.wahoofitness.bolt/files/plans/FID3830/<plik>.plan'
```
`FID3830` to identyfikator naszej aplikacji w Wahoo (pole `fitness_app_id` w odpowiedzi treningu). Po sprawdzeniu warto wyłączyć debugowanie USB na liczniku.

## Zakresy uprawnień
`user_read workouts_read workouts_write plans_read plans_write offline_data`. Odczyt (`*_read`) jest potrzebny, żeby po zapisie sprawdzić, co Wahoo naprawdę przechowuje. Po rozszerzeniu listy trzeba połączyć konto ponownie – sekcja Integracje pokazuje wtedy brakujące uprawnienia i przycisk „Połącz ponownie”.

## Duplikaty na liczniku
Bolt nazywa lokalne pliki planów `<plan>_WKT<trening>.plan`. Jeśli w Wahoo zostanie trening, o którym nasza baza nie wie (tak dzieje się, gdy wysyłka nie zdąży zapisać identyfikatora), licznik pokaże **dwa wpisy na ten sam dzień**. Przycisk **„Usuń duplikaty”** pobiera listę treningów z Wahoo, wybiera te oznaczone naszym `workout_token` (format `data:trening:wersja`), których nie ma w bazie, i kasuje je. Po tym trzeba zsynchronizować Bolta.

Druga rzecz warta zapamiętania: **zwykła wysyłka nie odświeża pliku na liczniku**, bo identyfikatory planu i treningu zostają te same, a Bolt uznaje, że ma aktualną wersję. Gdy zmieni się treść planu (np. po nowym teście progowym), trzeba użyć „Wyślij od zera”, które tworzy nowy trening i wymusza pobranie.

## Diagnostyka
Przycisk „Diagnostyka” w sekcji Integracje tworzy plan próbny każdym z trzech wariantów przesyłki (pod unikalnym `external_id`, bo Wahoo pilnuje ich niepowtarzalności), odczytuje każdy z powrotem, kasuje i pokazuje raport razem ze stanem istniejącego treningu. To najszybsza droga do ustalenia, czy problem leży w formacie pliku, w sposobie przesłania, czy w powiązaniu planu z treningiem.

## FTP w nagłówku: świadomie pomijane
Nagłówek planu przyjmuje `ftp`, ale go nie wysyłamy, dopóki plan nie ma celów mocy. Użytkownik nie ma miernika mocy, więc wszystkie cele są tętnem. Gdy `ftp` trafiło do nagłówka, aplikacja ELEMNT policzyła z niego obciążenie treningowe i pokazała dla testu progowego TSS 16 przy IF 0,41, czyli wartości oderwane od rzeczywistości (godzina z trzydziestoma minutami na progu to raczej TSS rzędu 70–80). Bez `ftp` Wahoo albo nie pokazuje tych wskaźników, albo liczy je z tętna. Gdy pojawi się miernik mocy, wystarczy ustawić `usePowerTargets` i dodać cele typu `ftp`.

## Sprawdzenie (scenariusz 17)
1. Ustawienia → Integracje → „Połącz z Wahoo”, zatwierdź dostęp.
2. Wejdź na dzień z akcentem (np. środa z `THR_4x6`) i kliknij **„Wyślij na Wahoo”**. Powinno pokazać „Wysłano na Bolta”.
3. Kliknij drugi raz – komunikat zmieni się na „Zaktualizowano trening na Bolcie” (bez duplikatu).
4. W aplikacji ELEMNT albo na Bolcie sprawdź Planned Workouts: nazwa treningu, długość i cele tętna w interwałach.

## Rozwiązywanie problemów
- **`invalid scope`** – w portalu Wahoo aplikacja musi mieć zgodę na `plans_write` i `workouts_write`; przy braku `user_read` API zwraca 403.
- **`redirect_uri_mismatch`** – adres zwrotny w portalu musi być znakowo identyczny z tym z sekcji Integracje.
- **`plan POST 422: Invalid file`** – Wahoo odrzuciło strukturę albo sposób przesłania pliku. Komunikat w aplikacji podaje wariant przesyłki; przy powtórzeniu błędu sprawdź nagłówek planu (wymagane `name`, `version`, `workout_type_family`, `workout_type_location`) i to, czy bloki powtórzeń nie mają własnych celów.
- **Trening nie pojawia się na Bolcie** – zegarek synchronizuje się po Wi-Fi albo przez aplikację ELEMNT; sprawdź, czy dzień nie jest w przeszłości.
- **Limity Wahoo (sandbox)**: 25 zapytań / 5 min, 100 / h, 250 / dzień – potwierdzone w portalu. Budżet trzeba traktować poważnie, bo przy debugowaniu wyczerpuje się w kilkanaście minut.
  - Wysyłka dnia kosztuje **2 zapytania** (plan + trening), cały tydzień około 13 z jedną weryfikacją powiązania. Tryb „od zera” dokłada po jednym skasowaniu treningu na dzień.
  - Przy `429` funkcja czeka (respektując `Retry-After`) i ponawia dwa razy, a po wyczerpaniu prób **przerywa całą wysyłkę** zamiast dobijać się kolejnymi dniami. Komunikat mówi wprost o limicie.
  - Automatyczna wysyłka oznacza dzień jako wykonany **niezależnie od wyniku**. Inaczej każde uruchomienie aplikacji ponawiałoby nieudaną wysyłkę i zjadało budżet. Powtórkę uruchamia się ręcznie.
  - Diagnostyka kosztuje do 9 zapytań (trzy warianty razy utworzenie, odczyt i skasowanie) – używać oszczędnie.
