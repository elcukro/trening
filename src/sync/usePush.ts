import { useEffect } from 'react'
import { ensurePushSubscription } from './push'
import { supabase } from './supabase'

/**
 * Utrzymuje subskrypcję Web Push: przy starcie, po zalogowaniu i gdy service worker zgłosi
 * `pushsubscriptionchange` (przeglądarka wymieniła subskrypcję) – patrz `ensurePushSubscription`.
 */
export function usePushKeepalive(): void {
  useEffect(() => {
    if (!supabase) return
    const ensure = () => void ensurePushSubscription().catch(() => undefined)
    ensure()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') ensure()
    })
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'PUSH_SUBSCRIPTION_CHANGED') ensure()
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      sub.subscription.unsubscribe()
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [])
}
