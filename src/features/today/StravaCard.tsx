import { useState } from 'react'
import { db } from '@/db'
import { rideSourceLabel, useRides, type RideRow } from '@/app/useRides'
import { putSynced } from '@/db/repo'
import { zoneDistribution } from '@/engine/zones'
import type { HrZone } from '@/engine/schema'
import { addDays, isValidISODate } from '@/engine/dates'
import { zoneColor } from '@/lib/zones'
import { minutes, num, seconds } from '@/lib/format'
import { Button, Card, CardSection, CardTitle, Input } from '@/components/ui'
import { useToast } from '@/components/Toast'
import type { ResolvedWorkout } from '@/engine/types'
import { RideAnalysis, RideLoadLine } from './RideAnalysis'
import { fmtDayMonth } from '@/lib/dates'
import { t as tNow } from '@/i18n'
import { useT } from '@/i18n/react'

/** Jazdy dnia z obu źródeł (Wahoo wygrywa z bliźniakiem ze Stravy). */
export function useActivities(date: string): RideRow[] {
  return useRides(date, date)
}

export function ZoneBar({ histogram, zones, lthr }: { histogram: number[]; zones: HrZone[]; lthr: number }) {
  const dist = zoneDistribution(histogram, zones, lthr).filter((z) => z.seconds > 0)
  const total = dist.reduce((a, z) => a + z.seconds, 0) || 1
  const t = useT()
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded" role="img" aria-label={t.classic.strava.zonesAria}>
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

/** Jazdy danego dnia: szczegóły, strefy, przenoszenie na inny dzień (tylko Strava – `wahoo_workouts` jest tylko do odczytu). */
export function StravaActivities({ date, zones, lthr, extra, workout, ftp }: { date: string; zones: HrZone[]; lthr: number | null; extra?: boolean; workout?: ResolvedWorkout | null; ftp?: number | null }) {
  const acts = useActivities(date)
  const toast = useToast()
  const t = useT()
  const s = t.classic.strava
  const [moving, setMoving] = useState<string | null>(null)
  const [target, setTarget] = useState(date)
  if (acts.length === 0) return null

  async function move(a: RideRow) {
    if (a.source !== 'strava' || !isValidISODate(target) || target === a.date) return
    const row = (await db.strava_activities.where('date').equals(a.date).toArray()).find((r) => Number(r.id) === a.id)
    if (!row) return
    await toast.run(s.moving, () => putSynced('strava_activities', { ...row, date: target }), () => tNow().classic.strava.moved(fmtDayMonth(target)))
    setMoving(null)
  }

  const body = acts.map((a) => (
    <div key={a.key} className="border-t border-slate-200/80 pt-2 first:border-t-0 first:pt-0 dark:border-slate-700">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium" title={a.name}>
          🟠 {a.name} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{rideSourceLabel(a)}</span>
        </span>
        <span className="shrink-0 tabular-nums">{minutes(Math.round(a.moving_time_s / 60))}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs tabular-nums text-slate-600 dark:text-slate-300">
        {a.distance_m > 0 && <span>{num(a.distance_m / 1000)} km</span>}
        {a.elevation_m > 0 && <span>{Math.round(a.elevation_m)} m ↑</span>}
        {a.avg_hr != null && <span>{s.avgHr(a.avg_hr)}</span>}
        {a.max_hr != null && <span>{s.maxHr(a.max_hr)}</span>}
        {a.avg_cadence != null && <span>{a.avg_cadence} rpm</span>}
        {a.distance_m > 0 && a.moving_time_s > 0 && <span>{num((a.distance_m / a.moving_time_s) * 3.6)} km/h</span>}
        {a.avg_watts != null && <span>{a.avg_watts} W</span>}
      </div>
      {a.note && <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-sm leading-6 text-slate-800 dark:bg-sky-950/40 dark:text-slate-100">{a.note}</p>}
      <RideLoadLine a={a} ftp={ftp ?? null} lthr={lthr} zones={zones} steady={!workout || workout.category === 'endurance'} />
      {a.hr_histogram && lthr ? <div className="mt-1"><ZoneBar histogram={a.hr_histogram} zones={zones} lthr={lthr} /></div> : a.hr_histogram ? <p className="text-xs text-slate-400 dark:text-slate-500">{s.needLthr}</p> : null}
      {workout && <RideAnalysis a={a} workout={workout} ftp={ftp ?? null} date={date} lthr={lthr} />}
      {a.source !== 'strava' ? null : moving === a.key ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="date" aria-label={s.newDate} className="min-w-0 flex-1" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Button onClick={() => move(a)} disabled={target === a.date}>
            {s.move}
          </Button>
          <Button variant="ghost" onClick={() => setMoving(null)}>
            {t.common.cancel}
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 -ml-3"
          onClick={() => {
            setMoving(a.key)
            setTarget(addDays(a.date, 0))
          }}
        >
          {s.moveToDay}
        </Button>
      )}
    </div>
  ))

  if (extra) {
    return (
      <Card tone="accent">
        <CardTitle icon="🚴">{s.extraTitle}</CardTitle>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{s.extraNote}</p>
        <div className="space-y-2">{body}</div>
      </Card>
    )
  }
  return <CardSection className="space-y-2">{body}</CardSection>
}
