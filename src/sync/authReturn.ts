/**
 * Powrót z logowania Google/Strava (docs/28) – czysta logika: co przyszło w adresie i jak to nazwać po polsku.
 * Parametry mogą być w `?…` (błędy Supabase przy PKCE, kod PKCE w aplikacji iOS) albo we fragmencie
 * (flow implicit w przeglądarce, bilet i błąd logowania Stravą).
 */

export type AuthReturn =
  | { kind: 'strava_ticket'; ticket: string }
  /** kod PKCE z Supabase – tylko aplikacja iOS (w przeglądarce flow implicit obsługuje sam klient Supabase) */
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }

const STRAVA_ERRORS: Record<string, string> = {
  not_linked: 'To konto Stravy nie jest połączone z żadnym kontem w aplikacji. Zaloguj się kodem z maila, a potem połącz Stravę w Ustawieniach → Integracje (pełna aplikacja w przeglądarce).',
  denied: 'Logowanie przez Stravę zostało przerwane.',
  expired: 'Logowanie przez Stravę trwało za długo – spróbuj jeszcze raz.',
  bad_state: 'Logowanie przez Stravę się nie powiodło – spróbuj jeszcze raz.',
  server: 'Strava nie odpowiedziała poprawnie – spróbuj za chwilę albo zaloguj się kodem z maila.',
}

export function stravaErrorMessage(code: string): string {
  return STRAVA_ERRORS[code] ?? STRAVA_ERRORS.bad_state!
}

/** Komunikat błędu Supabase Auth (z adresu powrotu albo z odpowiedzi API) po polsku. */
export function authErrorMessage(desc: string): string {
  // adres spoza private.allowed_emails: rejestracja wyłączona (enable_signup = false) albo trigger check_allowed_email
  if (/Signups not allowed|signup_disabled|Database error saving new user|nie ma dostępu/i.test(desc))
    return 'Ten adres e-mail nie ma dostępu do aplikacji. Zaloguj się kontem, którego adres jest na liście dozwolonych.'
  if (/rate limit/i.test(desc)) return 'Za dużo prób – spróbuj za chwilę.'
  if (/access_denied|cancel/i.test(desc) && !/expired|invalid/i.test(desc)) return 'Logowanie zostało przerwane.'
  if (/provider is not enabled|Unsupported provider/i.test(desc)) return 'Logowanie przez Google nie jest jeszcze włączone.'
  if (/expired|invalid/i.test(desc)) return 'Link wygasł lub został już użyty – wyślij nowy.'
  return desc
}

function params(url: { search: string; hash: string }): URLSearchParams {
  const out = new URLSearchParams(url.search)
  for (const [k, v] of new URLSearchParams(url.hash.replace(/^#/, ''))) out.set(k, v)
  return out
}

/** Co przyniósł adres powrotu; `null`, gdy nic związanego z logowaniem. */
export function parseAuthReturn(url: { search: string; hash: string }): AuthReturn | null {
  const p = params(url)
  const stravaError = p.get('strava_error')
  if (stravaError) return { kind: 'error', message: stravaErrorMessage(stravaError) }
  const ticket = p.get('strava_ticket')
  if (ticket) return { kind: 'strava_ticket', ticket }
  const desc = p.get('error_description') ?? p.get('error')
  if (desc) return { kind: 'error', message: authErrorMessage(desc) }
  const code = p.get('code')
  if (code) return { kind: 'code', code }
  return null
}

/** Pełny adres (np. `trening://auth?code=…`) w postaci, którą rozumie `parseAuthReturn`. */
export function splitUrl(href: string): { search: string; hash: string } {
  const hashAt = href.indexOf('#')
  const beforeHash = hashAt < 0 ? href : href.slice(0, hashAt)
  const q = beforeHash.indexOf('?')
  return { search: q < 0 ? '' : beforeHash.slice(q), hash: hashAt < 0 ? '' : href.slice(hashAt) }
}

const AUTH_KEYS = ['strava_ticket', 'strava_error', 'error', 'error_code', 'error_description']

/**
 * Adres bez parametrów logowania (bilet nie może zostać w historii ani w zakładce); `null`, gdy nie było czego usuwać.
 * Inne parametry (np. `?today=`) zostają.
 */
export function withoutAuthParams(href: string): string | null {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  let changed = false
  for (const k of AUTH_KEYS) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k)
      changed = true
    }
    if (hash.has(k)) {
      hash.delete(k)
      changed = true
    }
  }
  if (!changed) return null
  url.hash = hash.toString()
  return url.toString()
}
