# 28 · Logowanie przez Google i Stravę

Od 26.10.2026 ekran logowania (`/i`, `/m`, aplikacja iOS) i karta „Konto i synchronizacja” w pełnej aplikacji mają
dwa przyciski: **„Zaloguj się przez Google”** i **„Zaloguj się przez Stravę”**. Kod z maila zostaje jako zapas.
Przyciski pojawiają się same, gdy dostawca działa: Google – gdy jest włączony w Supabase (publiczne
`/auth/v1/settings`), Strava – gdy funkcja `strava-login` jest wdrożona (`/strava-login/ping`). Dopóki nie
skonfigurujesz Google i nie wdrożysz funkcji, ekran logowania wygląda jak dotąd.

## 1. Jak to działa

### Google (Supabase Auth)

- **Przeglądarka**: `signInWithOAuth({ provider: 'google', redirectTo: <ta sama strona> })` → Google → Supabase →
  powrót z sesją we fragmencie adresu (flow `implicit`, jak dotąd dla linków z maila; `detectSessionInUrl`).
- **Aplikacja iOS**: Google blokuje logowanie w WebView, więc strona Google otwiera się w systemowym oknie
  **ASWebAuthenticationSession** (własna wtyczka `native/trening-auth`, `src/native/webAuth.ts`). Okno samo łapie
  powrót na `trening://auth` – schematu nie trzeba rejestrować w `Info.plist`, a inna aplikacja nie przechwyci powrotu.
  Klient Supabase w aplikacji iOS używa **PKCE** (`src/sync/supabase.ts`): powrót niesie tylko kod, który bez
  weryfikatora zapisanego w aplikacji jest bezużyteczny (`exchangeCodeForSession`). Ciasteczka okna są wspólne z
  Safari – jeśli w Safari jesteś zalogowany w Google, wystarczy wybrać konto.
- **To samo konto co dotąd**: Supabase automatycznie łączy tożsamość Google z istniejącym użytkownikiem o tym samym
  (zweryfikowanym) adresie e-mail – po pierwszym logowaniu w Authentication → Users przy koncie są dwie tożsamości
  (`email`, `google`), dane i ustawienia te same.
- **Adres spoza listy**: rejestracja jest wyłączona (`enable_signup = false`), a trigger `check_allowed_email` i tak
  blokuje adresy spoza `private.allowed_emails`. Logowanie Google z obcego konta wraca z błędem
  (`Signups not allowed…` albo `Database error saving new user`), który aplikacja pokazuje jako „Ten adres e-mail nie
  ma dostępu do aplikacji” na ekranie logowania (`authErrorMessage` w `src/sync/authReturn.ts`) – nie pusty ekran.

### Strava (własna Edge Function `strava-login`)

Supabase nie ma dostawcy Strava, więc:

1. Aplikacja losuje weryfikator (32 bajty), liczy wyzwanie `SHA-256` (jak PKCE) i otwiera
   `…/functions/v1/strava-login/start?return=<adres powrotu>&challenge=<wyzwanie>` (przeglądarka: przekierowanie,
   weryfikator w `sessionStorage`; iOS: ASWebAuthenticationSession, weryfikator w pamięci).
2. Funkcja sprawdza adres powrotu z listą (`trening://auth`, `https://trening.felsztukier.pl`,
   `https://trening-inky.vercel.app`, `APP_URL`, opcjonalny sekret `LOGIN_RETURN_ORIGINS`, `http://localhost:*`) –
   bez tego byłaby otwartym przekierowaniem – i przekierowuje do Stravy ze stanem podpisanym HMAC (10 min).
3. `callback`: wymiana kodu → `athlete.id` → konto, które ma już połączoną Stravę (`integration_tokens`,
   `provider = 'strava'`). Brak konta → powrót z `#strava_error=not_linked` i komunikatem „Zaloguj się kodem z maila,
   a potem połącz Stravę w Ustawieniach → Integracje”. Jest konto → odświeżone tokeny Stravy zapisane (ten sam zakres
   co integracja, więc przy istniejącej zgodzie Strava nie pyta drugi raz) i powrót z **biletem** `#strava_ticket`
   (podpis HMAC: konto + wyzwanie, ważny 2 min).
4. Aplikacja wysyła bilet **z weryfikatorem** (`POST strava-login {action:'redeem'}`). Funkcja sprawdza podpis, termin
   i `SHA-256(weryfikator) = wyzwanie`, po czym `auth.admin.generateLink({ type: 'magiclink' })` – **bez wysyłki maila** –
   i zwraca jednorazowy `token_hash`. Aplikacja robi `verifyOtp({ token_hash, type: 'magiclink' })` i ma zwykłą sesję
   Supabase (z odświeżaniem).

Dlaczego tak: sesję wydaje sam Supabase Auth (nie podpisujemy własnych JWT i nie znamy sekretu JWT), a nic, co
przechodzi przez adres powrotu, nie wystarcza do zalogowania – bilet bez weryfikatora jest bezużyteczny, a weryfikator
nie opuszcza aplikacji przed wymianą. Parametry są we fragmencie adresu (nie trafiają do logów serwera ani `Referer`),
aplikacja usuwa je z adresu zaraz po odczytaniu. Stan logowania i bilet mają pole `p`, więc nie da się ich podać do
callbacku integracji (`strava-oauth` odrzuca podpisane dane z `p`) ani odwrotnie.

Kod: `supabase/functions/strava-login/index.ts`, czysta logika `supabase/functions/_shared/strava_login.ts`
(testy `src/engine/__tests__/strava_login.test.ts`), klient `src/sync/oauth.ts` i `src/sync/authReturn.ts`
(testy `src/sync/authReturn.test.ts`), przyciski `src/components/OAuthButtons.tsx`, e2e `e2e/login.spec.ts`
(odpowiedzi Supabase podstawione – bez prawdziwych kont).

## 2. Co musisz ustawić (krok po kroku)

### 2.1. Google Cloud – klient OAuth

1. https://console.cloud.google.com → wybierz albo utwórz projekt (np. „Trening”).
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience):
   - typ **External**, nazwa aplikacji „Trening”, e-mail wsparcia i kontaktowy – Twój;
   - **Authorized domains**: `supabase.co`, `felsztukier.pl`;
   - zakresy (Data access): tylko `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (nie wymagają
     weryfikacji Google);
   - **Audience**: zostaw „Testing” i dodaj **Test users**: `elcukro@gmail.com` (i adres brata, jeśli ma logować się
     przez Google). Albo „Publish app” – przy samych podstawowych zakresach nie trzeba przechodzić weryfikacji.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, nazwa „Trening – Supabase”;
   - **Authorized JavaScript origins**: `https://trening.felsztukier.pl`, `https://trening-inky.vercel.app`;
   - **Authorized redirect URIs**: `https://kgllegvlnmchdvkkbitt.supabase.co/auth/v1/callback`
     (to jedyny adres powrotu u Google – dalej przekierowuje już Supabase);
   - zapisz **Client ID** i **Client secret**.
4. **Klient typu iOS nie jest potrzebny**: aplikacja iOS loguje się tą samą stroną Google przez Supabase w systemowym
   oknie, a nie natywnym SDK Google Sign-In (ten wymagałby klienta iOS, `signInWithIdToken` i dodatkowej wtyczki).

### 2.2. Supabase – dostawca Google

Dashboard → projekt `kgllegvlnmchdvkkbitt` → **Authentication → Sign In / Providers → Google**:

- **Enable Sign in with Google**: włącz;
- **Client IDs**: Client ID z kroku 2.1; **Client Secret (for OAuth)**: secret z kroku 2.1;
- „Skip nonce checks” – wyłączone; „Allow users without an email” – wyłączone; zapisz.

### 2.3. Supabase – adresy powrotu

**Authentication → URL Configuration**:

- **Site URL**: sprawdź, że to `https://trening.felsztukier.pl` (tam wróci logowanie, gdy adres powrotu nie pasuje do listy);
- **Redirect URLs** – dopisz brakujące:
  - `https://trening.felsztukier.pl/**`
  - `https://trening-inky.vercel.app/**`
  - `http://localhost:5173/**` i `http://localhost:4173/**` (dev, e2e)
  - `trening://auth` (aplikacja iOS)

Najprościej w panelu. `supabase config push` tylko z **minimalnego** `config.toml` z `[auth]` i zawsze najpierw
`supabase config diff` (CLAUDE.md) – a ponieważ ustawienia SMTP Resend są tylko w panelu, wypchnięcie pliku bez nich
mogłoby je nadpisać; dlatego tu zalecam panel. `supabase/config.toml` w repo ma te adresy dla porządku.

Łączenie tożsamości: domyślnie włączone automatyczne łączenie po zweryfikowanym e-mailu – nic nie zmieniaj
(`enable_manual_linking` dotyczy tylko ręcznego łączenia i zostaje wyłączone).

### 2.4. Strava

Nic do zmiany: funkcja `strava-login` jest w tej samej domenie co integracja, a Strava sprawdza tylko domenę
(**Authorization Callback Domain** = `kgllegvlnmchdvkkbitt.supabase.co` na https://www.strava.com/settings/api).
Sekrety `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` już są. Opcjonalnie sekret `LOGIN_RETURN_ORIGINS`
(lista originów https po przecinku, np. adres podglądu Vercel), jeśli logowanie Stravą ma działać jeszcze gdzieś.

### 2.5. Wdrożenie funkcji

```bash
supabase functions deploy strava-login --no-verify-jwt --use-api
```

```bash
supabase functions deploy strava-oauth --no-verify-jwt --use-api
```

(`strava-oauth` – drobne utwardzenie callbacku: odrzuca podpisane dane logowania). Po wdrożeniu przycisk Stravy
pojawi się na ekranie logowania sam.

### 2.6. Aplikacja iOS

`npm run build:ios`, potem w Xcode Run na symulatorze albo telefonie. Wtyczka `trening-auth` (Swift) jest w
`native/trening-auth` i trafia do projektu przez `cap sync` (jak `trening-health`); zmian w `Info.plist` nie ma.

## 3. Jak sprawdzić

1. Web (`https://trening.felsztukier.pl/m` w oknie prywatnym): „Zaloguj się przez Google” → konto `elcukro@gmail.com`
   → wracasz zalogowany, dane jak dotąd (w Authentication → Users przy koncie pojawia się tożsamość `google`).
2. To samo z innym kontem Google spoza listy → „Ten adres e-mail nie ma dostępu do aplikacji”.
3. „Zaloguj się przez Stravę” → Strava (przy istniejącej zgodzie wraca od razu) → zalogowany na konto z połączoną Stravą.
4. Strava kogoś bez połączenia (albo po „Odłącz Stravę”) → komunikat „…zaloguj się kodem z maila, a potem połącz Stravę”.
5. Symulator iOS: oba przyciski otwierają systemowe okno („Trening chce użyć … do logowania” → Kontynuuj), po
   zalogowaniu okno się zamyka i `/m` pokazuje Dziś. Zamknięcie okna = nic się nie dzieje (bez komunikatu błędu).

## 4. Ograniczenia i uwagi

- **App Store (wytyczna 4.8)**: przy logowaniu Google (i Stravą) aplikacja w App Store musi mieć też Sign in with
  Apple – wymaga płatnego Apple Developer Program, odłożone (docs/26 § 5). Instalacja z Xcode i TestFlight bez tego działają.
- **PWA z ekranu początkowego iPhone'a**: przekierowanie do Google/Stravy i z powrotem może wylądować w Safari zamiast
  w PWA (osobna pamięć) – wtedy logowanie kończy się w Safari, a PWA dalej prosi o kod. Do sprawdzenia na telefonie;
  kod z maila zostaje jako pewna droga, a aplikacja iOS nie ma tego problemu.
- `generateLink` (logowanie Stravą) unieważnia wysłany wcześniej, jeszcze niewpisany kod z maila – to ten sam
  jednorazowy token konta.
- Logowanie Stravą działa tylko dla konta, które **już** ma połączoną Stravę; nie zakłada kont.
- Ekran logowania odpytuje `/auth/v1/settings` i `/strava-login/ping` raz na uruchomienie; bez sieci przyciski się nie
  pokazują (logowanie i tak wymaga sieci).
