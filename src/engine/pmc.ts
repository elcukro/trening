import { HR_ZONE_TSS_PER_HOUR } from './analysis'
import { addDays, diffDays, mondayOf, type ISODate } from './dates'
import type { PowerZone, Program } from './schema'
import type { CalendarDay } from './types'
import { resolveWorkout } from './zones'

/**
 * Performance Management Chart (Banister/Coggan): CTL = forma długa (42 dni), ATL = zmęczenie (7 dni), TSB = CTL − ATL
 * z poprzedniego dnia. Przeszłość z faktycznego TSS (jazdy), przyszłość z TSS planowanego z silnika – pkt 4 planu (docs/14).
 */

export const CTL_DAYS = 42
export const ATL_DAYS = 7
/** R7 w wersji PMC: przyrost CTL powyżej tylu punktów na tydzień to zbyt szybka progresja. */
export const RAMP_LIMIT_PER_WEEK = 7

const NON_RIDES = new Set(['TRIP', 'TRAVEL_REST'])

/** TSS na godzinę w strefie: kwadrat środka strefy mocy × 100; bez strefy mocy – tabela tętna. */
export function zoneTssPerHour(zoneId: string, powerZones: PowerZone[]): number {
  const z = powerZones.find((p) => p.id === zoneId)
  if (z) {
    const mid = z.id === 'Z1' ? 0.5 : (z.low + z.high) / 2
    return Math.round(mid * mid * 100)
  }
  if (zoneId === 'Z5a') return 106
  return HR_ZONE_TSS_PER_HOUR[zoneId] ?? 49
}

/** Planowany TSS dnia z kroków treningu (0 bez jazdy; wyjazd i dojazd nie liczą się). */
export function plannedTss(day: CalendarDay, program: Program): number {
  if (!day.bike || NON_RIDES.has(day.bike.workout_id)) return 0
  const w = program.bike_workouts[day.bike.workout_id]
  if (!w) return 0
  const r = resolveWorkout(w, day.bike.duration_min, null)
  let tss = 0
  for (const s of r.steps) tss += (s.duration_s / 3600) * zoneTssPerHour(s.zone, program.power_zones_ftp_fraction)
  return Math.round(tss)
}

export interface PmcPoint {
  date: ISODate
  /** obciążenie użyte w modelu: faktyczne (przeszłość) albo planowane (przyszłość) */
  load: number
  planned: number
  actual: number | null
  ctl: number
  atl: number
  tsb: number
  future: boolean
  deload: boolean
}

export interface PmcInput {
  days: CalendarDay[]
  program: Program
  /** faktyczny TSS per dzień (jazdy) – tylko daty ≤ today mają znaczenie */
  actual: Map<ISODate, number>
  today: ISODate
  from: ISODate
  to: ISODate
  /** wartości startowe w dniu `from` − 1 (np. z historii sprzed okna) */
  seed?: { ctl: number; atl: number }
}

/** Seria PMC dzień po dniu w [from, to]; do `today` włącznie liczy się TSS faktyczny (brak = 0), dalej planowany. */
export function pmcSeries(inp: PmcInput): PmcPoint[] {
  const byDate = new Map(inp.days.map((d) => [d.date, d]))
  const n = diffDays(inp.to, inp.from) + 1
  const out: PmcPoint[] = []
  let ctl = inp.seed?.ctl ?? 0
  let atl = inp.seed?.atl ?? 0
  for (let i = 0; i < n; i++) {
    const date = addDays(inp.from, i)
    const day = byDate.get(date)
    const planned = day ? plannedTss(day, inp.program) : 0
    const future = date > inp.today
    const actual = future ? null : (inp.actual.get(date) ?? 0)
    const load = future ? planned : (actual as number)
    const tsb = Math.round((ctl - atl) * 10) / 10
    ctl = ctl + (load - ctl) / CTL_DAYS
    atl = atl + (load - atl) / ATL_DAYS
    out.push({ date, load, planned, actual, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb, future, deload: day?.week_type === 'deload' })
  }
  return out
}

/** Przyrost CTL w ostatnich 7 dniach (pkt/tydz.) i ostrzeżenie, gdy przekracza limit. */
export function rampRate(series: PmcPoint[], upTo: ISODate): { per_week: number; warning: string | null } | null {
  const end = series.filter((p) => p.date <= upTo).at(-1)
  const start = series.find((p) => p.date === addDays(end?.date ?? upTo, -7))
  if (!end || !start) return null
  const per_week = Math.round((end.ctl - start.ctl) * 10) / 10
  const warning = per_week > RAMP_LIMIT_PER_WEEK ? `Forma (CTL) rośnie o ${per_week} pkt/tydz. – szybciej niż ${RAMP_LIMIT_PER_WEEK}. Rozważ krótszą długą jazdę albo dzień wolny więcej (R7).` : null
  return { per_week, warning }
}

export interface WeekTss {
  monday: ISODate
  planned: number
  done: number
}

/** TSS tygodnia: plan z silnika vs faktyczny (do `today`). */
export function weekTss(days: CalendarDay[], program: Program, actual: Map<ISODate, number>, anyDate: ISODate, today: ISODate): WeekTss {
  const monday = mondayOf(anyDate)
  let planned = 0
  let done = 0
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i)
    const day = days.find((d) => d.date === date)
    if (day) planned += plannedTss(day, program)
    if (date <= today) done += actual.get(date) ?? 0
  }
  return { monday, planned, done }
}
