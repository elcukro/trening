import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface AuthState {
  session: Session | null
  loading: boolean
  configured: boolean
  signIn: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)

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
    async signOut() {
      await supabase?.auth.signOut()
    },
  }
}

function translateAuthError(msg: string): string {
  if (/nie ma dostępu/.test(msg)) return 'Ten adres e-mail nie ma dostępu do aplikacji.'
  if (/rate limit/i.test(msg)) return 'Za dużo prób – spróbuj za chwilę.'
  if (/Signups not allowed/i.test(msg)) return 'Rejestracja wyłączona – ten adres nie jest dozwolony.'
  return msg
}
