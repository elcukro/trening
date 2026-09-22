import { useCallback, useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useRangeView } from '@/app/usePlan'
import { addOverride, removeOverride } from '@/db/repo'
import { validateMove } from '@/engine/rules'
import type { PlanOverrideRow, SessionLog, SessionStatus } from '@/db'
import { addDays, mondayOf, type ISODate } from '@/engine/dates'
import type { DayPlan } from '@/engine/plan'
import { Button, Dot, Empty, Inset } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useDragMove, type DragMove } from './useDragMove'
import { addMonths, fmtDayMonth, fmtMonth, monthEnd, monthStart, todayISO } from '@/lib/dates'
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

/** Krótkie nazwy faz do wąskiego paska tygodnia (3,5 rem) */
const PHASE_RAIL: Record<string, string> = { PREP: 'Prep', I: 'F I', II: 'F II', III: 'F III', IV: 'F IV', V: 'F V', TAPER: 'Taper' }

/** Jedna pozycja w komórce: kolorowa kropka, nazwa (z wielokropkiem), pod nią czas i status – nic nie wystaje poza komórkę. */
function CellItem({ color, name, title, meta, status }: { color: string; name: string; title?: string; meta?: string; status?: SessionStatus | null }) {
  return (
    <div className="hidden min-w-0 items-start gap-1.5 lg:flex">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />
      <div className="min-w-0 flex-1 leading-4">
        <div className="truncate text-xs font-medium" title={title ?? name}>
          {name}
        </div>
        {(meta || status) && (
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            {meta && <span className="truncate tabular-nums">{meta}</span>}
            {status && <StatusDot status={status} />}
          </div>
        )}
      </div>
    </div>
  )
}

interface DragApi {
  drag: DragMove | null
  onPointerDown: (e: React.PointerEvent, from: ISODate, label: string) => void
  handleClick: (date: ISODate) => boolean
  canDrop: (from: ISODate, to: ISODate) => boolean
}

function DayCell({ date, day, inMonth, today, logs, hasOverride, dragApi }: { date: ISODate; day: DayPlan | undefined; inMonth: boolean; today: boolean; logs: SessionLog[]; hasOverride: boolean; dragApi: DragApi }) {
  const num = Number(date.slice(8))
  const base = 'relative flex min-h-16 min-w-0 flex-col gap-1 overflow-hidden rounded-lg p-1 text-left lg:min-h-28 lg:gap-1.5 lg:p-2'
  if (!day) {
    return (
      <div data-date={date} className={`${base} bg-slate-100/60 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600`} aria-label={`${date} – poza planem`}>
        <span className="text-xs tabular-nums lg:text-sm">{num}</span>
      </div>
    )
  }
  const bikeStatus = statusOf(logs, date, 'bike')
  const gymStatus = statusOf(logs, date, 'gym')
  const ride = day.bike && !isTravel(day) ? day.bike : null
  const travel = day.bike && isTravel(day) ? day.bike : null
  const tone = inMonth ? 'bg-white hover:bg-sky-50 dark:bg-slate-800 dark:hover:bg-slate-700' : 'bg-white/60 text-slate-500 hover:bg-sky-50 dark:bg-slate-800/50 dark:hover:bg-slate-700'
  const { drag } = dragApi
  const movable = !!ride
  const isSource = drag?.from === date
  const isTarget = !!drag && !isSource && dragApi.canDrop(drag.from, date)
  const isOver = drag?.over === date
  const dragCls = isSource
    ? 'opacity-60 ring-2 ring-sky-500'
    : isOver
      ? 'ring-2 ring-emerald-500 bg-emerald-100 dark:bg-emerald-900/50'
      : isTarget
        ? 'ring-2 ring-emerald-400/70 bg-emerald-50 dark:bg-emerald-950/40'
        : ''
  return (
    <Link
      to={`/dzien/${date}`}
      data-date={date}
      aria-label={`${WEEKDAY_LONG[day.weekday]} ${date}${isTarget ? ' – wolny, można tu przenieść' : ''}`}
      onPointerDown={movable ? (e) => dragApi.onPointerDown(e, date, ride.name) : undefined}
      onClick={(e) => {
        if (dragApi.handleClick(date)) e.preventDefault()
      }}
      onDragStart={(e) => e.preventDefault()}
      className={`${base} border shadow-card transition-colors ${today ? 'border-sky-500 ring-2 ring-sky-500/40' : 'border-slate-200 dark:border-slate-700'} ${tone} ${dragCls} ${drag && !drag.armed ? 'touch-none select-none' : ''}`}
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

      {/* telefon: kolorowe paski; komputer: nazwy z czasem pod spodem */}
      {ride && (
        <>
          <span className={`h-1.5 w-full rounded-full lg:hidden ${DAY_TYPE_COLOR[day.day_type]}`} />
          <CellItem color={DAY_TYPE_COLOR[day.day_type]} name={day.day_type === 'key' ? `★ ${ride.name}` : ride.name} title={day.day_type === 'key' ? `Klucz: ${ride.name}` : ride.name} meta={minutes(ride.duration_min)} status={bikeStatus} />
        </>
      )}
      {travel && (
        <>
          <span className={`h-1.5 w-full rounded-full lg:hidden ${DAY_TYPE_COLOR.trip}`} />
          <CellItem color={DAY_TYPE_COLOR.trip} name={travel.workout_id === 'TRIP' ? 'Alpy' : 'Dojazd'} title={travel.name} />
        </>
      )}
      {day.gym && (
        <>
          <span className={`h-1.5 w-1/2 rounded-full lg:hidden ${GYM_COLOR}`} />
          <CellItem color={GYM_COLOR} name={gymShort(day.gym.name)} title={day.gym.name} meta={`~${day.gym.est_min} min`} status={gymStatus} />
        </>
      )}
      {!ride && !travel && !day.gym && <span className="hidden text-xs text-slate-400 lg:block">Wolne</span>}

      {/* telefon: statusy jako kropki w rogu */}
      {(bikeStatus || gymStatus) && (
        <span className="absolute right-1 bottom-1 flex gap-0.5 lg:hidden">
          <StatusDot status={bikeStatus} />
          <StatusDot status={gymStatus} />
        </span>
      )}

      {/* komputer: znaczniki i wydarzenie tekstem – każdy skracany z wielokropkiem, pełna treść w title */}
      {(day.flags.length > 0 || hasOverride || day.event) && (
        <div className="mt-auto hidden min-w-0 flex-wrap gap-1 lg:flex">
          {day.flags.map((f) => (
            <span key={f} className={`max-w-full truncate rounded px-1 text-xs font-medium leading-4 text-white ${FLAG_COLOR[f]}`} title={FLAG_LABEL[f]}>
              {FLAG_LABEL[f]}
            </span>
          ))}
          {hasOverride && <span className="max-w-full truncate rounded bg-sky-600 px-1 text-xs font-medium leading-4 text-white">zmienione</span>}
          {day.event && (
            <span className="w-full truncate text-xs font-medium text-orange-600 dark:text-orange-400" title={day.event}>
              {day.event}
            </span>
          )}
        </div>
      )}
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
  const toast = useToast()

  // przenoszenie jazdy: przytrzymaj kafelek z jazdą i upuść na dniu wolnym tego samego miesiąca (R15)
  const canDrop = useCallback((from: ISODate, to: ISODate) => validateMove(from, to, days, { today }).ok, [days, today])
  const onDrop = useCallback(
    (from: ISODate, to: ISODate) => {
      const v = validateMove(from, to, days, { today })
      if (!v.ok) {
        toast.notify(v.reason ?? 'Nie można tu przenieść.', 'error')
        return
      }
      void toast.run(
        'Przenoszę trening…',
        () => addOverride(from, 'move', { to, what: 'bike' }),
        () => `Przeniesione na ${fmtDayMonth(to)}. Wyślij 7 dni na Bolta, jeśli to najbliższe dni.`,
      )
      if (v.warning) toast.notify(v.warning, 'info')
    },
    [days, today, toast],
  )
  const { drag, onPointerDown, handleClick, cancel } = useDragMove({ canDrop, onDrop })
  const dragApi = useMemo(() => ({ drag, onPointerDown, handleClick, canDrop }), [drag, onPointerDown, handleClick, canDrop])
  const moves = useMemo(() => overrides.filter((o: PlanOverrideRow) => o.kind === 'move'), [overrides])

  return (
    <div className="space-y-3 lg:space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" ariaLabel="Poprzedni miesiąc" onClick={() => go(addMonths(first, -1))} className="w-11 px-0 text-xl">
            ‹
          </Button>
          <h1 className="min-w-40 text-center text-2xl font-bold tracking-tight first-letter:uppercase lg:min-w-56">{fmtMonth(first)}</h1>
          <Button variant="ghost" ariaLabel="Następny miesiąc" onClick={() => go(addMonths(first, 1))} className="w-11 px-0 text-xl">
            ›
          </Button>
        </div>
        <Button variant="secondary" size="sm" onClick={() => go(today)} className="ml-auto">
          Dziś
        </Button>
        {summary.rides > 0 && (
          <p className="w-full text-sm text-slate-500 lg:ml-2 lg:w-auto dark:text-slate-400">
            {summary.rides} jazd · {hours(summary.min)} · siłownia ×{summary.gym}
          </p>
        )}
      </header>

      {/* pasek nie może przesuwać siatki w trakcie przeciągania – dlatego jest przypięty do dołu ekranu */}
      {drag && (
        <div className="pb-nav fixed inset-x-0 bottom-2 z-40 px-4 lg:bottom-6">
          <Inset tone="info" className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-2 shadow-lg" role="status">
            <span className="min-w-0">
              Przenoszę: <b>{drag.label}</b> – {drag.armed ? 'dotknij dnia wolnego' : 'upuść na dniu wolnym'} (zielone ramki).
            </span>
            <Button size="sm" variant="ghost" onClick={cancel}>
              Anuluj
            </Button>
          </Inset>
        </div>
      )}
      {drag?.point && (
        <div className="pointer-events-none fixed z-50 max-w-40 truncate rounded-lg bg-sky-600 px-2 py-1 text-xs font-semibold text-white shadow-lg" style={{ left: drag.point.x + 12, top: drag.point.y - 12 }} aria-hidden>
          {drag.label}
        </div>
      )}

      {days.length === 0 && (
        <Empty>
          Ten miesiąc jest poza planem ({program_start.slice(0, 7)} – {trip_start.slice(0, 7)}).
        </Empty>
      )}

      <div className="grid grid-cols-[1.5rem_repeat(7,minmax(0,1fr))] gap-0.5 lg:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] lg:gap-1" role="grid" aria-label={`Kalendarz: ${fmtMonth(first)}`}>
        <div className="text-xs text-slate-400" aria-hidden>
          <span className="hidden lg:inline">Tydz.</span>
        </div>
        {WEEKDAYS.map((wd) => (
          <div key={wd} className={`min-w-0 truncate pb-1 text-center text-xs font-semibold uppercase tracking-wide ${wd === 'sat' || wd === 'sun' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`} title={WEEKDAY_LONG[wd]}>
            {/* pełna nazwa dopiero od 1280 px – przy 1024 px „poniedziałek” nie mieści się w kolumnie */}
            <span className="xl:hidden">{WEEKDAY_SHORT[wd]}</span>
            <span className="hidden xl:inline">{WEEKDAY_LONG[wd]}</span>
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
                  className={`flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg px-0.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 ${PHASE_COLOR[planned.phase]}`}
                >
                  <span className="tabular-nums lg:text-sm">{planned.week}</span>
                  <span className="hidden max-w-full truncate text-xs font-medium opacity-90 lg:block">{PHASE_RAIL[planned.phase] ?? planned.phase}</span>
                </Link>
              ) : (
                <div className="rounded-lg bg-slate-100 dark:bg-slate-800/40" />
              )}
              {week.map((date) => (
                <DayCell key={date} date={date} day={byDate.get(date)} inMonth={date >= first && date <= last} today={date === today} logs={logs} hasOverride={overrides.some((o) => o.date === date)} dragApi={dragApi} />
              ))}
            </div>
          )
        })}
      </div>

      {moves.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Przeniesione:</span>
          {moves.map((o) => (
            <button
              key={o.id}
              className="inline-flex min-h-8 items-center gap-1 rounded-full bg-sky-100 px-2 font-medium text-sky-800 hover:bg-sky-200 dark:bg-sky-900/60 dark:text-sky-200"
              onClick={() => void toast.run('Cofam przeniesienie…', () => removeOverride(o.id), () => 'Przywrócono plan')}
            >
              {fmtDayMonth(o.date)} → {fmtDayMonth(String(o.payload.to ?? ''))} <span aria-hidden>✕</span>
              <span className="sr-only">cofnij</span>
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">Przytrzymaj kafelek z jazdą i przeciągnij na dzień wolny tego samego miesiąca, żeby ją przenieść (albo puść i dotknij celu).</p>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400" aria-label="Legenda">
        <li className="flex items-center gap-1.5">
          <Dot color={DAY_TYPE_COLOR.easy} /> Lekko
        </li>
        <li className="flex items-center gap-1.5">
          <Dot color={DAY_TYPE_COLOR.long} /> Długa
        </li>
        <li className="flex items-center gap-1.5">
          <Dot color={DAY_TYPE_COLOR.key} /> Akcent (★ trening kluczowy)
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
