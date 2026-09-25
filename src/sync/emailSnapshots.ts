import { useEffect } from 'react'
import { useEngine } from '@/app/useSettings'
import { snapshotFor } from '@/app/emailViews'
import { planWindow } from '@/engine/plan'
import { addDays } from '@/engine/dates'
import type { EngineContext, LayoutWeek } from '@/engine/types'
import { todayISO } from '@/lib/dates'
import { supabase } from './supabase'
import { loadOverridesFor } from './wahoo'

/** Tydzień wstecz (podsumowania jazd wgranych z opóźnieniem) i dwa tygodnie w przód (poranki, gdy aplikacja długo zamknięta). */
const BACK = 7
export const EMAIL_APP_URL = 'https://trening.felsztukier.pl'
const AHEAD = 14

/**
 * Wgrywa na serwer migawki dni do maili (docs/19): serwer nie ma silnika planu, więc plan dnia z nadpisaniami,
 * progi, strefy i poranną odprawę liczy aplikacja – tak samo jak plan dla Wahoo.
 */
export async function uploadEmailSnapshots(today: string, ctx: EngineContext, weeks?: LayoutWeek[]): Promise<number> {
  if (!supabase) return 0
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return 0
  const from = addDays(today, -BACK)
  const days = BACK + AHEAD + 1
  const overrides = await loadOverridesFor(from, days)
  // okno szersze o tydzień z każdej strony: suma planu tygodnia i „następny trening” na krańcach
  const window = planWindow(addDays(from, -7), days + 14, ctx, weeks, overrides)
  // linki w mailach zawsze na własną domenę – nadawca i linki z jednej domeny (spam), niezależnie od tego, skąd otwarto aplikację
  const opts = { athlete: ctx.settings.athlete_name, appUrl: EMAIL_APP_URL }
  const rows = window
    .filter((d) => d.date >= from && d.date <= addDays(today, AHEAD))
    .map((d) => ({ user_id: userId, date: d.date, payload: snapshotFor(d, window, ctx.program, opts), updated_at: new Date().toISOString() }))
  const { error } = await supabase.from('email_days').upsert(rows, { onConflict: 'user_id,date' })
  if (error) throw new Error(`email_days: ${error.message}`)
  return rows.length
}

/** Po starcie i po każdej zmianie planu/ustawień – tylko gdy któryś mail jest włączony. */
export function useEmailSnapshots(): void {
  const engine = useEngine()
  const { ctx, weeks } = engine
  const on = !!(ctx.settings.email_morning || ctx.settings.email_workout)
  useEffect(() => {
    if (!on) return
    const id = setTimeout(() => {
      uploadEmailSnapshots(todayISO(), ctx, weeks).catch((e) => console.warn('Migawki maili:', e))
    }, 6000) // po synchronizacji Supabase i wysyłce na Bolta
    return () => clearTimeout(id)
  }, [on, ctx, weeks])
}
