/**
 * Minimalne operacje na datach ISO (YYYY-MM-DD) bez zależności i bez stref czasowych.
 * Silnik operuje wyłącznie na łańcuchach ISO; „dziś” w strefie Europe/Warsaw liczy warstwa UI.
 */
export type ISODate = string

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]

const MS_DAY = 86_400_000

export function toUtc(date: ISODate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`Nieprawidłowa data ISO: ${date}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function fromUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUtc(toUtc(date) + days * MS_DAY)
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUtc(a) - toUtc(b)) / MS_DAY)
}

/** 0 = poniedziałek … 6 = niedziela */
export function weekdayIndex(date: ISODate): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7
}

export function weekdayOf(date: ISODate): Weekday {
  return WEEKDAYS[weekdayIndex(date)]!
}

/** Poniedziałek tygodnia zawierającego datę. */
export function mondayOf(date: ISODate): ISODate {
  return addDays(date, -weekdayIndex(date))
}

export function isValidISODate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  return fromUtc(toUtc(date)) === date
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}
