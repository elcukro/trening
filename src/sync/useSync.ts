import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '@/db'
import { loadProgram } from '@/data/program'
import { onSyncStatus, runSync, type SyncStatus } from './sync'
import { supabase } from './supabase'

/** Uruchamia synchronizację: przy starcie, po zalogowaniu, po powrocie sieci, po każdej zmianie outboxa (z opóźnieniem). */
export function useSyncRunner(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ state: supabase ? 'idle' : 'disabled', last_sync: null, pending: 0 })
  useEffect(() => onSyncStatus(setStatus), [])
  useEffect(() => {
    if (!supabase) return
    const version = loadProgram().version
    const trigger = () => void runSync({ programVersion: version })
    trigger()
    const onOnline = () => trigger()
    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') trigger()
    })
    let timer: ReturnType<typeof setTimeout> | null = null
    const outboxSub = liveQuery(() => db.outbox.count()).subscribe((n) => {
      if (n > 0) {
        if (timer) clearTimeout(timer)
        timer = setTimeout(trigger, 1500)
      }
    })
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      sub.subscription.unsubscribe()
      outboxSub.unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [])
  return status
}
