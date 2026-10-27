import { enCount, getLang, intlLocale, plCount } from '@/i18n/core'

/** Formatowanie w języku zawodnika (docs/34): po polsku przecinek dziesiętny, po angielsku kropka; jednostki metryczne. */

export function num(value: number, digits = 1): string {
  return value.toLocaleString(intlLocale(), { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function kg(value: number, digits = 1): string {
  return `${num(value, digits)} kg`
}

/** 150 → „2 h 30 min”, 45 → „45 min” */
export function minutes(min: number): string {
  if (min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

/** 5400 s → „90 min”, 90 s → „1:30” */
export function seconds(s: number): string {
  if (s % 60 === 0) return `${s / 60} min`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function hours(min: number): string {
  return `${num(min / 60, 1)} h`
}

export function bpm(range: [number, number] | null): string {
  if (!range) return '—'
  return `${range[0]}–${range[1]} bpm`
}

export function rpe(range: [number, number]): string {
  return range[0] === range[1] ? `RPE ${range[0]}` : `RPE ${range[0]}–${range[1]}`
}

/** Polska odmiana liczebnika („5 dni”). Teksty dwujęzyczne biorą formy ze słownika (`plCount` / `enCount` w `@/i18n`). */
export function plural(n: number, one: string, few: string, many: string): string {
  return plCount(n, one, few, many)
}

export function days(n: number): string {
  return getLang() === 'pl' ? plCount(n, 'dzień', 'dni', 'dni') : enCount(n, 'day', 'days')
}
