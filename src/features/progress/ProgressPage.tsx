import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useEngine } from '@/app/useSettings'
import { db, type Checkin, type SessionLog, type SetLog, type StravaActivity, type TestResult } from '@/db'
import { ZoneBar } from '@/features/today/StravaCard'
import { addDays } from '@/engine/dates'
import { buildCalendar } from '@/engine/calendar'
import { estimateClimb } from '@/engine/climb'
import { compliance, e1rmSeries, weeklyVolume, weightSeries, weightTrend } from '@/engine/progress'
import { Card, CardTitle, PageTitle, Row } from '@/components/ui'
import { hours, num } from '@/lib/format'
import { fmtDayMonth, todayISO } from '@/lib/dates'
import { TestResultForm, TestSummary } from '@/features/today/TestResultCard'

const MAIN = [
  { id: 'back_squat', label: 'Przysiad', goal: [1.0, 1.2] as [number, number] },
  { id: 'trap_bar_deadlift', label: 'Trap bar', goal: [1.3, 1.5] as [number, number] },
  { id: 'hip_thrust', label: 'Hip thrust', goal: [1.3, 1.5] as [number, number] },
  { id: 'step_up', label: 'Step-up', goal: null },
]

export function ProgressPage() {
  const engine = useEngine()
  const s = engine.ctx.settings
  const today = todayISO()
  const checkins = useLiveQuery(() => db.checkins.orderBy('date').toArray(), [], [] as Checkin[])
  const tests = useLiveQuery(() => db.test_results.orderBy('date').toArray(), [], [] as TestResult[])
  const rides = useLiveQuery(() => db.session_logs.toArray(), [], [] as SessionLog[])
  const sets = useLiveQuery(() => db.set_logs.toArray(), [], [] as SetLog[])
  const acts = useLiveQuery(() => db.strava_activities.where('date').aboveOrEqual(addDays(today, -27)).toArray(), [today], [] as StravaActivity[])
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
  const activeTests = tests.filter((t) => !t.deleted_at)
  const lastTest = activeTests.at(-1)
  const lastFtp = activeTests.toReversed().find((t) => t.ftp_w)?.ftp_w ?? s.ftp_w_estimate
  const lastLthr = activeTests.toReversed().find((t) => t.lthr_bpm)?.lthr_bpm ?? s.lthr_bpm

  const days = useMemo(() => buildCalendar(engine.ctx), [engine.ctx])
  const volumes = useMemo(
    () => weeklyVolume(days, rides.filter((r) => !r.deleted_at && r.kind === 'bike').map((r) => ({ date: r.date, status: r.status, duration_min: r.duration_min ?? null })), today, 8),
    [days, rides, today],
  )
  const comp = compliance(volumes, 4)

  const strength = useMemo(() => {
    const logs = new Map(rides.filter((r) => r.kind === 'gym' && !r.deleted_at).map((r) => [r.id, r]))
    const grouped = new Map<string, { date: string; exercise_id: string; sets: SetLog[] }>()
    for (const st of sets) {
      if (st.deleted_at || st.is_warmup) continue
      const l = logs.get(st.session_log_id)
      if (!l) continue
      const k = `${l.id}|${st.exercise_id}`
      const g = grouped.get(k) ?? { date: l.date, exercise_id: st.exercise_id, sets: [] }
      g.sets.push(st)
      grouped.set(k, g)
    }
    return e1rmSeries([...grouped.values()])
  }, [rides, sets])

  const [showTestForm, setShowTestForm] = useState(false)
  const [protocol, setProtocol] = useState<'TEST_LTHR' | 'WATTBIKE_TEST'>('TEST_LTHR')
  const [testDate, setTestDate] = useState(today)

  return (
    <div className="space-y-3">
      <PageTitle sub="Masa, testy, objętość, siła">Postęp</PageTitle>

      {/* na komputerze dwie kolumny: masa + testy + kalkulator | objętość + siła */}
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-3 lg:space-y-4">
      <Card>
        <CardTitle icon="⚖️" right={<span className="text-sm tabular-nums">{num(avg7)} kg</span>}>
          Masa
        </CardTitle>
        {wSeries.length >= 2 ? (
          <div className="h-44">
            <ResponsiveContainer>
              <LineChart data={wSeries.map((p) => ({ ...p, label: fmtDayMonth(p.date) }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${num(Number(v))} kg`} />
                <Line type="monotone" dataKey="weight_kg" name="Waga" stroke="#94a3b8" dot={{ r: 2 }} strokeWidth={1} isAnimationActive={false} />
                <Line type="monotone" dataKey="avg7" name="Śr. 7 dni" stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="target" name="Cel" stroke="#f59e0b" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Wpisuj wagę w porannym check-inie – wykres pojawi się po 2 pomiarach, średnia 7-dniowa po 3.</p>
        )}
        {trend && (
          <Row label="Tempo">
            {trend.kg_per_week > 0 ? '+' : ''}
            {num(trend.kg_per_week, 2)} kg/tydz. ({num(trend.pct_per_week, 1)} %)
          </Row>
        )}
        {trend?.warning && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{trend.warning}</p>}
        <Row label="Cel">
          {s.body_weight_target_kg} kg (0,45 kg/tydz. od {s.body_weight_start_kg} kg)
        </Row>
      </Card>

      <Card>
        <CardTitle icon="🧪" right={<button className="text-sm text-sky-600" onClick={() => setShowTestForm((v) => !v)}>{showTestForm ? 'Zamknij' : '+ Dodaj wynik'}</button>}>
          Testy
        </CardTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold tabular-nums">{lastLthr ?? '—'}</div>
            <div className="text-xs text-slate-500">LTHR bpm</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{lastFtp}</div>
            <div className="text-xs text-slate-500">FTP W{!activeTests.some((t) => t.ftp_w) && ' (szac.)'}</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{num(lastFtp / avg7, 2)}</div>
            <div className="text-xs text-slate-500">W/kg (cel 2,8)</div>
          </div>
        </div>
        {showTestForm && (
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900" value={protocol} onChange={(e) => setProtocol(e.target.value as typeof protocol)}>
                <option value="TEST_LTHR">Test terenowy 30 min</option>
                <option value="WATTBIKE_TEST">Wattbike 20 min</option>
              </select>
              <input type="date" className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
            </div>
            <TestResultForm date={testDate} protocol={protocol} program={engine.ctx.program} previousLthr={lastLthr ?? null} onSaved={() => setShowTestForm(false)} />
          </div>
        )}
        {activeTests.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
            {activeTests.toReversed().map((t) => (
              <li key={t.id} className="py-2">
                <TestSummary t={t} />
              </li>
            ))}
          </ul>
        )}
        {lastTest && (
          <p className="mt-2 text-xs text-slate-500">Strefy liczone z ostatniego testu ({fmtDayMonth(lastTest.date)}) obowiązują od dnia po teście (R11).</p>
        )}
      </Card>

      <ClimbCalculator riderKg={avg7} watts={lastFtp} bikeKg={s.bike_and_kit_kg} targetKg={s.body_weight_target_kg} targetW={s.ftp_w_goal} />
      </div>

      <div className="space-y-3 lg:space-y-4">
      <Card>
        <CardTitle icon="⏱️" right={comp != null ? <span className="text-sm">zgodność {comp} %</span> : undefined}>
          Objętość (8 tygodni)
        </CardTitle>
        {volumes.length > 0 ? (
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={volumes.map((v) => ({ ...v, label: `T${v.week}`, plan: +(v.planned_min / 60).toFixed(1), done: +(v.done_min / 60).toFixed(1) }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${num(Number(v))} h`} />
                <Bar dataKey="plan" name="Plan" fill="#cbd5e1" isAnimationActive={false} />
                <Bar dataKey="done" name="Wykonanie" fill="#0ea5e9" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Brak tygodni w planie.</p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          Ten tydzień: plan {hours(volumes.at(-1)?.planned_min ?? 0)}, wykonanie {hours(volumes.at(-1)?.done_min ?? 0)}.
        </p>
        {zoneHist && lastLthr ? (
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-slate-500">Czas w strefach – ostatnie 4 tygodnie (Strava, LTHR {lastLthr})</p>
            <ZoneBar histogram={zoneHist} zones={engine.ctx.program.hr_zones_lthr_fraction} lthr={lastLthr} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">Rozkład czasu w strefach pojawi się po połączeniu ze Stravą{lastLthr ? '' : ' i wpisaniu LTHR'}.</p>
        )}
      </Card>

      <Card>
        <CardTitle icon="🏋️">Siła (e1RM)</CardTitle>
        {strength.length === 0 ? (
          <p className="text-sm text-slate-500">Zapisuj serie w trybie siłowni – tu pojawi się e1RM przysiadu, trap bara, hip thrustu i step-upu.</p>
        ) : (
          <ul className="space-y-2">
            {MAIN.map((m) => {
              const pts = strength.filter((p) => p.exercise_id === m.id)
              if (pts.length === 0) return null
              const last = pts.at(-1)!
              return (
                <li key={m.id} className="text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{m.label}</span>
                    <span className="tabular-nums">
                      {num(last.e1rm, 0)} kg <span className="text-xs text-slate-500">({num(last.best_set.weight_kg)}×{last.best_set.reps}, {fmtDayMonth(last.date)})</span>
                    </span>
                  </div>
                  {pts.length >= 2 && (
                    <div className="h-20">
                      <ResponsiveContainer>
                        <LineChart data={pts.map((p) => ({ label: fmtDayMonth(p.date), e1rm: Math.round(p.e1rm) }))} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} minTickGap={20} />
                          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9 }} />
                          <Tooltip formatter={(v) => `${v} kg`} />
                          {m.goal && <ReferenceLine y={Math.round(m.goal[0] * 95)} stroke="#f59e0b" strokeDasharray="3 3" />}
                          <Line type="monotone" dataKey="e1rm" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {m.goal && <div className="text-xs text-slate-500">Cel na koniec lutego: {m.goal[0]}–{m.goal[1]} × masa ciała (5 powt.) ≈ {Math.round(m.goal[0] * 95)}–{Math.round(m.goal[1] * 95)} kg przy 95 kg</div>}
                </li>
              )
            })}
          </ul>
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
  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, step: number, unit: string) => (
    <label className="block text-sm">
      <span className="flex justify-between">
        <span>{label}</span>
        <b className="tabular-nums">
          {num(value, 1)} {unit}
        </b>
      </span>
      <input type="range" className="mt-1 w-full" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </label>
  )
  return (
    <Card>
      <CardTitle icon="⛰️">Kalkulator podjazdu</CardTitle>
      <div className="space-y-2">
        {slider('Masa kolarza', kg, setKg, 70, 130, 1, 'kg')}
        {slider('Moc', w, setW, 120, 350, 5, 'W')}
        {slider('Długość', km, setKm, 1, 25, 0.5, 'km')}
        {slider('Nachylenie', grade, setGrade, 2, 15, 0.1, '%')}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-slate-100 p-2 dark:bg-slate-700/50">
          <div className="text-2xl font-bold tabular-nums">{Math.round(now.minutes)} min</div>
          <div className="text-xs text-slate-500">
            teraz · {num(now.kmh, 1)} km/h · {num(now.wkg, 2)} W/kg
          </div>
        </div>
        <div className="rounded-xl bg-sky-50 p-2 dark:bg-sky-950/40">
          <div className="text-2xl font-bold tabular-nums">{Math.round(goal.minutes)} min</div>
          <div className="text-xs text-slate-500">
            cel: {targetKg} kg / {targetW} W · {num(goal.kmh, 1)} km/h
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Rower + bagaż {num(bikeKg)} kg, Crr 0,005, CdA 0,45 m². Czas zmieniają tylko moc i masa – przełożenie 40/50 daje kadencję, nie prędkość.</p>
    </Card>
  )
}
