import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db, type KeyValueRow, type SessionLog, type StravaActivity } from '@/db'
import { rideLoad, type RideLoad } from '@/engine/analysis'
import { addDays, mondayOf } from '@/engine/dates'
import type { HrZone } from '@/engine/schema'
import { Card, CardSection, CardTitle, Metric } from '@/components/ui'
import { num } from '@/lib/format'
import { fmtDayMonth } from '@/lib/dates'

const METHOD_PL = { power: 'moc', hr: 'tętno', rpe: 'RPE' } as const

/** Obciążenie treningowe (TSS) z jazd ze Stravy: tygodnie + lista ostatnich jazd ze zgodnością z planu vs wykonanie. */
export function LoadCard({ acts, logs, ftp, lthr, zones, today }: { acts: StravaActivity[]; logs: SessionLog[]; ftp: number | null; lthr: number | null; zones: HrZone[]; today: string }) {
  const analyses = useLiveQuery(async () => (await db.kv.where('key').startsWith('analysis:').toArray()) as KeyValueRow[], [], [] as KeyValueRow[])
  const scoreOf = (id: string) => (analyses.find((k) => k.key === `analysis:${id}`)?.value as { score: number | null } | undefined)?.score ?? null

  const rides = useMemo(() => {
    const rpeByDate = new Map(logs.filter((l) => l.kind === 'bike' && !l.deleted_at && l.rpe).map((l) => [l.date, l.rpe as number]))
    return acts
      .filter((a) => !a.deleted_at && a.is_ride)
      .map((a) => ({ a, load: rideLoad({ moving_s: a.moving_time_s, device_watts: a.device_watts, np_w: a.np_w, avg_watts: a.avg_watts, ftp, hr_histogram: a.hr_histogram, zones, lthr, rpe: rpeByDate.get(a.date) }) as RideLoad | null }))
      .toSorted((x, y) => (x.a.date < y.a.date ? 1 : -1))
  }, [acts, logs, ftp, lthr, zones])

  const weeks = useMemo(() => {
    const lastMonday = mondayOf(today)
    return Array.from({ length: 8 }, (_, i) => {
      const monday = addDays(lastMonday, -7 * (7 - i))
      const end = addDays(monday, 6)
      const inWeek = rides.filter((r) => r.a.date >= monday && r.a.date <= end)
      return { label: fmtDayMonth(monday), tss: inWeek.reduce((s, r) => s + (r.load?.tss ?? 0), 0), rides: inWeek.length, hours: inWeek.reduce((s, r) => s + r.a.moving_time_s, 0) / 3600 }
    })
  }, [rides, today])
  const thisWeek = weeks.at(-1)!
  const withLoad = rides.filter((r) => r.load)

  return (
    <Card>
      <CardTitle icon="🔥" right={<Metric>{thisWeek.tss} TSS w tym tyg.</Metric>}>
        Obciążenie (TSS)
      </CardTitle>
      {withLoad.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">TSS liczy się z mocy (miernik + FTP), z tętna (LTHR) albo z RPE wpisanego przy jeździe. Połącz Stravę i wpisz LTHR lub RPE.</p>
      ) : (
        <div className="h-36">
          <ResponsiveContainer>
            <BarChart data={weeks} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, name) => (name === 'tss' ? [`${v} TSS`, 'obciążenie'] : [v, name])} />
              <Bar dataKey="tss" name="tss" fill="#f97316" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {rides.length > 0 && (
        <CardSection>
          <ul className="divide-y divide-slate-100 text-xs dark:divide-slate-700/80">
            {rides.slice(0, 10).map(({ a, load }) => {
              const score = scoreOf(a.id)
              return (
                <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 py-1.5 tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">{fmtDayMonth(a.date)}</span>
                  <span className="min-w-0 truncate" title={a.name ?? ''}>
                    {a.name ?? 'Jazda'} <span className="text-slate-400 dark:text-slate-500">{num(a.moving_time_s / 3600, 1)} h{a.np_w && a.device_watts ? ` · NP ${a.np_w} W` : ''}</span>
                  </span>
                  <span className={`w-14 text-right ${score == null ? 'text-slate-400' : score >= 70 ? 'text-emerald-600 dark:text-emerald-400' : score >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`} title="Zgodność z planem (kroki pracy w celu)">
                    {score != null ? `${score} %` : ''}
                  </span>
                  <span className="w-16 text-right" title={load ? `IF ${load.if} · z ${METHOD_PL[load.method]}` : 'brak danych do TSS'}>
                    {load ? `${load.tss} TSS` : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </CardSection>
      )}
    </Card>
  )
}
