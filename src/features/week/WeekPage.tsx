import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useWeekView } from '@/app/usePlan'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PlanOverrideRow, type SessionLog } from '@/db'
import { addOverride, removeOverride } from '@/db/repo'
import { validateSwap } from '@/engine/rules'
import { addDays, isValidISODate, mondayOf } from '@/engine/dates'
import { todayISO, fmtRange } from '@/lib/dates'
import { hours, minutes } from '@/lib/format'
import { FLAG_LABEL, PHASE_COLOR, WEEKDAY_SHORT, WEEK_TYPE_LABEL } from '@/lib/labels'
import { Badge, Button, Card, Empty } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { StatusBadge } from '@/features/today/BikeLogCard'

export function WeekPage() {
  const { date } = useParams()
  const navigate = useNavigate()
  const today = todayISO()
  const monday = date && isValidISODate(date) ? mondayOf(date) : mondayOf(today)
  const { days, window } = useWeekView(monday)
  const toast = useToast()
  const [swapFrom, setSwapFrom] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const logs = useLiveQuery(async () => (await db.session_logs.where('date').between(monday, addDays(monday, 6), true, true).toArray()).filter((l) => !l.deleted_at), [monday], [] as SessionLog[])
  const overrides = useLiveQuery(async () => (await db.plan_overrides.where('date').between(monday, addDays(monday, 6), true, true).toArray()).filter((o) => !o.deleted_at), [monday], [] as PlanOverrideRow[])

  const first = days[0]
  const planMin = days.reduce((a, d) => a + (d.bike && d.bike.workout_id !== 'TRIP' && d.bike.workout_id !== 'TRAVEL_REST' ? d.bike.duration_min : 0), 0)
  const doneMin = logs.filter((l) => l.kind === 'bike' && (l.status === 'done' || l.status === 'modified')).reduce((a, l) => a + (l.duration_min ?? 0), 0)
  const gymCount = days.filter((d) => d.gym).length
  const gymDone = logs.filter((l) => l.kind === 'gym' && (l.status === 'done' || l.status === 'modified')).length
  const isCurrent = mondayOf(today) === monday

  async function trySwap(target: string) {
    if (!swapFrom) return
    const check = validateSwap(swapFrom, target, window)
    if (!check.ok) {
      setMsg(check.reason ?? 'Nie można zamienić tych dni.')
      toast.notify('Nie można zamienić tych dni', 'error', check.reason)
      setSwapFrom(null)
      return
    }
    const from = swapFrom
    setSwapFrom(null)
    await toast.run('Zamieniam dni…', () => addOverride(from, 'swap', { swap_with: target }), () => 'Dni zamienione')
    setMsg('Dni zamienione.')
  }

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
            {hours(doneMin)} z {hours(planMin)} · siłownia {gymDone}/{gymCount}
          </span>
        </div>
      )}
      {!isCurrent && (
        <Link to="/tydzien" className="block text-center text-sm font-semibold text-sky-600">
          Wróć do dziś
        </Link>
      )}
      {msg && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/40">
          {msg}
          <button className="ml-2 text-xs underline" onClick={() => setMsg(null)}>
            ok
          </button>
        </p>
      )}
      {swapFrom && <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm dark:bg-amber-950/40">Wybierz dzień, z którym zamienić {swapFrom.slice(8)}.{swapFrom.slice(5, 7)}. <button className="underline" onClick={() => setSwapFrom(null)}>Anuluj</button></p>}
      {days.length === 0 && <Empty>Ten tydzień jest poza planem.</Empty>}
      <ul className="space-y-2">
        {days.map((d) => {
          const bikeLog = logs.find((l) => l.date === d.date && l.kind === 'bike')
          const gymLog = logs.find((l) => l.date === d.date && l.kind === 'gym')
          const dayOverrides = overrides.filter((o) => o.date === d.date)
          const selectable = swapFrom && swapFrom !== d.date
          return (
            <li key={d.date}>
              <Card className={`${d.date === today ? 'ring-2 ring-sky-500' : ''} ${selectable ? 'ring-2 ring-amber-400' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 shrink-0 text-center">
                    <div className="text-xs font-semibold uppercase text-slate-500">{WEEKDAY_SHORT[d.weekday]}</div>
                    <div className="text-lg font-bold leading-tight">{d.date.slice(8)}</div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {d.bike ? (
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <Link to={`/dzien/${d.date}`} className="truncate">
                          🚴 {d.bike.name}
                        </Link>
                        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">{minutes(d.bike.duration_min)}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">🛋️ {d.gym ? 'Bez roweru' : 'Wolne'}</div>
                    )}
                    {d.gym && (
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <Link to={`/silownia/${d.date}`} className="truncate">
                          🏋️ {d.gym.name}
                        </Link>
                        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">~{d.gym.est_min} min</span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1">
                      {bikeLog && bikeLog.status !== 'planned' && <StatusBadge status={bikeLog.status} />}
                      {gymLog && gymLog.status !== 'planned' && <StatusBadge status={gymLog.status} />}
                      {d.flags.map((f) => (
                        <Badge key={f} color="bg-slate-500">
                          {FLAG_LABEL[f]}
                        </Badge>
                      ))}
                      {d.event && <Badge color="bg-orange-600">Wydarzenie</Badge>}
                      {dayOverrides.map((o) => (
                        <button key={o.id} onClick={() => toast.run('Cofam zmianę…', () => removeOverride(o.id), () => 'Przywrócono plan')} className="rounded-full bg-sky-600 px-2 py-0.5 text-xs text-white">
                          zmienione ✕
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {selectable ? (
                      <button onClick={() => trySwap(d.date)} className="min-h-11 rounded-lg bg-amber-500 px-2 text-xs font-semibold text-white">
                        Tu
                      </button>
                    ) : (
                      <button onClick={() => setSwapFrom(d.date)} className="min-h-11 px-2 text-xs text-slate-400" aria-label={`Zamień dzień ${d.date}`}>
                        ⇅
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
      {first?.week_notes && (
        <Card tone="warn">
          <p className="text-sm">{first.week_notes}</p>
        </Card>
      )}
      <p className="text-xs text-slate-400">Zamiana dni pilnuje reguł: żadnych dwóch akcentów pod rząd i żadnej sesji z nogami krócej niż 48 h przed testem, górami czy blokiem.</p>
    </div>
  )
}
