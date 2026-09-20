import { useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useRangeView } from '@/app/usePlan'
import type { SessionLog, SessionStatus } from '@/db'
import { addDays, mondayOf, type ISODate } from '@/engine/dates'
import type { DayPlan } from '@/engine/plan'
import { Button, Dot, Empty } from '@/components/ui'
import { addMonths, fmtMonth, monthEnd, monthStart, todayISO } from '@/lib/dates'
import { hours, minutes } from '@/lib/format'
import { DAY_TYPE_COLOR, FLAG_COLOR, FLAG_LABEL, PHASE_COLOR, PHASE_SHORT, WEEKDAY_LONG, WEEKDAY_SHORT } from '@/lib/labels'
import { WEEKDAYS } from '@/engine/dates'

const GYM_COLOR = 'bg-violet-500'
const STATUS_COLOR: Record<SessionStatus, string> = { planned: 'bg-slate-400', in_progress: 'bg-sky-500', done: 'bg-emerald-500', modified: 'bg-amber-500', skipped: 'bg-red-500' }
const STATUS_LABEL: Record<SessionStatus, string> = { planned: 'zaplanowane', in_progress: 'w trakcie', done: 'wykonane', modified: 'zmienione', skipped: 'pominięte' }

/** „Sesja A – Siła nóg (ciężka)” → „Sesja A” */
function gymShort(name: string): string {
  return name.split(' – ')[0] ?? name
}

function isTravel(day: DayPlan): boolean {
  return day.bike?.workout_id === 'TRIP' || day.bike?.workout_id === 'TRAVEL_REST'
}

function statusOf(logs: SessionLog[], date: ISODate, kind: 'bike' | 'gym'): SessionStatus | null {
  const s = logs.find((l) => l.date === date && l.kind === kind)?.status
  return s && s !== 'planned' ? s : null
}

function StatusDot({ status }: { status: SessionStatus | null }) {
  if (!status) return null
  return <Dot color={STATUS_COLOR[status]} title={STATUS_LABEL[status]} className="ring-2 ring-white dark:ring-slate-800" />
}

function DayCell({ date, day, inMonth, today, logs, hasOverride }: { date: ISODate; day: DayPlan | undefined; inMonth: boolean; today: boolean; logs: SessionLog[]; hasOverride: boolean }) {
  const num = Number(date.slice(8))
  const base = 'relative flex min-h-16 flex-col gap-1 rounded-lg p-1 text-left lg:min-h-28 lg:gap-1.5 lg:p-2'
  if (!day) {
    return (
      <div className={`${base} bg-slate-100/60 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600`} aria-label={`${date} – poza planem`}>
        <span className="text-xs tabular-nums lg:text-sm">{num}</span>
      </div>
    )
  }
  const bikeStatus = statusOf(logs, date, 'bike')
  const gymStatus = statusOf(logs, date, 'gym')
  const ride = day.bike && !isTravel(day) ? day.bike : null
  const travel = day.bike && isTravel(day) ? day.bike : null
  const tone = inMonth ? 'bg-white hover:bg-sky-50 dark:bg-slate-800 dark:hover:bg-slate-700' : 'bg-white/60 text-slate-500 hover:bg-sky-50 dark:bg-slate-800/50 dark:hover:bg-slate-700'
  return (
    <Link
      to={`/dzien/${date}`}
      aria-label={`${WEEKDAY_LONG[day.weekday]} ${date}`}
      className={`${base} border transition-colors ${today ? 'border-sky-500 ring-2 ring-sky-500/40' : 'border-slate-200 dark:border-slate-700'} ${tone}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`text-xs font-semibold tabular-nums lg:text-sm ${today ? 'rounded-full bg-sky-600 px-1.5 text-white' : ''}`}>{num}</span>
        <span className="flex items-center gap-0.5 lg:hidden">
          {day.flags.map((f) => (
            <Dot key={f} color={FLAG_COLOR[f]} title={FLAG_LABEL[f]} className="h-1.5 w-1.5" />
          ))}
          {day.event && <Dot color="bg-orange-500" title={day.event} className="h-1.5 w-1.5" />}
          {hasOverride && <Dot color="bg-sky-600" title="zmienione" className="h-1.5 w-1.5" />}
        </span>
      </div>

      {/* telefon: kolorowe paski; komputer: nazwy */}
      {ride && (
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-full rounded-full lg:h-2.5 lg:w-2.5 lg:shrink-0 ${DAY_TYPE_COLOR[day.day_type]}`} />
          <span className="hidden min-w-0 flex-1 truncate text-xs lg:block" title={ride.name}>
            {ride.name}
          </span>
          <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 lg:block">{minutes(ride.duration_min)}</span>
          <span className="hidden lg:block">
            <StatusDot status={bikeStatus} />
          </span>
        </div>
      )}
      {travel && (
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-full rounded-full lg:h-2.5 lg:w-2.5 lg:shrink-0 ${DAY_TYPE_COLOR.trip}`} />
          <span className="hidden min-w-0 flex-1 truncate text-xs lg:block">{travel.workout_id === 'TRIP' ? 'Alpy' : 'Dojazd'}</span>
        </div>
      )}
      {day.gym && (
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1/2 rounded-full lg:h-2.5 lg:w-2.5 lg:shrink-0 ${GYM_COLOR}`} />
          <span className="hidden min-w-0 flex-1 truncate text-xs lg:block" title={day.gym.name}>
            {gymShort(day.gym.name)}
          </span>
          <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 lg:block">~{day.gym.est_min} min</span>
          <span className="hidden lg:block">
            <StatusDot status={gymStatus} />
          </span>
        </div>
      )}
      {!ride && !travel && !day.gym && <span className="hidden text-xs text-slate-400 lg:block">Wolne</span>}

      {/* telefon: statusy jako kropki w rogu */}
      {(bikeStatus || gymStatus) && (
        <span className="absolute right-1 bottom-1 flex gap-0.5 lg:hidden">
          <StatusDot status={bikeStatus} />
          <StatusDot status={gymStatus} />
        </span>
      )}

      {/* komputer: znaczniki i wydarzenie tekstem */}
      <div className="mt-auto hidden flex-wrap gap-1 lg:flex">
        {day.flags.map((f) => (
          <span key={f} className={`rounded px-1 text-[10px] font-medium leading-4 text-white ${FLAG_COLOR[f]}`}>
            {FLAG_LABEL[f]}
          </span>
        ))}
        {hasOverride && <span className="rounded bg-sky-600 px-1 text-[10px] font-medium leading-4 text-white">zmienione</span>}
        {day.event && (
          <span className="w-full truncate text-[11px] font-medium text-orange-600 dark:text-orange-400" title={day.event}>
            {day.event}
          </span>
        )}
      </div>
    </Link>
  )
}

export function CalendarPage() {
  const { month } = useParams()
  const navigate = useNavigate()
  const { search } = useLocation()
  const today = todayISO()
  const first = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${month}-01` : monthStart(today)
  const last = monthEnd(first)
  // siatka: od poniedziałku tygodnia z 1. dniem do niedzieli tygodnia z ostatnim dniem
  const gridStart = mondayOf(first)
  const gridEnd = addDays(mondayOf(last), 6)
  const { engine, days, logs, overrides } = useRangeView(gridStart, gridEnd)
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])
  const weeks = useMemo(() => {
    const out: ISODate[][] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) out.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
    return out
  }, [gridStart, gridEnd])

  const summary = useMemo(() => {
    const inMonth = days.filter((d) => d.date >= first && d.date <= last)
    const rides = inMonth.filter((d) => d.bike && !isTravel(d))
    return { rides: rides.length, min: rides.reduce((a, d) => a + (d.bike?.duration_min ?? 0), 0), gym: inMonth.filter((d) => d.gym).length }
  }, [days, first, last])

  const go = (iso: ISODate) => navigate(`/kalendarz/${iso.slice(0, 7)}${search}`)
  const { program_start, trip_start } = engine.ctx.settings

  return (
    <div className="space-y-3 lg:space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" ariaLabel="Poprzedni miesiąc" onClick={() => go(addMonths(first, -1))} className="px-3">
            ‹
          </Button>
          <h1 className="min-w-40 text-center text-xl font-bold tracking-tight first-letter:uppercase lg:min-w-56 lg:text-3xl">{fmtMonth(first)}</h1>
          <Button variant="ghost" ariaLabel="Następny miesiąc" onClick={() => go(addMonths(first, 1))} className="px-3">
            ›
          </Button>
        </div>
        <Button variant="secondary" onClick={() => go(today)} className="ml-auto min-h-10 px-3">
          Dziś
        </Button>
        {summary.rides > 0 && (
          <p className="w-full text-sm text-slate-500 lg:ml-2 lg:w-auto dark:text-slate-400">
            {summary.rides} jazd · {hours(summary.min)} · siłownia ×{summary.gym}
          </p>
        )}
      </header>

      {days.length === 0 && (
        <Empty>
          Ten miesiąc jest poza planem ({program_start.slice(0, 7)} – {trip_start.slice(0, 7)}).
        </Empty>
      )}

      <div className="grid grid-cols-[1.5rem_repeat(7,minmax(0,1fr))] gap-0.5 lg:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] lg:gap-1" role="grid" aria-label={`Kalendarz: ${fmtMonth(first)}`}>
        <div className="text-[10px] text-slate-400 lg:text-xs" aria-hidden>
          <span className="hidden lg:inline">Tydz.</span>
        </div>
        {WEEKDAYS.map((wd) => (
          <div key={wd} className={`pb-1 text-center text-[11px] font-semibold uppercase tracking-wide lg:text-xs ${wd === 'sat' || wd === 'sun' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500'}`}>
            <span className="lg:hidden">{WEEKDAY_SHORT[wd]}</span>
            <span className="hidden lg:inline">{WEEKDAY_LONG[wd]}</span>
          </div>
        ))}
        {weeks.map((week) => {
          const monday = week[0]!
          const planned = week.map((d) => byDate.get(d)).find((d): d is DayPlan => !!d)
          return (
            <div key={monday} className="contents">
              {planned ? (
                <Link
                  to={`/tydzien/${monday}`}
                  title={`Tydzień ${planned.week} · ${PHASE_SHORT[planned.phase]}`}
                  aria-label={`Tydzień ${planned.week} · ${PHASE_SHORT[planned.phase]}`}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg py-1 text-[10px] font-semibold text-white lg:text-xs ${PHASE_COLOR[planned.phase]}`}
                >
                  <span className="tabular-nums">{planned.week}</span>
                  <span className="hidden text-[10px] font-normal opacity-90 lg:block">{PHASE_SHORT[planned.phase].replace('Faza ', 'F')}</span>
                </Link>
              ) : (
                <div className="rounded-lg bg-slate-100 dark:bg-slate-800/40" />
              )}
              {week.map((date) => (
                <DayCell key={date} date={date} day={byDate.get(date)} inMonth={date >= first && date <= last} today={date === today} logs={logs} hasOverride={overrides.some((o) => o.date === date)} />
              ))}
            </div>
          )
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400" aria-label="Legenda">
        <li className="flex items-center gap-1.5">
          <Dot color={DAY_TYPE_COLOR.easy} /> Lekko
        </li>
        <li className="flex items-center gap-1.5">
          <Dot color={DAY_TYPE_COLOR.long} /> Długa
        </li>
        <li className="flex items-center gap-1.5">
          <Dot color={DAY_TYPE_COLOR.key} /> Akcent
        </li>
        <li className="flex items-center gap-1.5">
          <Dot color={GYM_COLOR} /> Siłownia
        </li>
        {(Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).map((f) => (
          <li key={f} className="flex items-center gap-1.5">
            <Dot color={FLAG_COLOR[f]} /> {FLAG_LABEL[f]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <Dot color={STATUS_COLOR.done} /> Wykonane
        </li>
        <li className="flex items-center gap-1.5">
          <Dot color={STATUS_COLOR.skipped} /> Pominięte
        </li>
      </ul>
    </div>
  )
}
