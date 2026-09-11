# 10 · Strava – import jazd (Etap 3)

## Jak to działa
1. **Połączenie** (Ustawienia → Integracje → „Połącz ze Stravą”): aplikacja prosi Edge Function `strava-oauth` o adres autoryzacji (stan podpisany HMAC, ważny 10 min), Strava wraca na `…/functions/v1/strava-oauth/callback`, funkcja wymienia kod na tokeny, szyfruje je (AES-GCM, klucz z service role) i zapisuje w `integration_tokens`. Klient nigdy nie widzi tokenów. Po połączeniu funkcja rejestruje **webhook** (jedna subskrypcja na aplikację Strava).
2. **Webhook** `strava-webhook/<sekret>`: adres funkcji jest publiczny, a Strava nie podpisuje zdarzeń, więc w zarejestrowanym `callback_url` jest sekret w ścieżce (wyprowadzony z service role key; znają go tylko Strava i funkcja). Żądania bez niego dostają 404. Dodatkowo zdarzenia niszczące są potwierdzane w API Stravy: `activity delete` tylko gdy `GET /activities/{id}` zwróci 404, a `athlete authorized:false` tylko gdy token faktycznie przestał działać. Strava wysyła `activity: create/update/delete`; funkcja pobiera aktywność (+ strumień tętna) i zapisuje do `strava_activities` (histogram tętna: sekundy per bpm). Trigger w bazie sumuje wszystkie jazdy dnia do jednego `session_logs` (kind `bike`, status `done`, czas, dystans, przewyższenie, śr./maks. tętno, kadencja, prędkość). Ręczne oznaczenia użytkownika (`modified`, `skipped`, notatki) nie są nadpisywane.
3. **Dopasowanie do planu**: po dacie lokalnej (`start_date_local`). Dzień z planowaną jazdą → dane wchodzą w kartę roweru; dzień bez jazdy → „Jazda dodatkowa”. Dwie jazdy w dniu gór/B2B sumują się. Przypisanie można zmienić: w karcie aktywności „Przenieś na inny dzień” (aktualizuje `date`, trigger przelicza oba dni).
4. **Czas w strefach** liczony po stronie klienta z histogramu i **aktualnego LTHR** (R11) – przelicza się sam po nowym teście.
5. **Ręczna synchronizacja** („Pobierz ostatnie 14 dni”) – na wypadek przegapionego webhooka; upsert po id, bez duplikatów. Limity Stravy: 100 zapytań / 15 min – import = 2 zapytania na jazdę.

## Konfiguracja (jednorazowo)
- Aplikacja API Stravy: https://www.strava.com/settings/api – Authorization Callback Domain = `kgllegvlnmchdvkkbitt.supabase.co`. Client ID 278635.
- Sekrety: `supabase secrets set STRAVA_CLIENT_ID=… STRAVA_CLIENT_SECRET=…` (zrobione 11.09.2026).
- Wdrożenie: `supabase db push` (migracja `20260911140000_strava.sql`), potem
  `supabase functions deploy strava-oauth --no-verify-jwt --use-api` i `supabase functions deploy strava-webhook --no-verify-jwt --use-api`
  (`--no-verify-jwt`, bo callback i webhook wywołuje Strava; akcje użytkownika sprawdzają JWT same).
- Opcjonalnie `supabase secrets set APP_URL=https://trening-inky.vercel.app` (domyślna wartość w kodzie).

## Bezpieczeństwo
- Tokeny szyfrowane AES-GCM, tabela `integration_tokens` bez polityk RLS dla klienta – czyta ją tylko service role w Edge Functions.
- Stan OAuth podpisany HMAC, ważny 10 min, zawiera `user_id`. Nie jest dowiązany do ciasteczka sesji: wymagałoby to ciasteczka na domenie funkcji ustawianego z zapytania cross-origin, a w tym wdrożeniu rejestracja nowych kont jest wyłączona i istnieje jedno konto, więc nie da się uzyskać podpisanego stanu dla cudzego `user_id`. Przy dodaniu drugiego użytkownika trzeba dołożyć wiązanie stanu z sesją.
- Jedno konto Stravy może być powiązane tylko z jednym użytkownikiem aplikacji (`athlete_taken`).
- Zmiana adresu webhooka: `sync` i „Sprawdź webhook” same przerejestrowują subskrypcję.

## Sprawdzenie (scenariusz 16)
Wgraj jazdę z Bolta na Stravę → w ciągu kilku minut na ekranie Dziś jazda ma status *wykonane* z czasem i tętnem. Jeśli nie: Ustawienia → Integracje → „Pobierz ostatnie 14 dni”, a logi funkcji: Dashboard → Edge Functions → strava-webhook → Logs.
