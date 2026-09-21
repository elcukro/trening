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
import { Badge, Button, Card, Empty, Inset } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { StatusBadge } from '@/features/today/BikeLogCard'

/*
 * Układ: telefon i 1024–1279 px – lista dni (wiersz: data | treść | zamiana);
 * od 1280 px – siedem równych kolumn. Przy 1024 px siedem kolumn miało po ~90 px
 * i nazwy treningów łamały się słowo po słowie.
 */
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
      <nav className="flex items-center justify-between lg:justify-start lg:gap-2" aria-label="Sąsiednie tygodnie">
        <Button variant="ghost" onClick={() => navigate(`/tydzien/${addDays(monday, -7)}`)} className="w-11 px-0 text-xl">
          ‹
        </Button>
        <div className="min-w-0 text-center lg:min-w-56">
          <h1 className="text-2xl font-bold tracking-tight">{first ? `Tydzień ${first.week}` : 'Tydzień'}</h1>
          <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{fmtRange(monday, addDays(monday, 6))}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(`/tydzien/${addDays(monday, 7)}`)} className="w-11 px-0 text-xl">
          ›
        </Button>
        {!isCurrent && (
          <Link to="/tydzien" className="hidden text-sm font-semibold text-sky-700 hover:underline lg:ml-2 lg:block dark:text-sky-300">
            Wróć do dziś
          </Link>
        )}
      </nav>
      {first && (
        <div className="flex flex-wrap items-center gap-2 text-sm lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:px-4 lg:py-2.5 lg:shadow-card lg:dark:border-slate-700 lg:dark:bg-slate-800">
          <Badge color={PHASE_COLOR[first.phase]}>{first.phase_name.replace(/ – .*/, '')}</Badge>
          <span className="text-slate-600 dark:text-slate-300">{WEEK_TYPE_LABEL[first.week_type]}</span>
          <span className="ml-auto text-slate-600 tabular-nums dark:text-slate-300">
            {hours(doneMin)} z {hours(planMin)} · siłownia {gymDone}/{gymCount}
          </span>
        </div>
      )}
      {!isCurrent && (
        <Link to="/tydzien" className="block text-center text-sm font-semibold text-sky-700 lg:hidden dark:text-sky-300">
          Wróć do dziś
        </Link>
      )}
      {msg && (
        <Inset tone="info" className="flex items-center justify-between gap-2">
          <span>{msg}</span>
          <button className="min-h-9 shrink-0 px-2 text-xs font-semibold underline" onClick={() => setMsg(null)}>
            ok
          </button>
        </Inset>
      )}
      {swapFrom && (
        <Inset tone="warn" className="flex items-center justify-between gap-2">
          <span>
            Wybierz dzień, z którym zamienić {swapFrom.slice(8)}.{swapFrom.slice(5, 7)}.
          </span>
          <button className="min-h-9 shrink-0 px-2 text-xs font-semibold underline" onClick={() => setSwapFrom(null)}>
            Anuluj
          </button>
        </Inset>
      )}
      {days.length === 0 && <Empty>Ten tydzień jest poza planem.</Empty>}
      <ul className="space-y-2 xl:grid xl:grid-cols-7 xl:gap-3 xl:space-y-0">
        {days.map((d) => {
          const bikeLog = logs.find((l) => l.date === d.date && l.kind === 'bike')
          const gymLog = logs.find((l) => l.date === d.date && l.kind === 'gym')
          const dayOverrides = overrides.filter((o) => o.date === d.date)
          const selectable = swapFrom && swapFrom !== d.date
          const isToday = d.date === today
          const weekend = d.weekday === 'sat' || d.weekday === 'sun'
          return (
            <li key={d.date} className="xl:flex">
              <Card className={`h-full w-full xl:flex xl:flex-col xl:p-3 ${isToday ? 'ring-2 ring-sky-500' : ''} ${selectable ? 'ring-2 ring-amber-400' : ''}`}>
                <div className="flex min-w-0 items-start gap-3 xl:flex-1 xl:flex-col xl:gap-2">
                  {/* data: na liście kolumna 2,5 rem, w siatce wiersz z paskiem koloru dnia */}
                  <div className="w-10 shrink-0 text-center xl:flex xl:w-full xl:items-baseline xl:gap-1.5 xl:border-b xl:border-slate-100 xl:pb-2 xl:text-left xl:dark:border-slate-700">
                    <div className={`text-xs font-semibold uppercase ${weekend ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}>{WEEKDAY_SHORT[d.weekday]}</div>
                    <div className={`text-xl leading-6 font-bold tabular-nums ${isToday ? 'text-sky-600 dark:text-sky-400' : ''}`}>{d.date.slice(8)}</div>
                    {d.bike && <span className={`ml-auto hidden h-2 w-2 shrink-0 self-center rounded-full xl:block ${DAY_TYPE_COLOR[d.day_type]}`} title={d.bike.name} />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 xl:w-full xl:space-y-1.5">
                    {d.bike ? (
                      <div className="flex items-baseline justify-between gap-2 text-sm xl:flex-col xl:gap-0">
                        <Link to={`/dzien/${d.date}`} className="min-w-0 truncate hover:text-sky-700 xl:whitespace-normal xl:font-medium xl:leading-5 dark:hover:text-sky-300" title={d.bike.name}>
                          🚴 {d.bike.name}
                        </Link>
                        <span className="shrink-0 text-slate-600 tabular-nums dark:text-slate-300 xl:text-xs">{minutes(d.bike.duration_min)}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 dark:text-slate-500">🛋️ {d.gym ? 'Bez roweru' : 'Wolne'}</div>
                    )}
                    {d.gym && (
                      <div className="flex items-baseline justify-between gap-2 text-sm xl:flex-col xl:gap-0">
                        <Link to={`/silownia/${d.date}`} className="min-w-0 truncate hover:text-sky-700 xl:whitespace-normal xl:font-medium xl:leading-5 dark:hover:text-sky-300" title={d.gym.name}>
                          🏋️ {d.gym.name}
                        </Link>
                        <span className="shrink-0 text-slate-600 tabular-nums dark:text-slate-300 xl:text-xs">~{d.gym.est_min} min</span>
                      </div>
                    )}
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      {bikeLog && bikeLog.status !== 'planned' && <StatusBadge status={bikeLog.status} />}
                      {gymLog && gymLog.status !== 'planned' && <StatusBadge status={gymLog.status} />}
                      {d.flags.map((f) => (
                        <Badge key={f} color={FLAG_COLOR[f]}>
                          {FLAG_LABEL[f]}
                        </Badge>
                      ))}
                      {d.event && (
                        <Badge color="bg-orange-600" title={d.event}>
                          Wydarzenie
                        </Badge>
                      )}
                      {dayOverrides.map((o) => (
                        <button key={o.id} onClick={() => toast.run('Cofam zmianę…', () => removeOverride(o.id), () => 'Przywrócono plan')} className="inline-flex max-w-full items-center rounded-full bg-sky-600 px-2 py-0.5 text-xs leading-4 text-white hover:bg-sky-500">
                          zmienione ✕
                        </button>
                      ))}
                    </div>
                    {d.event && (
                      <p className="hidden text-xs leading-4 break-words text-orange-700 xl:block dark:text-orange-400" title={d.event}>
                        {d.event}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 xl:mt-auto xl:w-full xl:border-t xl:border-slate-100 xl:pt-2 xl:dark:border-slate-700">
                    {selectable ? (
                      <Button size="sm" onClick={() => trySwap(d.date)} className="min-h-11 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 xl:min-h-9 xl:w-full">
                        Tu
                      </Button>
                    ) : (
                      <button
                        onClick={() => setSwapFrom(d.date)}
                        className="min-h-11 rounded-xl px-2 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-sky-700 xl:min-h-9 xl:w-full dark:hover:bg-slate-700 dark:hover:text-sky-300"
                        aria-label={`Zamień dzień ${d.date}`}
                        title="Zamień dzień"
                      >
                        <span aria-hidden>⇅</span>
                        <span className="hidden xl:inline"> Zamień</span>
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
      <p className="text-xs text-slate-400 dark:text-slate-500">Zamiana dni pilnuje reguł: żadnych dwóch akcentów pod rząd i żadnej sesji z nogami krócej niż 48 h przed testem, górami czy blokiem.</p>
    </div>
  )
}
