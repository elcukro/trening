import { t as tr } from '../i18n'
import { addDays, diffDays, mondayOf, type ISODate } from './dates'
import type { CalendarDay } from './types'

/** R11: LTHR obowiązujące danego dnia = ostatni test sprzed tego dnia (strefy od następnego dnia), inaczej wartość z ustawień. */
export interface LthrSource {
  date: ISODate
  lthr_bpm: number
}

export function effectiveLthr(date: ISODate, manual: number | null, tests: LthrSource[]): { lthr: number | null; source: 'test' | 'manual' | null; test_date?: ISODate } {
  const applicable = tests.filter((t) => t.lthr_bpm > 0 && t.date < date).toSorted((a, b) => (a.date < b.date ? -1 : 1))
  const last = applicable.at(-1)
  if (last) return { lthr: last.lthr_bpm, source: 'test', test_date: last.date }
  if (manual) return { lthr: manual, source: 'manual' }
  return { lthr: null, source: null }
}

/** FTP obowiązujące danego dnia: ostatni test Wattbike sprzed tego dnia, inaczej szacunek z ustawień. */
export function effectiveFtp(date: ISODate, estimate: number, tests: { date: ISODate; ftp_w?: number | null }[]): { ftp: number; source: 'test' | 'estimate'; test_date?: ISODate } {
  const applicable = tests.filter((t) => t.ftp_w && t.ftp_w > 0 && t.date < date).toSorted((a, b) => (a.date < b.date ? -1 : 1))
  const last = applicable.at(-1)
  if (last) return { ftp: last.ftp_w as number, source: 'test', test_date: last.date }
  return { ftp: estimate, source: 'estimate' }
}

// ---------------------------------------------------------------- masa
export interface WeightPoint {
  date: ISODate
  weight_kg: number
}

export interface WeightSeriesPoint extends WeightPoint {
  avg7: number | null
  target: number
}

/** Linia celu: liniowo od masy startowej (w `program_start`) w dół o `ratePerWeek` do celu, potem płasko. */
export function targetWeightAt(date: ISODate, startDate: ISODate, startKg: number, targetKg: number, ratePerWeek = 0.45): number {
  const weeks = Math.max(0, diffDays(date, startDate) / 7)
  return Math.max(targetKg, startKg - weeks * ratePerWeek)
}

export function weightSeries(points: WeightPoint[], startDate: ISODate, startKg: number, targetKg: number): WeightSeriesPoint[] {
  const sorted = points.toSorted((a, b) => (a.date < b.date ? -1 : 1))
  return sorted.map((p, i) => {
    const from = addDays(p.date, -6)
    const window = sorted.slice(0, i + 1).filter((q) => q.date >= from)
    const avg7 = window.length >= 3 ? window.reduce((a, q) => a + q.weight_kg, 0) / window.length : null
    return { ...p, avg7, target: targetWeightAt(p.date, startDate, startKg, targetKg) }
  })
}

/** Tempo zmiany masy: różnica średnich 7-dniowych z ostatniego tygodnia i poprzedniego (kg/tydz. i %/tydz.). */
export function weightTrend(points: WeightPoint[]): { kg_per_week: number; pct_per_week: number; warning: string | null } | null {
  const sorted = points.toSorted((a, b) => (a.date < b.date ? -1 : 1))
  const last = sorted.at(-1)
  if (!last || sorted.length < 4) return null
  const avg = (from: ISODate, to: ISODate) => {
    const w = sorted.filter((p) => p.date >= from && p.date <= to)
    return w.length ? w.reduce((a, p) => a + p.weight_kg, 0) / w.length : null
  }
  const cur = avg(addDays(last.date, -6), last.date)
  const prev = avg(addDays(last.date, -13), addDays(last.date, -7))
  if (cur == null || prev == null) return null
  const kg = cur - prev
  const pct = (kg / prev) * 100
  let warning: string | null = null
  if (pct < -1) warning = tr().engine.progress.fastLoss
  else if (kg > 0.3) warning = tr().engine.progress.gaining
  return { kg_per_week: kg, pct_per_week: pct, warning }
}

// ---------------------------------------------------------------- objętość
export interface WeekVolume {
  monday: ISODate
  week: number
  planned_min: number
  done_min: number
  planned_sessions: number
  done_sessions: number
  compliance_pct: number
}

export interface LoggedRide {
  date: ISODate
  status: 'done' | 'modified' | 'skipped' | 'planned' | 'in_progress'
  duration_min: number | null
}

const NON_RIDES = new Set(['TRIP', 'TRAVEL_REST'])

/** Plan vs wykonanie per tydzień (do `upTo` włącznie, w tym dni bez wpisu = 0). */
export function weeklyVolume(days: CalendarDay[], rides: LoggedRide[], upTo: ISODate, weeks = 8): WeekVolume[] {
  const byDate = new Map(rides.map((r) => [r.date, r]))
  const lastMonday = mondayOf(upTo)
  const out: WeekVolume[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(lastMonday, -7 * i)
    const end = addDays(monday, 6)
    const inWeek = days.filter((d) => d.date >= monday && d.date <= end && d.bike && !NON_RIDES.has(d.bike.workout_id))
    if (inWeek.length === 0) continue
    let planned = 0
    let done = 0
    let doneSessions = 0
    for (const d of inWeek) {
      planned += d.bike!.duration_min
      const r = byDate.get(d.date)
      if (r && (r.status === 'done' || r.status === 'modified')) {
        done += r.duration_min ?? d.bike!.duration_min
        doneSessions++
      }
    }
    out.push({
      monday,
      week: inWeek[0]!.week,
      planned_min: planned,
      done_min: done,
      planned_sessions: inWeek.length,
      done_sessions: doneSessions,
      compliance_pct: planned ? Math.round((Math.min(done, planned) / planned) * 100) : 0,
    })
  }
  return out
}

export function compliance(volumes: WeekVolume[], lastN = 4): number | null {
  const v = volumes.slice(-lastN).filter((w) => w.planned_min > 0)
  if (v.length === 0) return null
  const planned = v.reduce((a, w) => a + w.planned_min, 0)
  const done = v.reduce((a, w) => a + Math.min(w.done_min, w.planned_min), 0)
  return Math.round((done / planned) * 100)
}
