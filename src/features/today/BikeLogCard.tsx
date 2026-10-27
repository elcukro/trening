import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SessionLog, type SessionStatus } from '@/db'
import { upsertSessionLog } from '@/db/repo'
import type { DayPlan } from '@/engine/plan'
import { Actions, Button, CardSection, Field, Input, Inset } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { minutes, num } from '@/lib/format'
import { t as tNow } from '@/i18n'
import { useT } from '@/i18n/react'

/** Etykieta stanu treningu w bieżącym języku. */
function statusLabel(status: SessionStatus): string {
  return tNow().classic.log.status[status]
}
const STATUS_COLOR: Record<SessionStatus, string> = { planned: 'bg-slate-400', in_progress: 'bg-sky-500', done: 'bg-emerald-600', modified: 'bg-amber-500', skipped: 'bg-red-500' }

type Fields = { rpe: string; duration_min: string; distance_km: string; elevation_m: string; avg_hr: string; notes: string }

export function useBikeLog(date: string): SessionLog | undefined {
  return useLiveQuery(async () => (await db.session_logs.where('[date+kind]').equals([date, 'bike']).toArray()).find((r) => !r.deleted_at), [date])
}

export function StatusBadge({ status }: { status: SessionStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap text-white ${STATUS_COLOR[status]}`}>{statusLabel(status)}</span>
}

/** Oznaczanie jazdy: wykonane / zmienione / pominięte + szczegóły (RPE, czas, dystans, przewyższenie, tętno, notatka). */
export function BikeLogCard({ day }: { day: DayPlan }) {
  const toast = useToast()
  const t = useT()
  const L = t.classic.log
  const log = useBikeLog(day.date)
  const [editing, setEditing] = useState<SessionStatus | null>(null)
  const [f, setF] = useState<Fields>({ rpe: '', duration_min: '', distance_km: '', elevation_m: '', avg_hr: '', notes: '' })
  if (!day.bike || day.bike.workout_id === 'TRIP' || day.bike.workout_id === 'TRAVEL_REST') return null

  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

  async function save(status: SessionStatus) {
    await toast.run(
      t.common.saving,
      () =>
        upsertSessionLog(day.date, 'bike', {
          planned_workout_id: day.bike!.workout_id,
          status,
          rpe: n(f.rpe) ?? log?.rpe ?? null,
          duration_min: n(f.duration_min) ?? log?.duration_min ?? (status === 'done' ? day.bike!.duration_min : null),
          distance_km: n(f.distance_km) ?? log?.distance_km ?? null,
          elevation_m: n(f.elevation_m) ?? log?.elevation_m ?? null,
          avg_hr: n(f.avg_hr) ?? log?.avg_hr ?? null,
          notes: f.notes.trim() || log?.notes || null,
        }),
      () => tNow().classic.log.saved(statusLabel(status)),
    )
    setEditing(null)
  }

  const field = (key: keyof Fields, label: string, placeholder: string, mode: 'numeric' | 'decimal' | 'text' = 'numeric') => (
    <Field label={label}>
      <Input inputMode={mode} placeholder={placeholder} value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} />
    </Field>
  )

  if (editing) {
    const quick = editing !== 'skipped'
    return (
      <CardSection>
        <Inset className="py-3">
          <p className="mb-2 text-sm font-semibold">{L.markAs(statusLabel(editing))}</p>
          <div className="grid grid-cols-2 gap-3">
            {quick && field('rpe', L.rpe, log?.rpe != null ? String(log.rpe) : L.eg('6'))}
            {quick && field('duration_min', L.duration, String(log?.duration_min ?? day.bike.duration_min))}
            {quick && field('distance_km', L.distance, log?.distance_km != null ? num(log.distance_km, 2) : L.eg(num(42.5)), 'decimal')}
            {quick && field('elevation_m', L.elevation, log?.elevation_m != null ? String(log.elevation_m) : L.eg('250'))}
            {quick && field('avg_hr', L.avgHr, log?.avg_hr != null ? String(log.avg_hr) : L.eg('138'))}
            <Field label={L.note} className="col-span-2">
              <Input value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} placeholder={log?.notes ?? (editing === 'skipped' ? L.notePlaceholderSkipped : L.notePlaceholder)} />
            </Field>
          </div>
          <Actions className="mt-3">
            <Button onClick={() => save(editing)} className="flex-1">
              {t.common.save}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t.common.cancel}
            </Button>
          </Actions>
        </Inset>
      </CardSection>
    )
  }

  return (
    <CardSection>
      {log && log.status !== 'planned' && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
          <StatusBadge status={log.status} />
          {log.duration_min != null && <span>{minutes(log.duration_min)}</span>}
          {log.distance_km != null && <span>{num(log.distance_km)} km</span>}
          {log.elevation_m != null && <span>{log.elevation_m} m ↑</span>}
          {log.avg_hr != null && <span>{log.avg_hr} bpm</span>}
          {log.rpe != null && <span>RPE {log.rpe}</span>}
          {log.notes && <span className="w-full text-xs text-slate-500 dark:text-slate-400">{log.notes}</span>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button variant={log?.status === 'done' ? 'primary' : 'secondary'} onClick={() => setEditing('done')} className="px-2">
          ✓ {L.status.done}
        </Button>
        <Button variant={log?.status === 'modified' ? 'primary' : 'secondary'} onClick={() => setEditing('modified')} className="px-2">
          ± {L.status.modified}
        </Button>
        <Button variant={log?.status === 'skipped' ? 'danger' : 'secondary'} onClick={() => setEditing('skipped')} className="px-2">
          ✕ {L.status.skipped}
        </Button>
      </div>
    </CardSection>
  )
}
