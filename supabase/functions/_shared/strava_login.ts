/**
 * Logowanie przez Stravę (docs/28) – czysta logika bez Deno: dokąd wolno wrócić, co niesie podpisany stan
 * i bilet, sprawdzenie weryfikatora PKCE. Podpis HMAC, wymiana kodu i sesja Supabase są w `strava-login/index.ts`.
 *
 * Przebieg: aplikacja → `start?return&challenge` → Strava → `callback` → powrót z biletem w `#strava_ticket`
 * → aplikacja wysyła bilet + weryfikator (`redeem`) → serwer wydaje jednorazowy `token_hash` magic linku
 * → aplikacja robi `verifyOtp`. Bilet sam w sobie nie loguje – bez weryfikatora, który zna tylko aplikacja,
 * nic nie da przechwycenie adresu powrotu (np. obca aplikacja z tym samym schematem `trening://`).
 */

/** Powrót do aplikacji iOS (ASWebAuthenticationSession łapie ten schemat). */
export const APP_RETURN = 'trening://auth'

/** Ważność stanu OAuth (logowanie u Stravy) i biletu (od powrotu do wymiany na sesję). */
export const STATE_TTL_MS = 10 * 60 * 1000
export const TICKET_TTL_MS = 2 * 60 * 1000

export type LoginError = 'denied' | 'bad_state' | 'expired' | 'not_linked' | 'server'

export interface LoginState {
  p: 'strava-login'
  ret: string
  ch: string
  exp: number
}

export interface LoginTicket {
  p: 'strava-ticket'
  uid: string
  ch: string
  exp: number
}

/**
 * Adres powrotu po zalogowaniu albo `null`, gdy nie jest dozwolony. Bez tej listy funkcja byłaby
 * otwartym przekierowaniem, które oddaje bilet logowania dowolnej stronie.
 * Dozwolone: `trening://auth`, https z listy `origins`, http na localhost/127.0.0.1 (dev, e2e).
 */
export function allowedReturn(ret: string | null, origins: string[]): string | null {
  if (!ret) return null
  if (ret === APP_RETURN) return APP_RETURN
  let url: URL
  try {
    url = new URL(ret)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  const listed = url.protocol === 'https:' && origins.some((o) => sameOrigin(o, url.origin))
  if (!local && !listed) return null
  url.hash = ''
  return url.toString()
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === b
  } catch {
    return false
  }
}

/** Origins dozwolone dla powrotu: adres aplikacji z sekretu, domeny produkcyjne i opcjonalna lista z sekretu. */
export function returnOrigins(appUrl: string, extra: string | undefined): string[] {
  const list = [appUrl, 'https://trening.felsztukier.pl', 'https://trening-inky.vercel.app']
  for (const o of (extra ?? '').split(',')) if (o.trim()) list.push(o.trim())
  return list
}

/** Wyzwanie PKCE: base64url z SHA-256, 43 znaki. */
export function validChallenge(ch: string | null): ch is string {
  return !!ch && /^[A-Za-z0-9_-]{43}$/.test(ch)
}

export function parseState(payload: string | null, now: number): LoginState | 'bad_state' | 'expired' {
  const s = parseJson(payload) as Partial<LoginState> | null
  if (!s || s.p !== 'strava-login' || typeof s.ret !== 'string' || !validChallenge(s.ch ?? null) || typeof s.exp !== 'number') return 'bad_state'
  if (now > s.exp) return 'expired'
  return s as LoginState
}

export function parseTicket(payload: string | null, now: number): LoginTicket | 'bad_state' | 'expired' {
  const t = parseJson(payload) as Partial<LoginTicket> | null
  if (!t || t.p !== 'strava-ticket' || typeof t.uid !== 'string' || !validChallenge(t.ch ?? null) || typeof t.exp !== 'number') return 'bad_state'
  if (now > t.exp) return 'expired'
  return t as LoginTicket
}

function parseJson(s: string | null): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** Adres powrotu z parametrami we fragmencie – fragment nie trafia do logów serwera ani do nagłówka Referer. */
export function returnWith(ret: string, params: Record<string, string>): string {
  return `${ret}#${new URLSearchParams(params)}`
}

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Wyzwanie z weryfikatora (S256, jak w PKCE) – ta sama funkcja w aplikacji i na serwerze. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(digest))
}

export async function verifierMatches(verifier: unknown, challenge: string): Promise<boolean> {
  if (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) return false
  const got = await challengeFor(verifier)
  if (got.length !== challenge.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ challenge.charCodeAt(i)
  return diff === 0
}
