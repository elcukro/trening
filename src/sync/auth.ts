import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { authErrorFromLocation, parseMagicLink } from './magicLink'

export interface AuthState {
  session: Session | null
  loading: boolean
  configured: boolean
  signIn: (email: string) => Promise<{ error: string | null }>
  /** Logowanie wklejonym linkiem z maila (PWA na iOS nie otwiera linków w sobie). */
  signInWithLink: (link: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** błąd przekazany w URL po powrocie z maila */
  urlError: string | null
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  const [urlError] = useState<string | null>(() => (typeof window !== 'undefined' ? authErrorFromLocation(window.location) : null))

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
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
    async signOut() {
      await supabase?.auth.signOut()
    },
    urlError,
  }
}

function translateAuthError(msg: string): string {
  if (/nie ma dostępu/.test(msg)) return 'Ten adres e-mail nie ma dostępu do aplikacji.'
  if (/rate limit/i.test(msg)) return 'Za dużo prób – spróbuj za chwilę.'
  if (/Signups not allowed/i.test(msg)) return 'Rejestracja wyłączona – ten adres nie jest dozwolony.'
  if (/expired|invalid/i.test(msg)) return 'Link wygasł lub został już użyty (każdy link działa raz) – wyślij nowy.'
  return msg
}
