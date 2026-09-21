import { addDays, mondayOf, type ISODate } from './dates'
import { plannedTss } from './pmc'
import type { Program } from './schema'
import type { CalendarDay } from './types'

/**
 * Przegląd okresu (tydzień / miesiąc) – pkt 5 planu (docs/14): liczby z planu, logów i TSS, lista dni
 * z tym, co poszło nie tak. Czysty TS; strony `/postep/tydzien/:monday` i `/postep/miesiac/:YYYY-MM` tylko to rysują.
 */

export interface ReportLog {
  date: ISODate
  kind: 'bike' | 'gym' | 'test'
  status: 'planned' | 'in_progress' | 'done' | 'modified' | 'skipped'
  duration_min?: number | null
  rpe?: number | null
}

export type DayOutcome = 'done' | 'modified' | 'skipped' | 'missed' | 'extra' | 'upcoming' | 'rest'

export interface ReportDay {
  date: ISODate
  day: CalendarDay | null
  bike_name: string | null
  bike_min: number
  key: boolean
  gym_name: string | null
  bike: DayOutcome
  gym: DayOutcome
  tss_planned: number
  tss_done: number | null
  /** zgodność z analizy plan vs wykonanie (0–100) */
  score: number | null
}

export interface RangeReport {
  from: ISODate
  to: ISODate
  days: ReportDay[]
  planned_min: number
  done_min: number
  planned_tss: number
  done_tss: number
  bike_planned: number
  bike_done: number
  gym_planned: number
  gym_done: number
  /** średnia zgodność z dostępnych analiz */
  score: number | null
  /** dni z problemem: pominięte, zmienione, bez wpisu w przeszłości */
  issues: ReportDay[]
  extra_rides: number
}

const NON_RIDES = new Set(['TRIP', 'TRAVEL_REST'])

function outcome(planned: boolean, log: ReportLog | undefined, past: boolean): DayOutcome {
  if (!planned) return log && (log.status === 'done' || log.status === 'modified') ? 'extra' : 'rest'
  if (log?.status === 'done') return 'done'
  if (log?.status === 'modified') return 'modified'
  if (log?.status === 'skipped') return 'skipped'
  return past ? 'missed' : 'upcoming'
}

export function rangeReport(input: { from: ISODate; to: ISODate; today: ISODate; days: CalendarDay[]; program: Program; logs: ReportLog[]; tss: Map<ISODate, number>; scores: Map<ISODate, number> }): RangeReport {
  const byDate = new Map(input.days.map((d) => [d.date, d]))
  const out: ReportDay[] = []
  let planned_min = 0
  let done_min = 0
  let planned_tss = 0
  let done_tss = 0
  let bike_planned = 0
  let bike_done = 0
  let gym_planned = 0
  let gym_done = 0
  let scoreSum = 0
  let scoreN = 0
  let extra_rides = 0
  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    const day = byDate.get(date) ?? null
    const ride = day?.bike && !NON_RIDES.has(day.bike.workout_id) ? day.bike : null
    const bikeLog = input.logs.find((l) => l.date === date && l.kind === 'bike')
    const gymLog = input.logs.find((l) => l.date === date && l.kind === 'gym')
    const past = date < input.today
    const bike = outcome(!!ride, bikeLog, past)
    const gym = outcome(!!day?.gym, gymLog, past)
    const tss_planned = day ? plannedTss(day, input.program) : 0
    const tss_done = date <= input.today ? (input.tss.get(date) ?? null) : null
    const score = input.scores.get(date) ?? null
    if (ride) {
      planned_min += ride.duration_min
      planned_tss += tss_planned
      bike_planned++
      if (bike === 'done' || bike === 'modified') {
        bike_done++
        done_min += bikeLog?.duration_min ?? ride.duration_min
      }
    } else if (bike === 'extra') {
      extra_rides++
      done_min += bikeLog?.duration_min ?? 0
    }
    if (day?.gym) {
      gym_planned++
      if (gym === 'done' || gym === 'modified') gym_done++
    }
    if (tss_done != null) done_tss += tss_done
    if (score != null) {
      scoreSum += score
      scoreN++
    }
    out.push({ date, day, bike_name: ride?.name ?? null, bike_min: ride?.duration_min ?? 0, key: day?.day_type === 'key', gym_name: day?.gym?.name ?? null, bike, gym, tss_planned, tss_done, score })
  }
  const issues = out.filter((d) => d.bike === 'skipped' || d.bike === 'missed' || d.bike === 'modified' || d.gym === 'skipped' || d.gym === 'missed')
  return { from: input.from, to: input.to, days: out, planned_min, done_min, planned_tss, done_tss, bike_planned, bike_done, gym_planned, gym_done, score: scoreN ? Math.round(scoreSum / scoreN) : null, issues, extra_rides }
}

/** Tygodnie (poniedziałki) zawierające się w [from, to] – do tabeli miesiąca. */
export function weeksIn(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let m = mondayOf(from); m <= to; m = addDays(m, 7)) out.push(m)
  return out
}

/** Zmiana średniej masy: średnia z ostatnich 7 dni okresu vs 7 dni przed jego początkiem. */
export function weightChange(checkins: { date: ISODate; weight_kg: number | null }[], from: ISODate, to: ISODate): { start: number | null; end: number | null; delta: number | null } {
  const avg = (a: ISODate, b: ISODate) => {
    const w = checkins.filter((c) => c.weight_kg != null && c.date >= a && c.date <= b).map((c) => c.weight_kg as number)
    return w.length ? Math.round((w.reduce((x, y) => x + y, 0) / w.length) * 10) / 10 : null
  }
  const start = avg(addDays(from, -7), addDays(from, -1)) ?? avg(from, addDays(from, 6))
  const end = avg(addDays(to, -6), to)
  return { start, end, delta: start != null && end != null ? Math.round((end - start) * 10) / 10 : null }
}
