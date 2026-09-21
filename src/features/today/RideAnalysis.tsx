import { useEffect, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db, type StravaActivity } from '@/db'
import { upsertSessionLog, findSessionLog } from '@/db/repo'
import { chartSeries, matchSteps, rideLoad, statusFromScore, type MatchResult, type RideSamples, type StepResult } from '@/engine/analysis'
import type { HrZone } from '@/engine/schema'
import type { ResolvedWorkout } from '@/engine/types'
import { loadStreams } from '@/sync/strava'
import { Button, Inset } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { seconds } from '@/lib/format'
import { zoneColor, zoneText } from '@/lib/zones'
import { cadenceByZone, cadenceHistogram } from '@/engine/cadence'
import { useEngine } from '@/app/useSettings'

const RATING_ICON = { ok: '✅', warn: '⚠️', miss: '❌' } as const

/** Obciążenie jazdy (TSS/IF) – z mocy, tętna albo RPE; jedna linijka pod jazdą. */
export function RideLoadLine({ a, ftp, lthr, zones, rpe }: { a: StravaActivity; ftp: number | null; lthr: number | null; zones: HrZone[]; rpe?: number | null }) {
  const load = rideLoad({ moving_s: a.moving_time_s, device_watts: a.device_watts, np_w: a.np_w, avg_watts: a.avg_watts, ftp, hr_histogram: a.hr_histogram, zones, lthr, rpe })
  if (!load) return null
  const method = load.method === 'power' ? 'z mocy' : load.method === 'hr' ? 'z tętna' : 'z RPE'
  return (
    <div className="flex flex-wrap gap-x-3 text-xs tabular-nums text-slate-600 dark:text-slate-300">
      <span>
        TSS <b>{load.tss}</b>
      </span>
      <span>IF {load.if.toFixed(2)}</span>
      {a.np_w && a.device_watts && <span>NP {a.np_w} W</span>}
      {a.decoupling_pct != null && <span title="Rozprzężenie moc:tętno – < 5 % to dobra baza tlenowa">Pw:HR {a.decoupling_pct} %</span>}
      <span className="text-slate-400 dark:text-slate-500">({method})</span>
    </div>
  )
}

interface Saved {
  offset_s: number
  score: number | null
}

/**
 * Plan vs wykonanie: dopasowanie kroków treningu do próbek jazdy. Wynik (przesunięcie, zgodność) zapamiętujemy w `kv`,
 * a status logu dnia zmieniamy z „wykonane” na „zmienione”, gdy kroki pracy w większości nie trafiły w cel.
 */
export function RideAnalysis({ a, workout, ftp, date, lthr = null }: { a: StravaActivity; workout: ResolvedWorkout; ftp: number | null; date: string; lthr?: number | null }) {
  const toast = useToast()
  const [samples, setSamples] = useState<RideSamples | null>(null)
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const kvKey = `analysis:${a.id}`

  useEffect(() => {
    let alive = true
    void db.kv.get(kvKey).then((row) => {
      if (alive && row) setMatch((m) => m ?? ({ offset_s: (row.value as Saved).offset_s, score: (row.value as Saved).score, steps: [], moving_s: 0 } as MatchResult))
    })
    return () => {
      alive = false
    }
  }, [kvKey])

  async function analyze(mode: 'auto' | number) {
    setBusy(true)
    try {
      const s = samples ?? (await loadStreams(a.id))
      if (!s) {
        toast.notify('Ta jazda nie ma zapisanych strumieni – kliknij „Pobierz ostatnie 30 dni” w Integracjach.', 'error')
        return
      }
      setSamples(s)
      const m = mode === 'auto' ? matchSteps(workout, s, { auto: true, ftp }) : matchSteps(workout, s, { offset_s: mode, ftp })
      setMatch(m)
      setOpen(true)
      await db.kv.put({ key: kvKey, value: { offset_s: m.offset_s, score: m.score } satisfies Saved, updated_at: new Date().toISOString() })
      // status dnia: Strava ustawia „wykonane”; obniżamy do „zmienione”, gdy kroki pracy w większości chybiły
      const log = await findSessionLog(date, 'bike')
      const suggested = statusFromScore(m.score)
      if (log && m.score != null && log.status === 'done' && suggested === 'modified') await upsertSessionLog(date, 'bike', { status: 'modified' })
      if (log && m.score != null && log.status === 'modified' && suggested === 'done' && (log.notes ?? '').startsWith('Strava:')) await upsertSessionLog(date, 'bike', { status: 'done' })
    } catch (e) {
      toast.notify('Analiza nie powiodła się.', 'error', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!a.has_streams) return null
  const scoreBadge = match?.score != null && (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${match.score >= 70 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : match.score >= 40 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'}`}>
      zgodność {match.score} %
    </span>
  )

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => (match && match.steps.length ? setOpen((v) => !v) : analyze(match ? match.offset_s : 'auto'))}>
          {busy ? 'Analizuję…' : match?.steps.length ? (open ? 'Ukryj wykonanie' : 'Pokaż wykonanie') : 'Plan vs wykonanie'}
        </Button>
        {scoreBadge}
      </div>
      {open && match && match.steps.length > 0 && samples && <AnalysisBody match={match} samples={samples} busy={busy} onOffset={(o) => analyze(o)} onAuto={() => analyze('auto')} a={a} ftp={ftp} lthr={lthr} />}
    </div>
  )
}

function AnalysisBody({ match, samples, busy, onOffset, onAuto, a, ftp, lthr }: { match: MatchResult; samples: RideSamples; busy: boolean; onOffset: (o: number) => void; onAuto: () => void; a: StravaActivity; ftp: number | null; lthr: number | null }) {
  const data = chartSeries(samples, match, 30)
  const program = useEngine().ctx.program
  const cad = cadenceHistogram(samples)
  const cadZones = cadenceByZone(samples, { devicePower: !!a.device_watts, ftp, powerZones: program.power_zones_ftp_fraction, lthr, hrZones: program.hr_zones_lthr_fraction })
  const hasWatts = data.some((p) => p.watts != null)
  const kind = match.steps.find((s) => s.target)?.target?.kind
  const yKey = kind === 'watts' && hasWatts ? 'watts' : 'hr'
  return (
    <div className="mt-2 space-y-2">
      <div className="h-40">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
            <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} unit="′" />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v, name) => [`${v} ${name === 'hr' ? 'bpm' : 'W'}`, name === 'hr' ? 'tętno' : name === 'watts' ? 'moc' : name === 'lo' ? 'cel od' : 'cel do']} labelFormatter={(l) => `${l} min`} />
            <Line type="stepAfter" dataKey="lo" stroke="#f59e0b" strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
            <Line type="stepAfter" dataKey="hi" stroke="#f59e0b" strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey={yKey} stroke={yKey === 'watts' ? '#0ea5e9' : '#ef4444'} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ol className="divide-y divide-slate-100 text-xs dark:divide-slate-700/80">
        {match.steps.map((st) => (
          <StepRow key={st.index} st={st} />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="tabular-nums">Start treningu: {match.offset_s >= 0 ? '+' : '−'}{seconds(Math.abs(match.offset_s))} od startu nagrania</span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onOffset(match.offset_s - 60)} ariaLabel="Minuta wcześniej">
          −1 min
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onOffset(match.offset_s + 60)} ariaLabel="Minuta później">
          +1 min
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onAuto}>
          Auto
        </Button>
      </div>
      {match.score == null && <Inset tone="info" className="text-xs">Brak celu do oceny – jazda bez mocy i tętna albo trening bez kroków pracy.</Inset>}
      {cad.avg_rpm != null && (
        <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-900/60" data-testid="cadence-section">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            🔄 Kadencja: śr. <b className="text-slate-800 dark:text-slate-100">{cad.avg_rpm} rpm</b> · pedałowanie {cad.pedaling_pct} % czasu w ruchu
          </p>
          <div className="mt-1 flex h-3 w-full overflow-hidden rounded" role="img" aria-label="Rozkład kadencji">
            {cad.buckets.filter((b) => b.pct > 0).map((b, i) => (
              <div key={b.label} className={['bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500'][cad.buckets.indexOf(b)] ?? 'bg-slate-400'} style={{ width: `${b.pct}%` }} title={`${b.label} rpm: ${b.pct} %`} data-i={i} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {cad.buckets.filter((b) => b.pct > 0).map((b) => (
              <span key={b.label}>
                {b.label}: {b.pct} %
              </span>
            ))}
          </div>
          {cadZones.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs tabular-nums">
              {cadZones.map((z) => (
                <span key={z.zone} className="inline-flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${zoneColor(z.zone)}`} />
                  {z.zone} {z.avg_rpm} rpm
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StepRow({ st }: { st: StepResult }) {
  const t = st.target
  return (
    <li className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-x-2 py-1 ${st.work ? '' : 'text-slate-500 dark:text-slate-400'}`}>
      <span aria-label={st.rating ?? 'bez oceny'}>{st.rating ? RATING_ICON[st.rating] : '·'}</span>
      <span className="min-w-0 truncate">
        <span className={`font-semibold ${zoneText(st.zone)}`}>{st.zone}</span> {st.name}
        {t && (
          <span className="text-slate-400 dark:text-slate-500">
            {' '}
            · cel {t.low}–{t.high} {t.kind === 'watts' ? 'W' : 'bpm'}
          </span>
        )}
      </span>
      <span className="tabular-nums whitespace-nowrap">
        {st.avg_watts != null && `${st.avg_watts} W`}
        {st.avg_watts != null && st.avg_hr != null && ' · '}
        {st.avg_hr != null && `${st.avg_hr} bpm`}
        {st.avg_cadence != null && ` · ${st.avg_cadence} rpm`}
        {st.cadence_in_target_pct != null && st.cadence_target && (
          <span className={st.cadence_in_target_pct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} title={`cel ${st.cadence_target[0]}–${st.cadence_target[1]} rpm`}>
            {' '}
            ({st.cadence_in_target_pct} % w celu rpm)
          </span>
        )}
      </span>
      <span className="w-10 text-right tabular-nums">{st.in_target_pct != null ? `${st.in_target_pct} %` : ''}</span>
    </li>
  )
}
