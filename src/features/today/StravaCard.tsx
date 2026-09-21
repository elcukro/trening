import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type StravaActivity } from '@/db'
import { putSynced } from '@/db/repo'
import { zoneDistribution } from '@/engine/zones'
import type { HrZone } from '@/engine/schema'
import { addDays, isValidISODate } from '@/engine/dates'
import { zoneColor } from '@/lib/zones'
import { minutes, num, seconds } from '@/lib/format'
import { Button, Card, CardSection, CardTitle, Input } from '@/components/ui'
import { useToast } from '@/components/Toast'

export function useActivities(date: string): StravaActivity[] {
  return useLiveQuery(async () => (await db.strava_activities.where('date').equals(date).toArray()).filter((a) => !a.deleted_at && a.is_ride), [date], [] as StravaActivity[])
}

export function ZoneBar({ histogram, zones, lthr }: { histogram: number[]; zones: HrZone[]; lthr: number }) {
  const dist = zoneDistribution(histogram, zones, lthr).filter((z) => z.seconds > 0)
  const total = dist.reduce((a, z) => a + z.seconds, 0) || 1
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded" role="img" aria-label="Czas w strefach">
        {dist.map((z) => (
          <div key={z.id} className={zoneColor(z.id)} style={{ width: `${(z.seconds / total) * 100}%` }} title={`${z.id}: ${seconds(Math.round(z.seconds / 60) * 60)}`} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {dist.map((z) => (
          <span key={z.id}>
            {z.id} {z.pct}%
          </span>
        ))}
      </div>
    </div>
  )
}

/** Jazdy ze Stravy danego dnia: szczegóły, strefy, przenoszenie na inny dzień. */
export function StravaActivities({ date, zones, lthr, extra }: { date: string; zones: HrZone[]; lthr: number | null; extra?: boolean }) {
  const acts = useActivities(date)
  const toast = useToast()
  const [moving, setMoving] = useState<string | null>(null)
  const [target, setTarget] = useState(date)
  if (acts.length === 0) return null

  async function move(a: StravaActivity) {
    if (!isValidISODate(target) || target === a.date) return
    await toast.run('Przenoszę jazdę…', () => putSynced('strava_activities', { ...a, date: target }), () => `Jazda przeniesiona na ${target}`)
    setMoving(null)
  }

  const body = acts.map((a) => (
    <div key={a.id} className="border-t border-slate-200/80 pt-2 first:border-t-0 first:pt-0 dark:border-slate-700">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium" title={a.name ?? 'Jazda'}>🟠 {a.name ?? 'Jazda'}</span>
        <span className="shrink-0 tabular-nums">{minutes(Math.round(a.moving_time_s / 60))}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs tabular-nums text-slate-600 dark:text-slate-300">
        {a.distance_m != null && <span>{num(a.distance_m / 1000)} km</span>}
        {a.elevation_m != null && <span>{Math.round(a.elevation_m)} m ↑</span>}
        {a.avg_hr != null && <span>śr. {a.avg_hr} bpm</span>}
        {a.max_hr != null && <span>maks. {a.max_hr}</span>}
        {a.avg_cadence != null && <span>{a.avg_cadence} rpm</span>}
        {a.avg_speed_ms != null && <span>{num(a.avg_speed_ms * 3.6)} km/h</span>}
        {a.avg_watts != null && <span>{a.avg_watts} W</span>}
      </div>
      {a.hr_histogram && lthr ? <div className="mt-1"><ZoneBar histogram={a.hr_histogram} zones={zones} lthr={lthr} /></div> : a.hr_histogram ? <p className="text-xs text-slate-400 dark:text-slate-500">Strefy po wpisaniu LTHR.</p> : null}
      {moving === a.id ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="date" aria-label="Nowa data jazdy" className="min-w-0 flex-1" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Button onClick={() => move(a)} disabled={target === a.date}>
            Przenieś
          </Button>
          <Button variant="ghost" onClick={() => setMoving(null)}>
            Anuluj
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 -ml-3"
          onClick={() => {
            setMoving(a.id)
            setTarget(addDays(a.date, 0))
          }}
        >
          Przenieś na inny dzień
        </Button>
      )}
    </div>
  ))

  if (extra) {
    return (
      <Card tone="accent">
        <CardTitle icon="🚴">Jazda dodatkowa (Strava)</CardTitle>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Na ten dzień nie było zaplanowanej jazdy.</p>
        <div className="space-y-2">{body}</div>
      </Card>
    )
  }
  return <CardSection className="space-y-2">{body}</CardSection>
}
