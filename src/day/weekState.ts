/**
 * Wynik dni tygodnia dla pasków i list w mobilnym v2 (docs/24): plan vs wykonanie bez sięgania do strumieni.
 * Czysty TS – testy w __tests__/weekState.test.ts. Ta sama klasyfikacja co w kontekście trenera (`coachContext.ts`).
 */
import type { CalendarDay } from '@/engine/types'
import type { ISODate } from '@/engine/dates'

export type DayOutcome = 'done' | 'modified' | 'skipped' | 'missed' | 'extra' | 'free' | 'today' | 'planned'

export interface WeekDayState {
  date: ISODate
  weekday: CalendarDay['weekday']
  /** minuty jazdy z planu */
  planned_min: number
  /** minuty z jazd (Strava) */
  done_min: number
  outcome: DayOutcome
  key: boolean
  on_bolt: boolean
  name: string | null
}

export interface WeekState {
  days: WeekDayState[]
  planned_min: number
  done_min: number
  rides_planned: number
  rides_done: number
}

export interface WeekStateInput {
  days: CalendarDay[]
  today: ISODate
  logs: { date: string; kind: string; status: string }[]
  activities: { date: string; moving_time_s: number }[]
  boltDates?: string[]
}

export function weekState(inp: WeekStateInput): WeekState {
  const bolt = new Set(inp.boltDates ?? [])
  const days = inp.days
    .toSorted((a, b) => (a.date < b.date ? -1 : 1))
    .map<WeekDayState>((d) => {
      const acts = inp.activities.filter((a) => a.date === d.date)
      const done_min = Math.round(acts.reduce((s, a) => s + a.moving_time_s / 60, 0))
      // dawne logi siłowni (`kind: 'gym'`) zostają w historii, ale nie liczą się do wyniku dnia
      const log = d.bike ? inp.logs.find((l) => l.date === d.date && l.kind === 'bike') : undefined
      const planned_min = d.bike?.duration_min ?? 0
      let outcome: DayOutcome
      if (log?.status === 'skipped') outcome = 'skipped'
      else if (log?.status === 'done' || log?.status === 'modified') outcome = log.status
      else if (!d.bike) outcome = acts.length ? 'extra' : 'free'
      else if (acts.length) outcome = 'done'
      else if (d.date > inp.today) outcome = 'planned'
      else if (d.date === inp.today) outcome = 'today'
      else outcome = 'missed'
      return { date: d.date, weekday: d.weekday, planned_min, done_min, outcome, key: d.day_type === 'key' || d.flags.includes('test'), on_bolt: bolt.has(d.date), name: d.bike?.name ?? null }
    })
  return {
    days,
    planned_min: days.reduce((s, d) => s + d.planned_min, 0),
    done_min: days.reduce((s, d) => s + d.done_min, 0),
    rides_planned: days.filter((d) => d.planned_min > 0).length,
    rides_done: days.filter((d) => d.outcome === 'done' || d.outcome === 'modified').length,
  }
}
