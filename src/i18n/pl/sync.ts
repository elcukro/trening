/** Teksty: sync (docs/34). Źródło prawdy – wersja angielska w `../en/sync.ts` musi mieć te same klucze. */
export default {
  /** build bez `VITE_SUPABASE_*` – praktycznie tylko wersja deweloperska */
  noBackend: 'Ta wersja aplikacji nie ma połączenia z serwerem – logowanie i integracje są wyłączone.',
  timeout: (s: number) => `Serwer nie odpowiedział w ${s} s – spróbuj jeszcze raz.`,
  noReply: 'Serwer nie przysłał odpowiedzi – spróbuj jeszcze raz.',
  /** kody błędów funkcji Strava/Wahoo */
  fn: {
    unauthorized: 'Zaloguj się (Ustawienia → Konto), żeby korzystać z integracji.',
    notConnected: 'Integracja nie jest połączona – połącz ją w Ustawieniach → Integracje.',
    noItems: 'W tym okresie nie ma treningów do wysłania.',
    unknownAction: 'Serwer nie rozpoznał polecenia – zaktualizuj aplikację, a jeśli to nie pomoże, zgłoś błąd.',
    method: 'Serwer nie obsługuje tego żądania – zaktualizuj aplikację.',
  },
  auth: {
    notAllowed: 'Ten adres e-mail nie ma dostępu do aplikacji.',
    notAllowedHint: 'Ten adres e-mail nie ma dostępu do aplikacji. Zaloguj się adresem, który jest na liście dozwolonych.',
    rateLimit: 'Za dużo prób – odczekaj chwilę i spróbuj ponownie.',
    signupsDisabled: 'Rejestracja jest wyłączona – ten adres nie jest na liście dozwolonych.',
    codeExpired: 'Kod lub link wygasł albo został już użyty (działa raz) – wyślij nowy.',
    linkExpired: 'Link wygasł lub został już użyty – wyślij nowy.',
    notMagicLink: 'To nie wygląda na link logowania z maila.',
    codeLength: 'Kod ma 6–8 cyfr.',
    canceled: 'Logowanie zostało przerwane.',
    googleDisabled: 'Logowanie przez Google nie jest jeszcze włączone.',
    storageBlocked: 'Przeglądarka blokuje pamięć strony (okno prywatne?) – zaloguj się kodem z maila.',
    stravaOtherWindow: 'Logowanie przez Stravę zaczęło się w innym oknie – spróbuj jeszcze raz.',
    stravaFailed: 'Logowanie przez Stravę się nie powiodło – spróbuj jeszcze raz.',
    strava: {
      notLinked:
        'To konto Stravy nie jest połączone z żadnym kontem w aplikacji. Zaloguj się kodem z maila, a potem połącz Stravę w Ustawieniach → Integracje (pełna aplikacja w przeglądarce).',
      denied: 'Logowanie przez Stravę zostało przerwane.',
      expired: 'Logowanie przez Stravę trwało za długo – spróbuj jeszcze raz.',
      badState: 'Logowanie przez Stravę się nie powiodło – spróbuj jeszcze raz.',
      server: 'Strava nie odpowiedziała poprawnie – spróbuj za chwilę albo zaloguj się kodem z maila.',
    },
  },
  coach: {
    sessionExpired: 'Sesja wygasła – zaloguj się ponownie.',
    noReply: 'Trener nie odpowiada – spróbuj za chwilę.',
    noReplyStatus: (status: number) => `Trener nie odpowiada (błąd ${status}) – spróbuj za chwilę.`,
    noAccount: 'Rozmowa z trenerem wymaga konta – zaloguj się.',
    offline: 'Brak połączenia z trenerem – sprawdź sieć i wyślij jeszcze raz.',
  },
  /** check-in jednym zdaniem i zdjęcie posiłku */
  parse: {
    noAccount: 'Rozpoznawanie wymaga konta – zaloguj się.',
  },
  push: {
    notSubscribed: 'To urządzenie nie jest zapisane do powiadomień.',
    signIn: 'Zaloguj się (Ustawienia → Konto), żeby włączyć powiadomienia.',
    unsupported: 'Ta przeglądarka nie obsługuje powiadomień.',
    iosHomeScreen: 'Na iPhonie dodaj aplikację do ekranu początkowego i włącz powiadomienia z jej poziomu.',
    denied: 'Powiadomienia są zablokowane – zezwól na nie w ustawieniach przeglądarki albo telefonu.',
    unsubscribeFailed: (msg: string) => `Nie udało się wypisać urządzenia na serwerze (${msg}) – spróbuj ponownie, gdy będzie sieć.`,
    deviceFallback: 'urządzenie',
    testText: 'Powiadomienia działają. Tak będzie wyglądał plan dnia.',
  },
  /** dziennik prób wysyłki na Bolta (Ustawienia → Integracje) */
  wahoo: {
    sending: 'wysyłam…',
    partial: (ok: number, errors: number) => `${ok} wysłanych, ${errors} z błędem`,
    sent: (n: number) => `${n} wysłanych`,
    failed: (msg: string) => `błąd: ${msg}`,
  },
  location: {
    denied: (app: string) => `Brak zgody na lokalizację. Włączysz ją w Ustawieniach iPhone’a → ${app} → Lokalizacja („Podczas używania aplikacji”).`,
    failed: 'Nie udało się ustalić lokalizacji. Spróbuj na zewnątrz albo wpisz miejscowość.',
  },
}
