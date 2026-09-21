import { Link } from 'react-router'
import type { DayPlan } from '@/engine/plan'
import type { Engine } from '@/app/useSettings'
import { Badge, Button, buttonClass, Card, CardSection, CardTitle, Inset, Metric, Row } from '@/components/ui'
import { StepList, TimelineBar } from '@/components/StepTimeline'
import { fmtLong } from '@/lib/dates'
import { days, minutes, num } from '@/lib/format'
import { FLAG_COLOR, FLAG_LABEL, PHASE_COLOR, WEEK_TYPE_LABEL } from '@/lib/labels'
import { GymItems } from './GymItems'
import { CheckinCard } from './CheckinCard'
import { BikeLogCard, StatusBadge } from './BikeLogCard'
import { TestResultCard } from './TestResultCard'
import { StravaActivities } from './StravaCard'
import { RulesCard } from './RulesCard'
import type { PlanOverrideRow } from '@/db'
import type { RuleAction, RuleWarning } from '@/engine/rules'
import { WahooButton } from './WahooButton'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'

function typeBadges(day: DayPlan) {
  const out: { label: string; color: string }[] = []
  if (day.week_type === 'test' && !day.flags.includes('test')) out.push({ label: 'Tydzień testowy', color: 'bg-indigo-500' })
  for (const f of day.flags) out.push({ label: FLAG_LABEL[f], color: FLAG_COLOR[f] })
  return out
}

/** Hierarchia: data (podpis) → tydzień i faza (tytuł) → typ tygodnia i odliczanie. */
export function DayHeader({ day }: { day: DayPlan }) {
  const countdown = day.days_to_trip > 0 ? `${days(day.days_to_trip)} do wyjazdu` : day.days_to_trip === 0 ? 'Dzień wyjazdu!' : 'Wyjazd trwa'
  return (
    <header className="mb-3 lg:mb-5 lg:border-b lg:border-slate-200 lg:pb-4 lg:dark:border-slate-700">
      <p className="text-sm font-medium text-slate-500 first-letter:uppercase dark:text-slate-400">{fmtLong(day.date)}</p>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Tydzień {day.week}</h1>
        <Badge color={PHASE_COLOR[day.phase]}>{day.phase_name.replace(/ – .*/, '')}</Badge>
        {typeBadges(day).map((b) => (
          <Badge key={b.label} color={b.color}>
            {b.label}
          </Badge>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <span>{WEEK_TYPE_LABEL[day.week_type]}</span>
        <span className="rounded-full bg-sky-100 px-3 py-0.5 text-sm font-semibold tabular-nums text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">{countdown}</span>
      </div>
    </header>
  )
}

export function BikeCard({ day, engine, onAction }: { day: DayPlan; engine: Engine; onAction?: (a: RuleAction) => void }) {
  const w = day.workout
  const program = engine.ctx.program
  if (!day.bike || !w) {
    return (
      <>
        <Card tone="muted">
          <CardTitle icon="🛋️">Dzień wolny</CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-300">{day.gym ? 'Dziś bez roweru – tylko siłownia.' : 'Pełny odpoczynek. Spacer, sen, 5 min rozciągania zginaczy bioder.'}</p>
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
      <CardTitle icon="🚴" right={<Metric>{minutes(day.bike.duration_min)}</Metric>}>
        {w.name}
      </CardTitle>
      <p className="mb-3 text-xs leading-4 text-slate-500 dark:text-slate-400">Rower: {day.bike.bike}</p>
      <TimelineBar steps={w.steps} />
      {!lthr && !day.ftp && (
        <Link to="/wiecej/ustawienia" className="mt-3 block">
          <Inset tone="warn" className="font-medium hover:underline">
            Zrób test i wpisz LTHR, żeby zobaczyć tętno w bpm. Do tego czasu jedź po RPE.
          </Inset>
        </Link>
      )}
      <div className="mt-2">
        <StepList workout={w} compact={w.steps.length > 6} />
      </div>
      <CardSection>
        <p className="text-sm text-slate-600 dark:text-slate-300">{w.description}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {carbs[1] > 0 && <span>Jedzenie: {carbs[0]}–{carbs[1]} g węgli/h</span>}
          {day.bike.duration_min >= 60 && <span>Picie: 500–750 ml/h</span>}
        </div>
      </CardSection>
      {day.fallback_workout && (
        <details className="mt-3 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-900/60">
          <summary className="min-h-6 cursor-pointer font-medium">🧊 Wersja pod dachem: {day.fallback_workout.name}</summary>
          <div className="mt-2">
            <TimelineBar steps={day.fallback_workout.steps} />
            <StepList workout={day.fallback_workout} compact />
          </div>
        </details>
      )}
      {onAction && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => onAction({ kind: 'indoor', date: day.date, label: '', payload: {} })} className="whitespace-normal">
            🧊 Gołoledź / pod dachem
          </Button>
          <Button variant="secondary" onClick={() => onAction({ kind: 'sick', date: day.date, label: '', payload: { level: 'cold' } })} className="whitespace-normal">
            🤒 Choroba
          </Button>
        </div>
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
  const label = log && log.status !== 'planned' && log.status !== 'skipped' ? (log.status === 'in_progress' ? 'Kontynuuj sesję' : 'Otwórz sesję') : 'Start sesji'
  return (
    <Card>
      <CardTitle icon="🏋️" right={<Metric>~{day.gym.est_min} min</Metric>}>
        {day.gym.name}
      </CardTitle>
      <GymItems session={day.gym} program={engine.ctx.program} />
      <CardSection className="flex items-center gap-3">
        <Link to={`/silownia/${day.date}`} className={buttonClass('primary', 'md', 'min-h-12 flex-1')}>
          {label}
        </Link>
        {log && log.status !== 'planned' && <StatusBadge status={log.status} />}
      </CardSection>
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
      <div className="mt-1 divide-y divide-slate-200/70 dark:divide-slate-700/80">
        <Row label="Białko">
          <span className="tabular-nums">{day.protein_g} g</span> <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({num(n.protein_g_per_kg)} g/kg × {target} kg)</span>
        </Row>
        {n.on_bike_carbs_g_per_h[1] > 0 && (
          <Row label="Na rowerze">
            <span className="tabular-nums">
              {n.on_bike_carbs_g_per_h[0]}–{n.on_bike_carbs_g_per_h[1]} g węgli/h
            </span>
          </Row>
        )}
        {n.post_workout && <Row label="Po treningu">{n.post_workout}</Row>}
      </div>
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

export function DayView({ day, engine, warnings = [], overrides = [], onAction, onUndo }: { day: DayPlan; engine: Engine; warnings?: RuleWarning[]; overrides?: PlanOverrideRow[]; onAction?: (a: RuleAction) => void; onUndo?: (id: string) => void }) {
  const testProtocol = day.bike && ['TEST_LTHR', 'WATTBIKE_TEST', 'FTP_TEST'].includes(day.bike.workout_id) ? (day.bike.workout_id as 'TEST_LTHR' | 'WATTBIKE_TEST' | 'FTP_TEST') : null
  return (
    <div className="space-y-3 lg:space-y-4">
      <DayHeader day={day} />
      <CheckinCard date={day.date} />
      {onAction && onUndo && <RulesCard warnings={warnings} overrides={overrides} onAction={onAction} onUndo={onUndo} />}
      <NotesCard day={day} />
      {/* na komputerze: rower (szerszy) po lewej, siłownia i żywienie po prawej */}
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-5">
        <div className="min-w-0 space-y-3 lg:space-y-4">
          <BikeCard day={day} engine={engine} onAction={onAction} />
          {testProtocol && <TestResultCard date={day.date} protocol={testProtocol} program={engine.ctx.program} previousLthr={day.lthr} />}
        </div>
        <div className="min-w-0 space-y-3 lg:space-y-4">
          <GymCard day={day} engine={engine} />
          <NutritionCard day={day} engine={engine} />
        </div>
      </div>
    </div>
  )
}
