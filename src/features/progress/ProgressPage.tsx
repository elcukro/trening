import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useEngine } from '@/app/useSettings'
import { db, type Checkin, type SessionLog, type StravaActivity, type TestResult } from '@/db'
import { ZoneBar } from '@/features/today/StravaCard'
import { addDays } from '@/engine/dates'
import { buildCalendar } from '@/engine/calendar'
import { estimateClimb } from '@/engine/climb'
import { compliance, weeklyVolume, weightSeries, weightTrend } from '@/engine/progress'
import { Button, Card, CardSection, CardTitle, Input, Metric, PageTitle, Row, Select, buttonClass } from '@/components/ui'
import { Link } from 'react-router'
import { mondayOf } from '@/engine/dates'
import { hours, num } from '@/lib/format'
import { fmtDayMonth, todayISO } from '@/lib/dates'
import { TestResultForm, TestSummary } from '@/features/today/TestResultCard'
import { BaselineCard } from './BaselineCard'
import { LoadCard } from './LoadCard'
import { PowerCard } from './PowerCard'
import { PmcCard } from './PmcCard'
import { CadenceCard } from './CadenceCard'
import { FtpSuggestionCard } from './FtpSuggestionCard'
import { programGoal } from '@/engine/baseline'
import { useT } from '@/i18n/react'

export function ProgressPage() {
  const engine = useEngine()
  const t = useT()
  const tp = t.progress
  const s = engine.ctx.settings
  const today = todayISO()
  const checkins = useLiveQuery(() => db.checkins.orderBy('date').toArray(), [], [] as Checkin[])
  const tests = useLiveQuery(() => db.test_results.orderBy('date').toArray(), [], [] as TestResult[])
  const rides = useLiveQuery(() => db.session_logs.toArray(), [], [] as SessionLog[])
  const allActs = useLiveQuery(() => db.strava_activities.where('date').aboveOrEqual(addDays(today, -90)).toArray(), [today], [] as StravaActivity[])
  const acts = useMemo(() => allActs.filter((a) => a.date >= addDays(today, -27)), [allActs, today])
  const zoneHist = useMemo(() => {
    const h: number[] = []
    for (const a of acts) {
      if (a.deleted_at || !a.is_ride || !a.hr_histogram) continue
      a.hr_histogram.forEach((v, i) => {
        if (v) h[i] = (h[i] ?? 0) + v
      })
    }
    return h.length ? Array.from(h, (v) => v ?? 0) : null
  }, [acts])

  const weights = useMemo(() => checkins.filter((c) => !c.deleted_at && c.weight_kg != null).map((c) => ({ date: c.date, weight_kg: c.weight_kg as number })), [checkins])
  const wSeries = useMemo(() => weightSeries(weights, s.program_start, s.body_weight_start_kg, s.body_weight_target_kg), [weights, s])
  const trend = useMemo(() => weightTrend(weights), [weights])
  const avg7 = wSeries.at(-1)?.avg7 ?? wSeries.at(-1)?.weight_kg ?? s.body_weight_start_kg
  const activeTests = tests.filter((x) => !x.deleted_at)
  const lastTest = activeTests.at(-1)
  const lastFtp = activeTests.toReversed().find((x) => x.ftp_w)?.ftp_w ?? s.ftp_w_estimate
  const lastLthr = activeTests.toReversed().find((x) => x.lthr_bpm)?.lthr_bpm ?? s.lthr_bpm

  const days = useMemo(() => buildCalendar(engine.ctx), [engine.ctx])
  const volumes = useMemo(
    () => weeklyVolume(days, rides.filter((r) => !r.deleted_at && r.kind === 'bike').map((r) => ({ date: r.date, status: r.status, duration_min: r.duration_min ?? null })), today, 8),
    [days, rides, today],
  )
  const comp = compliance(volumes, 4)


  const [showTestForm, setShowTestForm] = useState(false)
  const [protocol, setProtocol] = useState<'TEST_LTHR' | 'WATTBIKE_TEST' | 'FTP_TEST'>('FTP_TEST')
  const [testDate, setTestDate] = useState(today)

  return (
    <div className="space-y-3">
      <PageTitle
        sub={tp.page.sub}
        right={
          <Link to={`/postep/tydzien/${mondayOf(today)}`} className={buttonClass('secondary', 'sm')}>
            {tp.page.weekReview}
          </Link>
        }
      >
        {tp.page.title}
      </PageTitle>
      <FtpSuggestionCard engine={engine} acts={allActs} />

      {/* na komputerze dwie kolumny: masa + testy + kalkulator | obciążenie + objętość */}
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      <div className="min-w-0 space-y-3 lg:space-y-4">
      <BaselineCard engine={engine} checkins={checkins} acts={allActs} />
      <PowerCard engine={engine} acts={allActs} tests={tests} checkins={checkins} goalFtp={programGoal(engine.ctx.program.goal, avg7 + s.bike_and_kit_kg, s.ftp_w_goal).ftp} />
      <Card>
        <CardTitle icon="⚖️" right={<Metric>{num(avg7)} kg</Metric>}>
          {tp.weight.title}
        </CardTitle>
        {wSeries.length >= 2 ? (
          <div className="h-44">
            <ResponsiveContainer>
              <LineChart data={wSeries.map((p) => ({ ...p, label: fmtDayMonth(p.date) }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${num(Number(v))} kg`} />
                <Line type="monotone" dataKey="weight_kg" name={tp.weight.seriesWeight} stroke="#94a3b8" dot={{ r: 2 }} strokeWidth={1} isAnimationActive={false} />
                <Line type="monotone" dataKey="avg7" name={tp.weight.seriesAvg7} stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="target" name={tp.weight.seriesTarget} stroke="#f59e0b" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{tp.weight.empty}</p>
        )}
        <div className="mt-2 divide-y divide-slate-100 tabular-nums dark:divide-slate-700/80">
          {trend && (
            <Row label={tp.weight.rate}>
              {tp.weight.perWeek(`${trend.kg_per_week > 0 ? '+' : ''}${num(trend.kg_per_week, 2)}`, num(trend.pct_per_week, 1))}
            </Row>
          )}
          <Row label={tp.weight.goal}>{tp.weight.goalValue(num(s.body_weight_target_kg), num(0.45, 2), num(s.body_weight_start_kg))}</Row>
        </div>
        {trend?.warning && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{trend.warning}</p>}
      </Card>

      <Card>
        <CardTitle
          icon="🧪"
          right={
            <Button variant="ghost" size="sm" onClick={() => setShowTestForm((v) => !v)}>
              {showTestForm ? t.common.close : tp.tests.add}
            </Button>
          }
        >
          {tp.tests.title}
        </CardTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat value={lastLthr ?? '—'} label={tp.tests.lthr} />
          <Stat value={lastFtp} label={tp.tests.ftp(!activeTests.some((x) => x.ftp_w))} />
          <Stat value={num(lastFtp / avg7, 2)} label={tp.tests.wkg(num(2.8, 1))} />
        </div>
        {showTestForm && (
          <CardSection>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Select aria-label={tp.tests.protocol} value={protocol} onChange={(e) => setProtocol(e.target.value as typeof protocol)}>
                <option value="FTP_TEST">{tp.tests.protocolFtp}</option>
                <option value="TEST_LTHR">{tp.tests.protocolLthr}</option>
                <option value="WATTBIKE_TEST">{tp.tests.protocolWattbike}</option>
              </Select>
              <Input type="date" aria-label={tp.tests.date} value={testDate} onChange={(e) => setTestDate(e.target.value)} />
            </div>
            <TestResultForm date={testDate} protocol={protocol} program={engine.ctx.program} previousLthr={lastLthr ?? null} onSaved={() => setShowTestForm(false)} />
          </CardSection>
        )}
        {activeTests.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700/80">
            {activeTests.toReversed().map((x) => (
              <li key={x.id} className="py-2">
                <TestSummary t={x} />
              </li>
            ))}
          </ul>
        )}
        {lastTest && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tp.tests.zonesNote(fmtDayMonth(lastTest.date))}</p>
        )}
      </Card>

      <ClimbCalculator riderKg={avg7} watts={lastFtp} bikeKg={s.bike_and_kit_kg} targetKg={s.body_weight_target_kg} targetW={s.ftp_w_goal} />
      </div>

      <div className="min-w-0 space-y-3 lg:space-y-4">
      <PmcCard engine={engine} />
      <CadenceCard acts={allActs} today={today} policy={engine.ctx.program.cadence} />
      <LoadCard acts={allActs} logs={rides} ftp={lastFtp} lthr={lastLthr ?? null} zones={engine.ctx.program.hr_zones_lthr_fraction} today={today} />
      <Card>
        <CardTitle icon="⏱️" right={comp != null ? <Metric>{tp.volume.compliance(comp)}</Metric> : undefined}>
          {tp.volume.title}
        </CardTitle>
        {volumes.length > 0 ? (
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={volumes.map((v) => ({ ...v, label: tp.volume.weekLabel(v.week), plan: +(v.planned_min / 60).toFixed(1), done: +(v.done_min / 60).toFixed(1) }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${num(Number(v))} h`} />
                <Bar dataKey="plan" name={tp.volume.plan} fill="#cbd5e1" isAnimationActive={false} />
                <Bar dataKey="done" name={tp.volume.done} fill="#0ea5e9" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{tp.volume.empty}</p>
        )}
        <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {tp.volume.thisWeek(hours(volumes.at(-1)?.planned_min ?? 0), hours(volumes.at(-1)?.done_min ?? 0))}
        </p>
        {zoneHist && lastLthr ? (
          <CardSection>
            <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{tp.volume.zones(lastLthr)}</p>
            <ZoneBar histogram={zoneHist} zones={engine.ctx.program.hr_zones_lthr_fraction} lthr={lastLthr} />
          </CardSection>
        ) : (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{tp.volume.zonesEmpty(!lastLthr)}</p>
        )}
      </Card>

      </div>
      </div>
    </div>
  )
}

function ClimbCalculator({ riderKg, watts, bikeKg, targetKg, targetW }: { riderKg: number; watts: number; bikeKg: number; targetKg: number; targetW: number }) {
  const [kg, setKg] = useState(Math.round(riderKg))
  const [w, setW] = useState(watts)
  const [km, setKm] = useState(8)
  const [grade, setGrade] = useState(8.8)
  const now = estimateClimb({ riderKg: kg, bikeKg, watts: w, km, gradePct: grade })
  const goal = estimateClimb({ riderKg: targetKg, bikeKg, watts: targetW, km, gradePct: grade })
  const tc = useT().progress.climb
  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, step: number, unit: string) => (
    <label className="block text-sm">
      <span className="flex justify-between">
        <span>{label}</span>
        <b className="tabular-nums">
          {num(value, 1)} {unit}
        </b>
      </span>
      <input type="range" className="mt-1 block min-h-8 w-full accent-sky-600" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </label>
  )
  return (
    <Card>
      <CardTitle icon="⛰️">{tc.title}</CardTitle>
      <div className="space-y-2">
        {slider(tc.riderMass, kg, setKg, 70, 130, 1, 'kg')}
        {slider(tc.power, w, setW, 120, 350, 5, 'W')}
        {slider(tc.length, km, setKm, 1, 25, 0.5, 'km')}
        {slider(tc.grade, grade, setGrade, 2, 15, 0.1, '%')}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="min-w-0 rounded-xl bg-slate-100 p-3 dark:bg-slate-900/60">
          <div className="text-2xl font-bold tabular-nums">{Math.round(now.minutes)} min</div>
          <div className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {tc.now(num(now.kmh, 1), num(now.wkg, 2))}
          </div>
        </div>
        <div className="min-w-0 rounded-xl bg-sky-50 p-3 dark:bg-sky-950/50">
          <div className="text-2xl font-bold tabular-nums">{Math.round(goal.minutes)} min</div>
          <div className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {tc.goal(targetKg, targetW, num(goal.kmh, 1))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{tc.note(num(bikeKg))}</p>
    </Card>
  )
}

/** Duża liczba z podpisem – w kartach Testy i Podsumowanie. */
function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xl leading-7 font-bold tabular-nums">{value}</div>
      <div className="truncate text-xs text-slate-500 dark:text-slate-400" title={label}>
        {label}
      </div>
    </div>
  )
}
