import { addDays, diffDays, type ISODate } from './dates'

/**
 * Gotowość z danych Apple Health (docs/27 § 2): HRV względem własnej normy zawodnika. Progi są względne (odchylenie
 * od własnej średniej), więc nie zależą od programu ani od zawodnika – tak jak R6 dla tętna spoczynkowego.
 */
export interface ReadinessCheckin {
  date: ISODate
  hrv_ms?: number | null
}

/** Ile dni wstecz liczy się norma HRV i ile pomiarów musi w niej być, żeby ją ufać. */
export const HRV_BASELINE_DAYS = 28
export const HRV_MIN_SAMPLES = 7

export interface HrvStatus {
  value: number
  /** średnia z 28 dni przed tym dniem */
  baseline: number
  sd: number
  /** poniżej normy: wartość < średnia − 1 SD */
  low: boolean
}

/** HRV dnia na tle własnej normy; `null`, gdy brak pomiaru dnia albo za mało historii. */
export function hrvStatus(checkins: ReadinessCheckin[], date: ISODate): HrvStatus | null {
  const today = checkins.find((c) => c.date === date)?.hrv_ms
  if (today == null) return null
  const past = checkins.filter((c) => c.hrv_ms != null && c.date < date && diffDays(date, c.date) <= HRV_BASELINE_DAYS).map((c) => c.hrv_ms as number)
  if (past.length < HRV_MIN_SAMPLES) return null
  const baseline = past.reduce((a, b) => a + b, 0) / past.length
  const sd = Math.sqrt(past.reduce((a, b) => a + (b - baseline) ** 2, 0) / past.length)
  return { value: today, baseline, sd, low: today < baseline - Math.max(sd, 1) }
}

/** Sygnał zmęczenia: HRV poniżej normy dwa dni z rzędu (jeden zły pomiar to jeszcze szum). */
export function hrvAlarm(checkins: ReadinessCheckin[], date: ISODate): boolean {
  return !!hrvStatus(checkins, date)?.low && !!hrvStatus(checkins, addDays(date, -1))?.low
}
