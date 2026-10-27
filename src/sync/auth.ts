import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { t } from '@/i18n'
import { supabase } from './supabase'
import { authErrorFromLocation, parseMagicLink } from './magicLink'
import { consumeAuthReturn, signInWithGoogle, signInWithStrava, type OAuthResult } from './oauth'

/**
 * Liczba cyfr kodu z maila – jedna dla wszystkich ekranów logowania i równa `auth.email.otp_length` w Supabase
 * (projekt w chmurze: 8, sprawdzone `supabase config diff` 27.10.2026). Zgodność z `supabase/config.toml` pilnuje test
 * `otpLength.test.ts`; zmiana długości = ta stała + config.toml + `supabase config push` naraz.
 */
export const OTP_LENGTH = 8

export interface AuthState {
  session: Session | null
  loading: boolean
  configured: boolean
  signIn: (email: string) => Promise<{ error: string | null }>
  /** Logowanie wklejonym linkiem z maila (PWA na iOS nie otwiera linków w sobie). */
  signInWithLink: (link: string) => Promise<{ error: string | null }>
  /** Logowanie kodem z maila (wymaga szablonu z {{ .Token }} → własne SMTP). */
  signInWithCode: (email: string, code: string) => Promise<{ error: string | null }>
  /** Logowanie Google / Stravą (docs/28); `returnPath` – dokąd wrócić w przeglądarce (aplikacja iOS wraca przez trening://auth). */
  signInWithGoogle: (returnPath: string) => Promise<OAuthResult>
  signInWithStrava: (returnPath: string) => Promise<OAuthResult>
  signOut: () => Promise<void>
  /** błąd przekazany w URL po powrocie z maila, Google albo Stravy */
  urlError: string | null
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  const [urlError, setUrlError] = useState<string | null>(initialUrlError)

  useEffect(() => {
    if (!supabase) return
    let active = true
    // najpierw bilet Stravy z adresu powrotu (jeśli jest) – inaczej przez chwilę widać ekran logowania
    void consumeAuthReturn()
      .then((err) => {
        if (active && err) setUrlError(err)
      })
      .finally(() =>
        supabase!.auth.getSession().then(({ data }) => {
          if (!active) return
          setSession(data.session)
          setLoading(false)
        }),
      )
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return {
    session,
    loading,
    configured: !!supabase,
    async signIn(email) {
      if (!supabase) return { error: t().sync.noBackend }
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: window.location.origin + '/wiecej/ustawienia', shouldCreateUser: true },
      })
      return { error: error ? translateAuthError(error.message, error.code) : null }
    },
    async signInWithLink(link) {
      if (!supabase) return { error: t().sync.noBackend }
      const parsed = parseMagicLink(link)
      if (!parsed) return { error: t().sync.auth.notMagicLink }
      const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.token_hash, type: parsed.type })
      return { error: error ? translateAuthError(error.message, error.code) : null }
    },
    async signInWithCode(email, code) {
      if (!supabase) return { error: t().sync.noBackend }
      const token = code.replace(/\D/g, '')
      if (token.length !== OTP_LENGTH) return { error: t().sync.auth.codeLength(OTP_LENGTH) }
      const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' })
      return { error: error ? translateAuthError(error.message, error.code) : null }
    },
    signInWithGoogle,
    signInWithStrava,
    async signOut() {
      await supabase?.auth.signOut()
    },
    urlError,
  }
}

// adres czytany raz przy starcie: `consumeAuthReturn` czyści go z parametrów logowania, a hook montuje się w kilku miejscach
let firstUrlError: string | null | undefined
function initialUrlError(): string | null {
  if (firstUrlError === undefined) firstUrlError = typeof window !== 'undefined' ? authErrorFromLocation(window.location) : null
  return firstUrlError
}

function translateAuthError(msg: string, code?: string): string {
  // „nie ma dostępu” to treść wyjątku z triggera check_allowed_email (serwer)
  if (/nie ma dostępu/.test(msg)) return t().sync.auth.notAllowed
  // limit maili: „For security purposes, you can only request this after N seconds” (`over_email_send_rate_limit`)
  if (/rate_limit/.test(code ?? '') || /rate limit|security purposes/i.test(msg)) return t().sync.auth.rateLimit
  if (/Signups not allowed/i.test(msg)) return t().sync.auth.signupsDisabled
  if (code === 'otp_expired' || /expired|invalid/i.test(msg)) return t().sync.auth.codeExpired
  return msg
}
