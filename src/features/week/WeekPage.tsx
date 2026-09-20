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
import { DAY_TYPE_COLOR, FLAG_COLOR, FLAG_LABEL, PHASE_COLOR, WEEKDAY_SHORT, WEEK_TYPE_LABEL } from '@/lib/labels'
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
    <div className="space-y-3 lg:space-y-4">
      <nav className="flex items-center justify-between lg:justify-start lg:gap-2">
        <Button variant="ghost" onClick={() => navigate(`/tydzien/${addDays(monday, -7)}`)}>
          ‹
        </Button>
        <div className="text-center lg:min-w-56">
          <h1 className="text-xl font-bold tracking-tight lg:text-3xl">{first ? `Tydzień ${first.week}` : 'Tydzień'}</h1>
          <p className="text-xs text-slate-500 lg:text-sm">{fmtRange(monday, addDays(monday, 6))}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(`/tydzien/${addDays(monday, 7)}`)}>
          ›
        </Button>
        {!isCurrent && (
          <Link to="/tydzien" className="hidden text-sm font-semibold text-sky-600 lg:ml-2 lg:block">
            Wróć do dziś
          </Link>
        )}
      </nav>
      {first && (
        <div className="flex flex-wrap items-center gap-2 text-sm lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:px-4 lg:py-2.5 lg:dark:border-slate-700 lg:dark:bg-slate-800">
          <Badge color={PHASE_COLOR[first.phase]}>{first.phase_name.replace(/ – .*/, '')}</Badge>
          <span className="text-slate-600 dark:text-slate-300">{WEEK_TYPE_LABEL[first.week_type]}</span>
          <span className="ml-auto text-slate-600 tabular-nums dark:text-slate-300 lg:text-base">
            {hours(doneMin)} z {hours(planMin)} · siłownia {gymDone}/{gymCount}
          </span>
        </div>
      )}
      {!isCurrent && (
        <Link to="/tydzien" className="block text-center text-sm font-semibold text-sky-600 lg:hidden">
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
      <ul className="space-y-2 lg:grid lg:grid-cols-7 lg:gap-3 lg:space-y-0">
        {days.map((d) => {
          const bikeLog = logs.find((l) => l.date === d.date && l.kind === 'bike')
          const gymLog = logs.find((l) => l.date === d.date && l.kind === 'gym')
          const dayOverrides = overrides.filter((o) => o.date === d.date)
          const selectable = swapFrom && swapFrom !== d.date
          const isToday = d.date === today
          return (
            <li key={d.date} className="lg:flex">
              <Card className={`h-full w-full lg:flex lg:flex-col lg:p-3 ${isToday ? 'ring-2 ring-sky-500' : ''} ${selectable ? 'ring-2 ring-amber-400' : ''}`}>
                {/* telefon: wiersz (data | treść | zamiana); komputer: kolumna (data | treść | zamiana na dole) */}
                <div className="flex items-start gap-3 lg:flex-1 lg:flex-col lg:gap-2">
                  <div className="w-10 shrink-0 text-center lg:flex lg:w-full lg:items-baseline lg:gap-1.5 lg:border-b lg:border-slate-100 lg:pb-2 lg:text-left lg:dark:border-slate-700">
                    <div className={`text-xs font-semibold uppercase ${d.weekday === 'sat' || d.weekday === 'sun' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500'}`}>{WEEKDAY_SHORT[d.weekday]}</div>
                    <div className={`text-lg font-bold leading-tight tabular-nums ${isToday ? 'text-sky-600 dark:text-sky-400' : ''}`}>{d.date.slice(8)}</div>
                    {d.bike && <span className={`ml-auto hidden h-2 w-2 rounded-full lg:block ${DAY_TYPE_COLOR[d.day_type]}`} title={d.bike.name} />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 lg:w-full lg:space-y-1.5">
                    {d.bike ? (
                      <div className="flex items-baseline justify-between gap-2 text-sm lg:flex-col lg:gap-0">
                        <Link to={`/dzien/${d.date}`} className="truncate hover:text-sky-600 lg:whitespace-normal lg:font-medium lg:leading-snug">
                          🚴 {d.bike.name}
                        </Link>
                        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300 lg:text-xs">{minutes(d.bike.duration_min)}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">🛋️ {d.gym ? 'Bez roweru' : 'Wolne'}</div>
                    )}
                    {d.gym && (
                      <div className="flex items-baseline justify-between gap-2 text-sm lg:flex-col lg:gap-0">
                        <Link to={`/silownia/${d.date}`} className="truncate hover:text-sky-600 lg:whitespace-normal lg:font-medium lg:leading-snug">
                          🏋️ {d.gym.name}
                        </Link>
                        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300 lg:text-xs">~{d.gym.est_min} min</span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1">
                      {bikeLog && bikeLog.status !== 'planned' && <StatusBadge status={bikeLog.status} />}
                      {gymLog && gymLog.status !== 'planned' && <StatusBadge status={gymLog.status} />}
                      {d.flags.map((f) => (
                        <Badge key={f} color={FLAG_COLOR[f]}>
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
                    {d.event && <p className="hidden text-xs text-orange-600 lg:block dark:text-orange-400">{d.event}</p>}
                  </div>
                  <div className="shrink-0 lg:mt-auto lg:w-full lg:border-t lg:border-slate-100 lg:pt-2 lg:dark:border-slate-700">
                    {selectable ? (
                      <button onClick={() => trySwap(d.date)} className="min-h-11 rounded-lg bg-amber-500 px-2 text-xs font-semibold text-white hover:bg-amber-400 lg:min-h-9 lg:w-full">
                        Tu
                      </button>
                    ) : (
                      <button onClick={() => setSwapFrom(d.date)} className="min-h-11 px-2 text-xs text-slate-400 hover:text-sky-600 lg:min-h-9 lg:w-full lg:rounded-lg lg:hover:bg-slate-100 lg:dark:hover:bg-slate-700" aria-label={`Zamień dzień ${d.date}`}>
                        ⇅<span className="hidden lg:inline"> Zamień</span>
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
