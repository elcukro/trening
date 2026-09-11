import { useEffect } from 'react'
import { useEngine } from '@/app/useSettings'
import { todayISO } from '@/lib/dates'
import { maybeAutoPush } from './wahoo'

/** Raz dziennie, po starcie aplikacji, wysyła na Bolta dziś + 6 dni (jeśli Wahoo jest połączone). */
export function useWahooAutoPush(): void {
  const engine = useEngine()
  const { ctx, weeks } = engine
  useEffect(() => {
    const id = setTimeout(() => {
      maybeAutoPush(todayISO(), ctx, weeks).catch((e) => console.warn('Wahoo auto push:', e))
    }, 4000) // po synchronizacji Supabase
    return () => clearTimeout(id)
  }, [ctx, weeks])
}
