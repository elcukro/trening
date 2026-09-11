import { Link } from 'react-router'
import type { DayPlan } from '@/engine/plan'
import type { Engine } from '@/app/useSettings'
import { Badge, Card, CardTitle, Row } from '@/components/ui'
import { StepList, TimelineBar } from '@/components/StepTimeline'
import { fmtLong } from '@/lib/dates'
import { days, minutes, num } from '@/lib/format'
import { FLAG_LABEL, PHASE_COLOR, WEEK_TYPE_LABEL } from '@/lib/labels'
import { GymItems } from './GymItems'
import { CheckinCard } from './CheckinCard'
import { BikeLogCard, StatusBadge } from './BikeLogCard'
import { TestResultCard } from './TestResultCard'
import { StravaActivities } from './StravaCard'
import { WahooButton } from './WahooButton'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'

function typeBadges(day: DayPlan) {
  const out: { label: string; color: string }[] = []
  if (day.week_type === 'test' && !day.flags.includes('test')) out.push({ label: 'Tydzień testowy', color: 'bg-indigo-500' })
  for (const f of day.flags) {
    const color = { test: 'bg-indigo-600', deload: 'bg-teal-600', mountain_weekend: 'bg-orange-600', back_to_back: 'bg-red-600', heat: 'bg-amber-500' }[f]
    out.push({ label: FLAG_LABEL[f], color })
  }
  return out
}

export function DayHeader({ day }: { day: DayPlan }) {
  const countdown = day.days_to_trip > 0 ? `${days(day.days_to_trip)} do wyjazdu` : day.days_to_trip === 0 ? 'Dzień wyjazdu!' : 'Wyjazd trwa'
  return (
    <header className="mb-3">
      <p className="text-sm text-slate-500 dark:text-slate-400 first-letter:uppercase">{fmtLong(day.date)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Tydzień {day.week}</h1>
        <Badge color={PHASE_COLOR[day.phase]}>{day.phase_name.replace(/ – .*/, '')}</Badge>
        {typeBadges(day).map((b) => (
          <Badge key={b.label} color={b.color}>
            {b.label}
          </Badge>
        ))}
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {WEEK_TYPE_LABEL[day.week_type]} · <span className="font-semibold">{countdown}</span>
      </p>
    </header>
  )
}

export function BikeCard({ day, engine }: { day: DayPlan; engine: Engine }) {
  const w = day.workout
  const program = engine.ctx.program
  if (!day.bike || !w) {
    return (
      <>
        <Card tone="muted">
          <CardTitle icon="🛋️">Dzień wolny</CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {day.gym ? 'Dziś bez roweru – tylko siłownia.' : 'Pełny odpoczynek. Spacer, sen, 5 min rozciągania zginaczy bioder.'}
          </p>
        </Card>
        <StravaActivities date={day.date} zones={program.hr_zones_lthr_fraction} lthr={day.lthr} extra />
      </>
    )
  }
  if (day.bike.workout_id === 'TRIP') {
    return (
      <Card tone="accent">
        <CardTitle icon="🏔️">Wyjazd w Alpy</CardTitle>
        <p className="text-sm">{w.description}</p>
      </Card>
    )
  }
  if (day.bike.workout_id === 'TRAVEL_REST') {
    return (
      <Card tone="muted">
        <CardTitle icon="🚗">Dojazd / odpoczynek</CardTitle>
        <p className="text-sm">{w.description}</p>
      </Card>
    )
  }
  const lthr = day.lthr
  const carbs = day.nutrition.on_bike_carbs_g_per_h
  return (
    <Card>
      <CardTitle icon="🚴" right={<span className="text-sm font-semibold tabular-nums">{minutes(day.bike.duration_min)}</span>}>
        {w.name}
      </CardTitle>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Rower: {day.bike.bike}</p>
      <TimelineBar steps={w.steps} />
      {!lthr && (
        <Link to="/wiecej/ustawienia" className="mt-2 block rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          Zrób test i wpisz LTHR, żeby zobaczyć tętno w bpm. Do tego czasu jedź po RPE.
        </Link>
      )}
      <div className="mt-2">
        <StepList workout={w} compact={w.steps.length > 6} />
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{w.description}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-500">
        {carbs[1] > 0 && <span>Jedzenie: {carbs[0]}–{carbs[1]} g węgli/h</span>}
        {day.bike.duration_min >= 60 && <span>Picie: 500–750 ml/h</span>}
      </div>
      {day.fallback_workout && (
        <details className="mt-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-700/50">
          <summary className="cursor-pointer font-medium">🧊 Gołoledź / pod dachem: {day.fallback_workout.name}</summary>
          <div className="mt-2">
            <TimelineBar steps={day.fallback_workout.steps} />
            <StepList workout={day.fallback_workout} compact />
            <p className="mt-2 text-xs text-slate-500">Przycisk podmiany treningu (R4) pojawi się w Etapie 5. Na Bolcie wybierz „Wersja pod dachem”.</p>
          </div>
        </details>
      )}
      <WahooButton day={day} />
      <StravaActivities date={day.date} zones={program.hr_zones_lthr_fraction} lthr={day.lthr} />
      <BikeLogCard day={day} />
    </Card>
  )
}

export function GymCard({ day, engine }: { day: DayPlan; engine: Engine }) {
  const log = useLiveQuery(async () => (await db.session_logs.where('[date+kind]').equals([day.date, 'gym']).toArray()).find((r) => !r.deleted_at), [day.date])
  if (!day.gym) return null
  return (
    <Card>
      <CardTitle icon="🏋️" right={<span className="text-sm font-semibold tabular-nums">~{day.gym.est_min} min</span>}>
        {day.gym.name}
      </CardTitle>
      <GymItems session={day.gym} program={engine.ctx.program} />
      <div className="mt-3 flex items-center gap-3">
        <Link to={`/silownia/${day.date}`} className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-sky-600 text-sm font-semibold text-white">
          {log && log.status !== 'planned' && log.status !== 'skipped' ? (log.status === 'in_progress' ? 'Kontynuuj sesję' : 'Otwórz sesję') : 'Start sesji'}
        </Link>
        {log && log.status !== 'planned' && <StatusBadge status={log.status} />}
      </div>
    </Card>
  )
}

export function NutritionCard({ day, engine }: { day: DayPlan; engine: Engine }) {
  const n = day.nutrition
  const target = engine.ctx.settings.body_weight_target_kg
  const tone = n.energy.startsWith('deficit') ? 'default' : 'accent'
  return (
    <Card tone={tone}>
      <CardTitle icon="🍽️">Żywienie</CardTitle>
      <p className="text-sm font-medium">{n.label}</p>
      <Row label="Białko">
        {day.protein_g} g <span className="text-xs font-normal text-slate-500">({num(n.protein_g_per_kg)} g/kg × {target} kg)</span>
      </Row>
      {n.on_bike_carbs_g_per_h[1] > 0 && <Row label="Na rowerze">{n.on_bike_carbs_g_per_h[0]}–{n.on_bike_carbs_g_per_h[1]} g węgli/h</Row>}
      {n.post_workout && <Row label="Po treningu">{n.post_workout}</Row>}
    </Card>
  )
}

export function NotesCard({ day }: { day: DayPlan }) {
  if (!day.week_notes && !day.event && day.warnings.length === 0) return null
  return (
    <Card tone="warn">
      <CardTitle icon="📌">Uwagi</CardTitle>
      <ul className="space-y-1 text-sm">
        {day.event && <li className="font-medium">{day.event}</li>}
        {day.week_notes && <li>{day.week_notes}</li>}
        {day.warnings.map((w) => (
          <li key={w.rule} className="text-amber-900 dark:text-amber-200">
            {w.message}
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function DayView({ day, engine }: { day: DayPlan; engine: Engine }) {
  const testProtocol = day.bike?.workout_id === 'TEST_LTHR' || day.bike?.workout_id === 'WATTBIKE_TEST' ? day.bike.workout_id : null
  return (
    <div className="space-y-3">
      <DayHeader day={day} />
      <CheckinCard date={day.date} />
      <NotesCard day={day} />
      <BikeCard day={day} engine={engine} />
      {testProtocol && <TestResultCard date={day.date} protocol={testProtocol} program={engine.ctx.program} previousLthr={day.lthr} />}
      <GymCard day={day} engine={engine} />
      <NutritionCard day={day} engine={engine} />
    </div>
  )
}
