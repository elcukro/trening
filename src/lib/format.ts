/** Formatowanie po polsku: przecinek dziesiętny, jednostki metryczne. */

export function num(value: number, digits = 1): string {
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: digits })
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

export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n)
  if (abs === 1) return `${n} ${one}`
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} ${few}`
  return `${n} ${many}`
}

export function days(n: number): string {
  return plural(n, 'dzień', 'dni', 'dni')
}
