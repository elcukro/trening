import type { RideSamples } from './analysis'
import { addDays, mondayOf, type ISODate } from './dates'
import type { HrZone, PowerZone } from './schema'
import { computeZones } from './zones'

/**
 * Kadencja i technika pedałowania (pkt 9, docs/14): rozkład kadencji po jeździe, kadencja w strefach,
 * trend tygodniowy i sygnał, gdy w Z2 spada poniżej 75 rpm dwa tygodnie z rzędu. Cel z planu: ≥ 78 rpm.
 */

export const CADENCE_GOAL_RPM = 78
export const CADENCE_LOW_RPM = 75

export const CADENCE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '< 60', min: 0, max: 60 },
  { label: '60–70', min: 60, max: 70 },
  { label: '70–80', min: 70, max: 80 },
  { label: '80–90', min: 80, max: 90 },
  { label: '90–100', min: 90, max: 100 },
  { label: '≥ 100', min: 100, max: Infinity },
]

export interface CadenceBucket {
  label: string
  seconds: number
  pct: number
}

/** Histogram kadencji z próbek w ruchu z kadencją > 0 (postoje i wybieg nie liczą się). */
export function cadenceHistogram(s: RideSamples): { buckets: CadenceBucket[]; avg_rpm: number | null; pedaling_pct: number | null } {
  const buckets = CADENCE_BUCKETS.map((b) => ({ label: b.label, seconds: 0, pct: 0 }))
  if (!s.cadence) return { buckets, avg_rpm: null, pedaling_pct: null }
  let sum = 0
  let n = 0
  let moving = 0
  for (let i = 0; i < s.n; i++) {
    if (s.moving && !s.moving[i]) continue
    moving++
    const c = s.cadence[i]
    if (c == null || c <= 0) continue
    n++
    sum += c
    const k = CADENCE_BUCKETS.findIndex((b) => c >= b.min && c < b.max)
    buckets[k >= 0 ? k : buckets.length - 1]!.seconds += s.dt
  }
  const total = n * s.dt
  if (total > 0) for (const b of buckets) b.pct = Math.round((b.seconds / total) * 100)
  return { buckets, avg_rpm: n ? Math.round(sum / n) : null, pedaling_pct: moving ? Math.round((n / moving) * 100) : null }
}

export interface CadenceByZone {
  zone: string
  seconds: number
  avg_rpm: number | null
}

/** Średnia kadencja w strefach: z mocy (miernik + FTP), inaczej z tętna (LTHR). */
export function cadenceByZone(s: RideSamples, opts: { ftp?: number | null; powerZones?: PowerZone[]; lthr?: number | null; hrZones?: HrZone[]; devicePower?: boolean }): CadenceByZone[] {
  if (!s.cadence) return []
  const usePower = !!opts.devicePower && !!s.watts && !!opts.ftp && !!opts.powerZones
  const useHr = !usePower && !!s.hr && !!opts.lthr && !!opts.hrZones
  if (!usePower && !useHr) return []
  const zones = usePower ? opts.powerZones!.map((z) => ({ id: z.id, low: z.low * opts.ftp!, high: z.high * opts.ftp! })) : computeZones(opts.hrZones!, opts.lthr!).map((z) => ({ id: z.id, low: z.low_bpm, high: z.high_bpm }))
  const acc = zones.map((z) => ({ zone: z.id, seconds: 0, sum: 0, n: 0 }))
  for (let i = 0; i < s.n; i++) {
    if (s.moving && !s.moving[i]) continue
    const c = s.cadence[i]
    if (c == null || c <= 0) continue
    const v = usePower ? s.watts![i] : s.hr![i]
    if (v == null || v <= 0) continue
    let k = zones.findIndex((z, j) => v >= z.low && (v < z.high || j === zones.length - 1))
    if (k < 0) k = v < zones[0]!.low ? 0 : zones.length - 1
    const a = acc[k]!
    a.seconds += s.dt
    a.sum += c
    a.n++
  }
  return acc.filter((a) => a.n > 0).map((a) => ({ zone: a.zone, seconds: a.seconds, avg_rpm: Math.round(a.sum / a.n) }))
}

export interface CadenceWeek {
  monday: ISODate
  avg_rpm: number | null
  rides: number
}

/** Kadencja tygodniowa (ważona czasem ruchu) z jazd, które mają kadencję. */
export function cadenceTrend(rides: { date: ISODate; moving_time_s: number; avg_cadence?: number | null }[], today: ISODate, weeks = 8): CadenceWeek[] {
  const lastMonday = mondayOf(today)
  const out: CadenceWeek[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(lastMonday, -7 * i)
    const end = addDays(monday, 6)
    const inWeek = rides.filter((r) => r.date >= monday && r.date <= end && r.avg_cadence && r.avg_cadence > 0)
    const t = inWeek.reduce((a, r) => a + r.moving_time_s, 0)
    out.push({ monday, avg_rpm: t > 0 ? Math.round(inWeek.reduce((a, r) => a + (r.avg_cadence as number) * r.moving_time_s, 0) / t) : null, rides: inWeek.length })
  }
  return out
}

/** Ostrzeżenie, gdy dwa ostatnie tygodnie z danymi mają średnią < 75 rpm. */
export function lowCadenceWarning(trend: CadenceWeek[]): string | null {
  const withData = trend.filter((w) => w.avg_rpm != null)
  const last2 = withData.slice(-2)
  if (last2.length < 2 || !last2.every((w) => (w.avg_rpm as number) < CADENCE_LOW_RPM)) return null
  return `Średnia kadencja poniżej ${CADENCE_LOW_RPM} rpm drugi tydzień z rzędu (${last2.map((w) => w.avg_rpm).join(' i ')}). Na płaskim celuj w ${CADENCE_GOAL_RPM}–90 rpm: lżejszy bieg, „okrągłe” pedałowanie; siłę na niskiej kadencji zostaw na bloki Z2_FORCE.`
}
