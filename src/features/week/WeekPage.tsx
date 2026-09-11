import { Link, useNavigate, useParams } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { getWeekPlan } from '@/engine/plan'
import { addDays, isValidISODate, mondayOf } from '@/engine/dates'
import { todayISO, fmtRange } from '@/lib/dates'
import { hours, minutes } from '@/lib/format'
import { FLAG_LABEL, PHASE_COLOR, WEEKDAY_SHORT, WEEK_TYPE_LABEL } from '@/lib/labels'
import { Badge, Button, Card, Empty } from '@/components/ui'

export function WeekPage() {
  const { date } = useParams()
  const navigate = useNavigate()
  const engine = useEngine()
  const today = todayISO()
  const monday = date && isValidISODate(date) ? mondayOf(date) : mondayOf(today)
  const days = getWeekPlan(monday, engine.ctx, engine.weeks)
  const first = days[0]
  const planMin = days.reduce((a, d) => a + (d.bike && d.bike.workout_id !== 'TRIP' && d.bike.workout_id !== 'TRAVEL_REST' ? d.bike.duration_min : 0), 0)
  const gymCount = days.filter((d) => d.gym).length
  const isCurrent = mondayOf(today) === monday

  return (
    <div className="space-y-3">
      <nav className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(`/tydzien/${addDays(monday, -7)}`)}>
          ‹
        </Button>
        <div className="text-center">
          <h1 className="text-xl font-bold">{first ? `Tydzień ${first.week}` : 'Tydzień'}</h1>
          <p className="text-xs text-slate-500">{fmtRange(monday, addDays(monday, 6))}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(`/tydzien/${addDays(monday, 7)}`)}>
          ›
        </Button>
      </nav>
      {first && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge color={PHASE_COLOR[first.phase]}>{first.phase_name.replace(/ – .*/, '')}</Badge>
          <span className="text-slate-600 dark:text-slate-300">{WEEK_TYPE_LABEL[first.week_type]}</span>
          <span className="ml-auto text-slate-600 dark:text-slate-300">
            {hours(planMin)} · {gymCount} × siłownia
          </span>
        </div>
      )}
      {!isCurrent && (
        <Link to="/tydzien" className="block text-center text-sm font-semibold text-sky-600">
          Wróć do dziś
        </Link>
      )}
      {days.length === 0 && <Empty>Ten tydzień jest poza planem.</Empty>}
      <ul className="space-y-2">
        {days.map((d) => (
          <li key={d.date}>
            <Link to={`/dzien/${d.date}`} className="block">
              <Card className={d.date === today ? 'ring-2 ring-sky-500' : ''}>
                <div className="flex items-start gap-3">
                  <div className="w-10 shrink-0 text-center">
                    <div className="text-xs font-semibold uppercase text-slate-500">{WEEKDAY_SHORT[d.weekday]}</div>
                    <div className="text-lg font-bold leading-tight">{d.date.slice(8)}</div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {d.bike ? (
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">🚴 {d.bike.name}</span>
                        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">{minutes(d.bike.duration_min)}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">🛋️ {d.gym ? 'Bez roweru' : 'Wolne'}</div>
                    )}
                    {d.gym && (
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">🏋️ {d.gym.name.replace(/^Sesja /, 'Sesja ')}</span>
                        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">~{d.gym.est_min} min</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {d.flags.map((f) => (
                        <Badge key={f} color="bg-slate-500">
                          {FLAG_LABEL[f]}
                        </Badge>
                      ))}
                      {d.event && <Badge color="bg-orange-600">Wydarzenie</Badge>}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {first?.week_notes && <Card tone="warn"><p className="text-sm">{first.week_notes}</p></Card>}
      <p className="text-xs text-slate-400">Status wykonania i zamiana dni (R15) pojawią się w Etapach 2 i 5.</p>
    </div>
  )
}
