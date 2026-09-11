# 12 · Powiadomienia Web Push (Etap 5)

## Co przychodzi
- **Rano (7:00)** – plan dnia: co dziś na rowerze i na siłowni.
- **Wieczorem (20:00)** – przypomnienie o odhaczeniu treningu.

Obie wysyłki mają klucz `(użytkownik, rodzaj, data)` w tabeli `push_log`, więc nawet przy kilku uruchomieniach zadania powiadomienie wychodzi najwyżej raz dziennie.

## Jak to działa
1. **Service worker** (`src/sw.ts`, budowany strategią `injectManifest`) obsługuje zdarzenia `push` i `notificationclick`. Kliknięcie otwiera aplikację na wskazanym ekranie albo przenosi już otwarte okno.
2. **Subskrypcja**: przycisk w Ustawieniach prosi o zgodę, pobiera klucz publiczny VAPID z funkcji `push-send` i zapisuje subskrypcję w tabeli `push_subscriptions` (klucz główny to skrót endpointu, więc ponowne włączenie na tym samym urządzeniu nie tworzy duplikatu).
3. **Wysyłka**: Edge Function `push-send` podpisuje żądania kluczem VAPID i wysyła do dostawcy (Apple, Google). Subskrypcje, które zwrócą 404 albo 410, są oznaczane jako usunięte – to znak, że aplikacja została odinstalowana albo wyczyszczono dane.
4. **Harmonogram**: `pg_cron` odpala `private.send_push(rodzaj)`, a ta wywołuje funkcję przez `pg_net`. Uwierzytelnienie idzie własnym sekretem `push_cron_secret` z vaulta, nie kluczem usługowym.

## Zmiana czasu
`pg_cron` nie zna stref, więc zadania są ustawione na obie pory: 5:00 i 6:00 UTC rano oraz 18:00 i 19:00 UTC wieczorem. Latem trafia jedna, zimą druga, a blokada w `push_log` pilnuje, żeby nie wyszły dwa powiadomienia tego samego dnia.

## iPhone: warunek konieczny
Powiadomienia działają **wyłącznie w aplikacji dodanej do ekranu początkowego** (iOS 16.4 lub nowszy). W Safari, nawet na tej samej stronie, przycisk będzie nieaktywny i pokaże wyjaśnienie. Kolejność jest więc taka:
1. Otwórz aplikację w Safari.
2. Udostępnij → „Do ekranu początkowego”.
3. Uruchom z ikony, wejdź w Ustawienia → Powiadomienia → „Włącz powiadomienia”.
4. Zatwierdź zgodę w oknie systemowym.
5. Kliknij „Wyślij próbne” i sprawdź ekran blokady.

Jeśli raz odmówisz zgody, przeglądarka nie zapyta ponownie. Trzeba ją włączyć w ustawieniach systemu dla tej aplikacji.

## Sekrety i klucze
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` – para kluczy wygenerowana przy wdrożeniu, w sekretach Supabase. Klucz publiczny aplikacja pobiera z funkcji, więc nie ma go w zmiennych budowania.
- `PUSH_CRON_SECRET` – wspólny sekret zadania cyklicznego; ta sama wartość leży w vault pod nazwą `push_cron_secret`.
- Zmiana pary VAPID unieważnia wszystkie subskrypcje; po niej trzeba włączyć powiadomienia ponownie na każdym urządzeniu.

## Sprawdzenie
```sql
-- czy zadania są aktywne
select jobname, schedule, active from cron.job where jobname like 'trening%';
-- ręczne wywołanie
select private.send_push('morning');
-- odpowiedź funkcji
select status_code, content from net._http_response order by created desc limit 1;
```
