import { t } from '@/i18n'
import { isNative } from '@/native/platform'
import { openAuthSession } from '@/native/webAuth'
import { b64url, challengeFor, STATE_TTL_MS } from '../../supabase/functions/_shared/strava_login'
import { authErrorMessage, parseAuthReturn, splitUrl, withoutAuthParams } from './authReturn'
import { langHeaders, SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase'

/**
 * Logowanie przez Google (Supabase Auth) i Stravę (Edge Function `strava-login`) – docs/28.
 * Przeglądarka: zwykłe przekierowanie i powrót na tę samą stronę. Aplikacja iOS: systemowe okno logowania
 * (`openAuthSession`) i powrót na `trening://auth` – Google nie pozwala logować się w WebView.
 */

/** Adres powrotu w aplikacji iOS – musi być w Supabase → Authentication → URL Configuration → Redirect URLs. */
export const APP_RETURN = 'trening://auth'
const VERIFIER_KEY = 'trening:strava-verifier'

export interface OAuthResult {
  error: string | null
  /** użytkownik zamknął okno logowania (tylko aplikacja iOS) */
  canceled?: boolean
  /** przeglądarka przechodzi do strony logowania – wynik przyjdzie po powrocie */
  redirecting?: boolean
}

export interface LoginProviders {
  google: boolean
  strava: boolean
}

let providers: Promise<LoginProviders> | null = null

/**
 * Które przyciski pokazać: Google, gdy dostawca jest włączony w Supabase (publiczne `/auth/v1/settings`),
 * Strava, gdy funkcja `strava-login` jest wdrożona. Bez sieci – żaden (logowanie i tak jej wymaga).
 */
export function loginProviders(): Promise<LoginProviders> {
  if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve({ google: false, strava: false })
  providers ??= (async () => {
    const [settings, ping] = await Promise.all([get('/auth/v1/settings').catch(() => null), get('/functions/v1/strava-login/ping').catch(() => null)])
    const external = (settings?.external ?? {}) as Record<string, unknown>
    const result = { google: external.google === true, strava: ping?.ok === true }
    if (!settings && !ping) providers = null // spróbuj ponownie przy następnym wejściu (np. po powrocie sieci)
    return result
  })()
  return providers
}

async function get(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: { apikey: SUPABASE_KEY! }, signal: AbortSignal.timeout(5000) })
  return res.ok ? ((await res.json()) as Record<string, unknown>) : null
}

function returnUrl(path: string): string {
  return isNative() ? APP_RETURN : window.location.origin + path
}

export async function signInWithGoogle(path: string): Promise<OAuthResult> {
  if (!supabase) return { error: t().sync.noBackend }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: returnUrl(path), skipBrowserRedirect: isNative(), queryParams: { prompt: 'select_account' } },
  })
  if (error) return { error: authErrorMessage(error.message) }
  if (!isNative()) return { error: null, redirecting: true } // przeglądarka już przechodzi do Google
  const back = await openAuthSession(data.url!, 'trening')
  return back ? completeAuthReturn(back) : { error: null, canceled: true }
}

export async function signInWithStrava(path: string): Promise<OAuthResult> {
  if (!supabase) return { error: t().sync.noBackend }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const url = `${SUPABASE_URL}/functions/v1/strava-login/start?${new URLSearchParams({ return: returnUrl(path), challenge: await challengeFor(verifier) })}`
  if (isNative()) {
    const back = await openAuthSession(url, 'trening')
    return back ? completeAuthReturn(back, verifier) : { error: null, canceled: true }
  }
  // localStorage, nie sessionStorage: logowanie do Stravy (np. przez Google/Apple) potrafi wrócić w nowej karcie,
  // a sessionStorage jest osobny dla każdej karty – weryfikator ważny tyle co stan OAuth
  try {
    localStorage.setItem(VERIFIER_KEY, JSON.stringify({ v: verifier, exp: Date.now() + STATE_TTL_MS }))
  } catch {
    return { error: t().sync.auth.storageBlocked }
  }
  window.location.assign(url)
  return { error: null, redirecting: true }
}

/** Kończy logowanie z adresu powrotu: bilet Stravy → sesja, kod PKCE → sesja, błąd → komunikat. */
export async function completeAuthReturn(href: string, verifier?: string): Promise<OAuthResult> {
  if (!supabase) return { error: null }
  const r = parseAuthReturn(splitUrl(href))
  if (!r) return { error: null }
  if (r.kind === 'error') return { error: r.message }
  if (r.kind === 'code') {
    const { error } = await supabase.auth.exchangeCodeForSession(r.code)
    return { error: error ? authErrorMessage(error.message) : null }
  }
  verifier ??= takeVerifier() ?? undefined
  if (!verifier) return { error: t().sync.auth.stravaOtherWindow }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY!, ...langHeaders() },
    body: JSON.stringify({ action: 'redeem', ticket: r.ticket, verifier }),
  }).catch(() => null)
  const body = res ? ((await res.json().catch(() => ({}))) as { token_hash?: string; error?: string }) : {}
  if (!body.token_hash) {
    const back = parseAuthReturn({ search: '', hash: `#strava_error=${body.error ?? 'server'}` })
    return { error: back?.kind === 'error' ? back.message : t().sync.auth.stravaFailed }
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' })
  return { error: error ? authErrorMessage(error.message) : null }
}

function takeVerifier(): string | null {
  try {
    const raw = localStorage.getItem(VERIFIER_KEY)
    localStorage.removeItem(VERIFIER_KEY)
    const saved = raw ? (JSON.parse(raw) as { v?: unknown; exp?: unknown }) : null
    return saved && typeof saved.v === 'string' && typeof saved.exp === 'number' && saved.exp > Date.now() ? saved.v : null
  } catch {
    return null
  }
}

let pending: Promise<string | null> | null = null

/**
 * Przeglądarka: raz na załadowanie strony kończy logowanie Stravą z biletu w adresie i czyści adres
 * (bilet nie zostaje w historii). Zwraca komunikat błędu albo `null`. Wołane z każdego `useAuth` – wykona się raz.
 */
export function consumeAuthReturn(): Promise<string | null> {
  if (pending) return pending
  pending = (async () => {
    if (typeof window === 'undefined' || isNative()) return null
    const href = window.location.href
    const clean = withoutAuthParams(href)
    if (!clean) return null
    window.history.replaceState(window.history.state, '', clean)
    const r = parseAuthReturn(splitUrl(href))
    if (r?.kind !== 'strava_ticket') return r?.kind === 'error' ? r.message : null
    return (await completeAuthReturn(href)).error
  })()
  return pending
}
