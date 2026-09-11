# 09 · Supabase – założenie projektu i konfiguracja (Etap 2)

Aplikacja działa w pełni lokalnie bez Supabase. Supabase dodaje: logowanie jednym e-mailem (magic link), synchronizację między iPhonem a komputerem oraz backend dla integracji Strava/Wahoo (Etapy 3–4). Darmowy plan w zupełności wystarcza (500 MB bazy, projekt usypiany dopiero po 7 dniach bez ruchu).

## 1. Projekt w chmurze (5 min, w przeglądarce)
1. https://supabase.com/dashboard → **New project**. Nazwa: `trening`, region: **Frankfurt (eu-central-1)**, hasło do bazy zapisz w menedżerze haseł (będzie potrzebne do `supabase link`).
2. Po utworzeniu: **Project Settings → General** – zapisz **Reference ID** (np. `abcdefghijklmnop`).
3. **Project Settings → API Keys** – skopiuj **Project URL** i klucz **publishable** (`sb_publishable_…`). Klucza `secret` / `service_role` nigdzie nie wpisuj.

## 2. Migracja schematu (terminal)
```bash
cd ~/code/trening
supabase login
supabase link --project-ref <REFERENCE_ID>
supabase db push
```
`db push` wykona `supabase/migrations/20260911103853_init.sql`: tabele, RLS, trigger blokujący obce e-maile, mechanizm „ostatni zapis wygrywa”. Sprawdź w **Table Editor**, że są tabele `profiles`, `checkins`, `session_logs`, `set_logs`, `test_results` itd.

## 3. Dozwolony e-mail (SQL Editor w dashboardzie)
Jednorazowo, w **SQL Editor** (adres nie jest w repozytorium celowo):
```sql
insert into private.allowed_emails (email) values ('elcukro@gmail.com');
```
Trigger `check_allowed_email` odrzuci każdą inną rejestrację. Dodatkowo, dla pewności: **Authentication → Sign In / Providers → Email**: zostaw włączone, a w **Authentication → Settings** ustaw **Allow new users to sign up = OFF** *dopiero po pierwszym zalogowaniu* (pierwsze logowanie tworzy konto).

## 4. Adresy przekierowań (Authentication → URL Configuration) – zrobione 11.09.2026 przez `supabase config push`
- **Site URL**: adres z Vercel, np. `https://trening-inky.vercel.app`
- **Redirect URLs**: `https://trening-inky.vercel.app/**`, `http://localhost:5173/**`, `http://localhost:4173/**`

Magic link wraca na `/wiecej/ustawienia`. **Uwaga iOS:** aplikacja na ekranie początkowym ma osobną pamięć niż Safari, więc link kliknięty w Mailu zaloguje Safari, a nie PWA. W PWA: przytrzymaj link w Mailu → Kopiuj → Ustawienia → Konto → „Mam link z maila – wklej go tutaj”. Link działa tylko raz.

## 4a. Własne SMTP (Resend) → logowanie kodem zamiast linkiem
Darmowy plan Supabase z domyślną pocztą nie pozwala zmienić szablonu maila, a domyślny mail zawiera tylko jednorazowy link, którego podgląd w Gmailu na iOS zużywa. Rozwiązanie: darmowe SMTP z Resend (3000 maili/mies.; nadawca `onboarding@resend.dev` może wysyłać tylko na adres właściciela konta Resend – czyli dokładnie na Twój).
1. https://resend.com → **Sign up** (zaloguj się Google kontem elcukro@gmail.com) → **API Keys → Create API Key** (Sending access) → skopiuj klucz.
2. Supabase Dashboard → **Authentication → Emails → SMTP Settings** → **Enable Custom SMTP**: Sender email `onboarding@resend.dev`, Sender name `Trening`, Host `smtp.resend.com`, Port `465`, Username `resend`, Password = klucz API. **Save**.
3. Wypchnij szablon z kodem (`supabase/templates/magic_link.html`): minimalny config z sekcją `[auth]` + `[auth.email.template.magic_link]`, `supabase config diff`, potem `supabase config push`.
4. W aplikacji: Konto → e-mail → „Wyślij” → wpisz 8-cyfrowy kod z maila → „Zaloguj kodem”. Działa w PWA, Safari i na komputerze.

## 5. Zmienne środowiskowe
Lokalnie – plik `.env.local` (jest w `.gitignore`):
```
VITE_SUPABASE_URL=https://<REFERENCE_ID>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
Vercel – **Settings → Environment Variables**: te same dwie zmienne (Production + Preview), potem **Redeploy**.

## 6. Pierwsze logowanie i test synchronizacji – zrobione 11.09.2026 (sesja + profil w bazie); rejestracja nowych użytkowników wyłączona przez `config push` (`enable_signup = false`)
1. Aplikacja → **Więcej → Ustawienia → Konto**: wpisz e-mail, „Wyślij link logowania”, otwórz link z maila.
2. Stan powinien pokazać „Zsynchronizowano”. Dotychczasowe dane lokalne (ustawienia, check-iny, logi) wypchną się automatycznie – identyfikatory UUID są generowane na telefonie, więc nie ma duplikatów.
3. Scenariusz 15 ze specyfikacji: tryb samolotowy → zapisz kilka serii w trybie siłowni → wyłącz tryb samolotowy → w **Table Editor → set_logs** pojawią się wiersze, po jednym na serię. Ponowna synchronizacja nic nie dubluje (upsert po `id`).

## 7. Sekrety integracji (Etapy 3–4 – jeszcze nie teraz)
Klucze Strava i Wahoo trafią wyłącznie do sekretów Edge Functions:
```bash
supabase secrets set WAHOO_CLIENT_ID=… WAHOO_CLIENT_SECRET=… STRAVA_CLIENT_ID=… STRAVA_CLIENT_SECRET=…
```
Wartości Wahoo są w `~/code/wahoo-routes/.env` (`WAHOO_CLIENT_ID`, `WAHOO_CLIENT_SECRET`) – przepisz je ręcznie, nie kopiuj pliku do repozytorium.

## 8. Rozwiązywanie problemów
- **„Ten adres e-mail nie ma dostępu”** – brak wpisu w `private.allowed_emails` (małe litery!).
- **Link z maila otwiera Safari zamiast PWA** – normalne na iOS, ale sesja NIE jest wspólna. Wyślij nowy link i wklej go w PWA (sekcja Konto), nie klikaj go.
- **Zalogowałem się, ale po powrocie nadal widzę formularz** – link został otwarty w innej przeglądarce niż ta, z której wysłałeś prośbę, albo wygasł (ważny 1 h, jednorazowy). Wyślij nowy i użyj wklejania.
- **Stan „Błąd” w Ustawieniach** – komunikat pod spodem podaje tabelę i przyczynę (najczęściej brak migracji lub RLS). Logi: Dashboard → Logs → Postgres / Auth.
- **Projekt uśpiony po urlopie** – Dashboard → Restore project; dane zostają.
