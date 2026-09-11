import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toUtc, type ISODate } from '@/engine/dates'

export const TIMEZONE = 'Europe/Warsaw'

/** Dzisiejsza data w strefie Europe/Warsaw; `?today=YYYY-MM-DD` w URL nadpisuje (testy, podgląd). */
export function todayISO(): ISODate {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('today')
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q
  }
  return format(new TZDate(Date.now(), TIMEZONE), 'yyyy-MM-dd')
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
