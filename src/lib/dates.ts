import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { enGB, pl } from 'date-fns/locale'
import { getLang } from '@/i18n/core'
import { addDays, toUtc, type ISODate } from '@/engine/dates'

export const TIMEZONE = 'Europe/Warsaw'

/** Parametry podglądu z URL (`?today=`, `?hour=`) – wszędzie poza produkcyjnym buildem aplikacji iOS (docs/26 § 1). */
export function urlParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  if (import.meta.env.VITE_TARGET === 'ios' && import.meta.env.PROD) return null
  return new URLSearchParams(window.location.search).get(name)
}

/** Dzisiejsza data w strefie Europe/Warsaw; `?today=YYYY-MM-DD` w URL nadpisuje (testy, podgląd). */
export function todayISO(): ISODate {
  const q = urlParam('today')
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q
  return format(new TZDate(Date.now(), TIMEZONE), 'yyyy-MM-dd')
}

/** Bieżąca godzina w Warszawie (0–23); `?hour=HH` w URL nadpisuje ją tak jak `?today=` datę (podgląd stanów dnia w /m). */
export function nowHour(): number {
  const q = urlParam('hour')
  if (q && /^\d{1,2}$/.test(q)) return Math.min(23, Number(q))
  return new TZDate(Date.now(), TIMEZONE).getHours()
}

/** Bieżący czas w Warszawie jako HH:MM (godzina posiłku). */
export function nowHHMM(): string {
  return format(new TZDate(Date.now(), TIMEZONE), 'HH:mm')
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

const loc = () => (getLang() === 'pl' ? pl : enGB)
const isPl = () => getLang() === 'pl'

/** „śr 16.09” / „Wed 16 Sep” */
export function fmtShort(iso: ISODate): string {
  return isPl() ? format(asDate(iso), 'EEEEEE d.MM', { locale: pl }) : format(asDate(iso), 'EEE d MMM', { locale: enGB })
}

/** „środa, 16 września 2026” / „Wednesday, 16 September 2026” */
export function fmtLong(iso: ISODate): string {
  return format(asDate(iso), 'EEEE, d MMMM yyyy', { locale: loc() })
}

/** „16.09” / „16 Sep” */
export function fmtDayMonth(iso: ISODate): string {
  return isPl() ? format(asDate(iso), 'd.MM') : format(asDate(iso), 'd MMM', { locale: enGB })
}

/** „16.09.2026” / „16 Sep 2026” */
export function fmtDate(iso: ISODate): string {
  return isPl() ? format(asDate(iso), 'dd.MM.yyyy') : format(asDate(iso), 'd MMM yyyy', { locale: enGB })
}

export function fmtRange(a: ISODate, b: ISODate): string {
  return `${fmtDayMonth(a)}–${fmtDayMonth(b)}`
}

/** „wrzesień 2026” / „September 2026” */
export function fmtMonth(iso: ISODate): string {
  return format(asDate(iso), 'LLLL yyyy', { locale: loc() })
}

/** Locale date-fns dla bieżącego języka – do własnych formatów (`format(d, 'EEEE', { locale: dateLocale() })`). */
export function dateLocale() {
  return loc()
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
