import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Checkin, type PlanOverrideRow, type SessionLog } from '@/db'
import { addOverride, removeOverride } from '@/db/repo'
import { getCalendarDay } from '@/engine/calendar'
import { addDays, mondayOf, type ISODate } from '@/engine/dates'
import { enrichDay, type DayPlan } from '@/engine/plan'
import { applyOverrides, warningsFor, type LogLike, type RuleAction, type RuleWarning } from '@/engine/rules'
import type { CalendarDay, PlanOverride } from '@/engine/types'
import { useEngine, type Engine } from './useSettings'
import { todayISO } from '@/lib/dates'
import { useToast } from '@/components/Toast'

/** Ile dni wstecz i w przód liczymy, żeby reguły widziały kontekst (R7 potrzebuje dwóch tygodni). */
const BACK = 15
const FORWARD = 8

function toOverride(r: PlanOverrideRow): PlanOverride {
  return { id: r.id, date: r.date, kind: r.kind, payload: r.payload }
}

export interface DayView {
  engine: Engine
  day: DayPlan | null
  /** dni okna po nałożeniu nadpisań – do zamian i podglądu tygodnia */
  window: CalendarDay[]
  warnings: RuleWarning[]
  overrides: PlanOverrideRow[]
  applyAction: (action: RuleAction) => Promise<void>
  undo: (id: string) => Promise<void>
}

const OVERRIDE_DONE: Record<string, string> = {
  indoor: 'Trening zamieniony na wersję pod dachem',
  sick: 'Dzień dostosowany do choroby',
  downgrade: 'Dzień obniżony',
  skip: 'Trening pominięty',
  swap: 'Dni zamienione',
  move: 'Trening przeniesiony',
}

export function useDayView(date: ISODate): DayView {
  const engine = useEngine()
  const toast = useToast()
  const { ctx, weeks } = engine
  const from = addDays(date, -BACK)
  const to = addDays(date, FORWARD)
  const overrides = useLiveQuery(async () => (await db.plan_overrides.where('date').between(from, to, true, true).toArray()).filter((o) => !o.deleted_at), [from, to], [] as PlanOverrideRow[])
  const logs = useLiveQuery(async () => (await db.session_logs.where('date').between(from, to, true, true).toArray()).filter((l) => !l.deleted_at), [from, to], [] as SessionLog[])
  const checkins = useLiveQuery(async () => (await db.checkins.where('date').between(from, to, true, true).toArray()).filter((c) => !c.deleted_at), [from, to], [] as Checkin[])

  const { day, window, warnings } = useMemo(() => {
    const base: CalendarDay[] = []
    for (let i = -BACK; i <= FORWARD; i++) {
      const d = getCalendarDay(addDays(date, i), ctx, weeks)
      if (d) base.push(d)
    }
    const resolved = applyOverrides(base, overrides.map(toOverride), ctx.program)
    const target = resolved.find((d) => d.date === date) ?? null
    const ruleLogs: LogLike[] = logs.map((l) => ({ date: l.date, kind: l.kind, status: l.status, rpe: l.rpe ?? null }))
    return {
      day: target ? enrichDay(target, ctx) : null,
      window: resolved,
      warnings: target ? warningsFor(date, resolved, { program: ctx.program, logs: ruleLogs, checkins, today: todayISO() }) : [],
    }
  }, [date, ctx, weeks, overrides, logs, checkins])

  return {
    engine,
    day,
    window,
    warnings,
    overrides: overrides.filter((o) => o.date === date),
    applyAction: async (action) => {
      await toast.run('Zmieniam plan…', () => addOverride(action.date, action.kind, action.payload), () => OVERRIDE_DONE[action.kind] ?? 'Plan zmieniony')
    },
    undo: async (id) => {
      await toast.run('Cofam zmianę…', () => removeOverride(id), () => 'Przywrócono plan')
    },
  }
}

/** Tydzień po nałożeniu nadpisań. */
export function useWeekView(anyDateInWeek: ISODate): { engine: Engine; days: DayPlan[]; monday: ISODate; window: CalendarDay[] } {
  const monday = mondayOf(anyDateInWeek)
  const view = useDayView(addDays(monday, 3))
  const days = useMemo(() => {
    const out: DayPlan[] = []
    for (let i = 0; i < 7; i++) {
      const d = view.window.find((x) => x.date === addDays(monday, i))
      if (d) out.push(enrichDay(d, view.engine.ctx))
    }
    return out
  }, [view.window, view.engine.ctx, monday])
  return { engine: view.engine, days, monday, window: view.window }
}
