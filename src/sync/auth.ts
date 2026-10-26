import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { authErrorFromLocation, parseMagicLink } from './magicLink'
import { consumeAuthReturn, signInWithGoogle, signInWithStrava, type OAuthResult } from './oauth'

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
      if (!supabase) return { error: 'Brak konfiguracji Supabase.' }
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: window.location.origin + '/wiecej/ustawienia', shouldCreateUser: true },
      })
      return { error: error ? translateAuthError(error.message) : null }
    },
    async signInWithLink(link) {
      if (!supabase) return { error: 'Brak konfiguracji Supabase.' }
      const parsed = parseMagicLink(link)
      if (!parsed) return { error: 'To nie wygląda na link logowania z maila.' }
      const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.token_hash, type: parsed.type })
      return { error: error ? translateAuthError(error.message) : null }
    },
    async signInWithCode(email, code) {
      if (!supabase) return { error: 'Brak konfiguracji Supabase.' }
      const token = code.replace(/\D/g, '')
      if (token.length < 6) return { error: 'Kod ma 6–8 cyfr.' }
      const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' })
      return { error: error ? translateAuthError(error.message) : null }
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

function translateAuthError(msg: string): string {
  if (/nie ma dostępu/.test(msg)) return 'Ten adres e-mail nie ma dostępu do aplikacji.'
  if (/rate limit/i.test(msg)) return 'Za dużo prób – spróbuj za chwilę.'
  if (/Signups not allowed/i.test(msg)) return 'Rejestracja wyłączona – ten adres nie jest dozwolony.'
  if (/expired|invalid/i.test(msg)) return 'Kod/link wygasł lub został już użyty (działa raz) – wyślij nowy.'
  return msg
}
