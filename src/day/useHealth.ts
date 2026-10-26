import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { applyHealthDay } from '@/db/repo'
import { addDays } from '@/engine/dates'
import { todayISO } from '@/lib/dates'
import { health } from '@/native'
import type { HealthDay } from './health'

/** Włącznik Zdrowia jest per urządzenie (kv, bez synchronizacji) – dane Zdrowia są na tym telefonie. */
const KEY = 'health_enabled'
/** Odczyt ze Zdrowia nie częściej niż co 10 minut (otwarcie, powrót do aplikacji). */
const MIN_GAP_MS = 10 * 60 * 1000

export function useHealthEnabled(): boolean {
  return useLiveQuery(async () => (await db.kv.get(KEY))?.value === true, [], false)
}

export async function setHealthEnabled(on: boolean): Promise<void> {
  await db.kv.put({ key: KEY, value: on, updated_at: new Date().toISOString() })
}

/** Przy włączeniu: tyle dni wstecz – norma HRV (`readiness.ts`) potrzebuje historii, inaczej ostrzega dopiero po tygodniu. */
export const HEALTH_BACKFILL_DAYS = 28

/**
 * `days` dni ze Zdrowia do check-inów, od najstarszego do dziś (zwykle 2: wczoraj – gdy aplikacja nie była otwierana
 * po wieczornym pomiarze – i dziś). Zwraca dzisiejszy dzień ze Zdrowia (do komunikatu po włączeniu) albo `null`.
 */
export async function syncHealth(today: string = todayISO(), days = 2): Promise<HealthDay | null> {
  let last: HealthDay | null = null
  for (let back = days - 1; back >= 0; back--) {
    const date = addDays(today, -back)
    const day = await health.readDay(date)
    if (day) await applyHealthDay(date, day)
    if (back === 0) last = day
  }
  return last
}

/** Automat w `/m`: po starcie i po powrocie do aplikacji, gdy Zdrowie jest włączone. */
export function useHealthSync(): void {
  const enabled = useHealthEnabled()
  const last = useRef(0)
  useEffect(() => {
    if (!enabled) return
    const run = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last.current < MIN_GAP_MS) return
      last.current = Date.now()
      void syncHealth().catch(() => {})
    }
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [enabled])
}
