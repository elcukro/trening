import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SessionLog, type SessionStatus } from '@/db'
import { upsertSessionLog } from '@/db/repo'
import type { DayPlan } from '@/engine/plan'
import { Button } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { minutes, num } from '@/lib/format'

const STATUS_LABEL: Record<SessionStatus, string> = { planned: 'Zaplanowane', in_progress: 'W trakcie', done: 'Wykonane', modified: 'Zmienione', skipped: 'Pominięte' }
const STATUS_COLOR: Record<SessionStatus, string> = { planned: 'bg-slate-400', in_progress: 'bg-sky-500', done: 'bg-emerald-600', modified: 'bg-amber-500', skipped: 'bg-red-500' }

type Fields = { rpe: string; duration_min: string; distance_km: string; elevation_m: string; avg_hr: string; notes: string }

export function useBikeLog(date: string): SessionLog | undefined {
  return useLiveQuery(async () => (await db.session_logs.where('[date+kind]').equals([date, 'bike']).toArray()).find((r) => !r.deleted_at), [date])
}

export function StatusBadge({ status }: { status: SessionStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>
}

/** Oznaczanie jazdy: wykonane / zmienione / pominięte + szczegóły (RPE, czas, dystans, przewyższenie, tętno, notatka). */
export function BikeLogCard({ day }: { day: DayPlan }) {
  const toast = useToast()
  const log = useBikeLog(day.date)
  const [editing, setEditing] = useState<SessionStatus | null>(null)
  const [f, setF] = useState<Fields>({ rpe: '', duration_min: '', distance_km: '', elevation_m: '', avg_hr: '', notes: '' })
  if (!day.bike || day.bike.workout_id === 'TRIP' || day.bike.workout_id === 'TRAVEL_REST') return null

  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

  async function save(status: SessionStatus) {
    await toast.run('Zapisuję…', () => upsertSessionLog(day.date, 'bike', {
      planned_workout_id: day.bike!.workout_id,
      status,
      rpe: n(f.rpe) ?? log?.rpe ?? null,
      duration_min: n(f.duration_min) ?? log?.duration_min ?? (status === 'done' ? day.bike!.duration_min : null),
      distance_km: n(f.distance_km) ?? log?.distance_km ?? null,
      elevation_m: n(f.elevation_m) ?? log?.elevation_m ?? null,
      avg_hr: n(f.avg_hr) ?? log?.avg_hr ?? null,
      notes: f.notes.trim() || log?.notes || null,
    }), () => `Zapisano: ${STATUS_LABEL[status].toLowerCase()}`)
    setEditing(null)
  }

  const field = (key: keyof Fields, label: string, placeholder: string, mode: 'numeric' | 'decimal' | 'text' = 'numeric') => (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900"
        inputMode={mode}
        placeholder={placeholder}
        value={f[key]}
        onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))}
      />
    </label>
  )

  if (editing) {
    const quick = editing !== 'skipped'
    return (
      <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-700/50">
        <p className="mb-2 text-sm font-semibold">Oznacz jako: {STATUS_LABEL[editing].toLowerCase()}</p>
        <div className="grid grid-cols-2 gap-2">
          {quick && field('rpe', 'RPE 1–10', log?.rpe != null ? String(log.rpe) : 'np. 6')}
          {quick && field('duration_min', 'Czas (min)', String(log?.duration_min ?? day.bike.duration_min))}
          {quick && field('distance_km', 'Dystans (km)', log?.distance_km != null ? String(log.distance_km) : 'np. 42,5', 'decimal')}
          {quick && field('elevation_m', 'Przewyższenie (m)', log?.elevation_m != null ? String(log.elevation_m) : 'np. 250')}
          {quick && field('avg_hr', 'Śr. tętno', log?.avg_hr != null ? String(log.avg_hr) : 'np. 138')}
          <label className="col-span-2 block">
            <span className="text-xs text-slate-500">Notatka</span>
            <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900" value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} placeholder={log?.notes ?? (editing === 'skipped' ? 'powód' : 'jak poszło?')} />
          </label>
        </div>
        <div className="mt-2 flex gap-2">
          <Button onClick={() => save(editing)} className="flex-1">
            Zapisz
          </Button>
          <Button variant="secondary" onClick={() => setEditing(null)}>
            Anuluj
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
      {log && log.status !== 'planned' && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <StatusBadge status={log.status} />
          {log.duration_min != null && <span>{minutes(log.duration_min)}</span>}
          {log.distance_km != null && <span>{num(log.distance_km)} km</span>}
          {log.elevation_m != null && <span>{log.elevation_m} m ↑</span>}
          {log.avg_hr != null && <span>{log.avg_hr} bpm</span>}
          {log.rpe != null && <span>RPE {log.rpe}</span>}
          {log.notes && <span className="w-full text-xs text-slate-500">{log.notes}</span>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button variant={log?.status === 'done' ? 'primary' : 'secondary'} onClick={() => setEditing('done')}>
          ✓ Wykonane
        </Button>
        <Button variant={log?.status === 'modified' ? 'primary' : 'secondary'} onClick={() => setEditing('modified')}>
          ± Zmienione
        </Button>
        <Button variant={log?.status === 'skipped' ? 'danger' : 'secondary'} onClick={() => setEditing('skipped')}>
          ✕ Pominięte
        </Button>
      </div>
    </div>
  )
}
