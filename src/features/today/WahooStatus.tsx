import { useLiveQuery } from 'dexie-react-hooks'
import { db, type WahooPushRow, type WahooWorkout } from '@/db'
import { useEngine } from '@/app/useSettings'
import type { DayPlan } from '@/engine/plan'
import { isPushable } from '@/engine/wahoo'
import { pushItemForDay } from '@/sync/wahoo'
import { fmtDayMonth } from '@/lib/dates'
import { num } from '@/lib/format'

export type BoltState = { kind: 'ok'; when: string } | { kind: 'stale'; when: string } | { kind: 'error'; error: string } | { kind: 'missing' } | { kind: 'na' }

/** Stan treningu dnia na Bolcie: wysłany i aktualny / nieaktualny (plan się zmienił) / błąd / brak. */
export function useBoltState(day: DayPlan): BoltState {
  const engine = useEngine()
  const row = useLiveQuery(async () => (await db.wahoo_pushes.where('date').equals(day.date).toArray()).find((r) => !r.deleted_at), [day.date]) as WahooPushRow | undefined
  if (!day.bike || !isPushable(day.bike.workout_id)) return { kind: 'na' }
  if (!row) return { kind: 'missing' }
  if (row.status === 'error') return { kind: 'error', error: row.error ?? 'błąd wysyłki' }
  const current = pushItemForDay(day, engine.ctx)
  if (current && row.external_id && row.external_id !== current.external_id) return { kind: 'stale', when: row.updated_at }
  return { kind: 'ok', when: row.updated_at }
}

export function boltLabel(s: BoltState): { text: string; tone: 'ok' | 'warn' | 'muted' } | null {
  switch (s.kind) {
    case 'ok':
      return { text: `na Bolcie ✓ (${fmtDayMonth(s.when.slice(0, 10))})`, tone: 'ok' }
    case 'stale':
      return { text: 'na Bolcie, ale plan się zmienił – wyślij ponownie', tone: 'warn' }
    case 'error':
      return { text: `błąd wysyłki: ${s.error}`, tone: 'warn' }
    case 'missing':
      return { text: 'nie wysłano na Bolta', tone: 'muted' }
    default:
      return null
  }
}

/** Wykonany trening wg Bolta (workout_summary) – pokazywany, gdy dzień nie ma jazdy ze Stravy. */
export function WahooCompleted({ date, hasStrava }: { date: string; hasStrava: boolean }) {
  const rows = useLiveQuery(async () => (await db.wahoo_workouts.where('date').equals(date).toArray()).filter((r) => !r.deleted_at), [date], [] as WahooWorkout[])
  if (hasStrava || rows.length === 0) return null
  return (
    <div className="mt-2 space-y-1 border-t border-slate-200/80 pt-2 dark:border-slate-700">
      {rows.map((w) => (
        <div key={w.id} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-medium">⌚ {w.name ?? 'Trening z Bolta'}</span>
            <span className="shrink-0 tabular-nums">{w.minutes_active} min</span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs tabular-nums text-slate-600 dark:text-slate-300">
            {w.distance_km != null && <span>{num(w.distance_km)} km</span>}
            {w.avg_hr != null && <span>śr. {w.avg_hr} bpm</span>}
            {w.avg_power != null && <span>{w.avg_power} W</span>}
            {w.np_w != null && <span>NP {w.np_w} W</span>}
            {w.avg_cadence != null && <span>{w.avg_cadence} rpm</span>}
            {w.avg_speed_kmh != null && <span>{num(w.avg_speed_kmh)} km/h</span>}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Wg Bolta (podsumowanie Wahoo). Gdy jazda dotrze ze Stravy, zastąpi te dane.</p>
        </div>
      ))}
    </div>
  )
}
