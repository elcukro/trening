import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { addDays, toUtc, type ISODate } from '@/engine/dates'

export const TIMEZONE = 'Europe/Warsaw'

/** Dzisiejsza data w strefie Europe/Warsaw; `?today=YYYY-MM-DD` w URL nadpisuje (testy, podgląd). */
export function todayISO(): ISODate {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('today')
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q
  }
  return format(new TZDate(Date.now(), TIMEZONE), 'yyyy-MM-dd')
}

/** Godzina lokalna w Warszawie danego dnia jako ISO w UTC (np. start treningu 6:00 na Bolcie). */
export function localTimeISO(date: ISODate, hour = 6): string {
  const d = new Date(toUtc(date))
  const local = new TZDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, TIMEZONE)
  return new Date(local.getTime()).toISOString() // forma UTC („Z”) – jednoznaczna dla API Wahoo
}

function asDate(iso: ISODate): Date {
  return new Date(toUtc(iso))
}

/** „śr 16.09” */
export function fmtShort(iso: ISODate): string {
  return format(asDate(iso), 'EEEEEE d.MM', { locale: pl })
}

/** „środa, 16 września 2026” */
export function fmtLong(iso: ISODate): string {
  return format(asDate(iso), 'EEEE, d MMMM yyyy', { locale: pl })
}

/** „16.09” */
export function fmtDayMonth(iso: ISODate): string {
  return format(asDate(iso), 'd.MM')
}

/** „16.09.2026” */
export function fmtDate(iso: ISODate): string {
  return format(asDate(iso), 'dd.MM.yyyy')
}

export function fmtRange(a: ISODate, b: ISODate): string {
  return `${format(asDate(a), 'd.MM')}–${format(asDate(b), 'd.MM')}`
}

/** „wrzesień 2026” */
export function fmtMonth(iso: ISODate): string {
  return format(asDate(iso), 'LLLL yyyy', { locale: pl })
}

/** Pierwszy dzień miesiąca (`YYYY-MM-01`) dla daty ISO. */
export function monthStart(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`
}

/** Przesunięcie o `n` miesięcy – zwraca pierwszy dzień miesiąca. */
export function addMonths(iso: ISODate, n: number): ISODate {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`
}

/** Ostatni dzień miesiąca. */
export function monthEnd(iso: ISODate): ISODate {
  return addDays(addMonths(iso, 1), -1)
}
