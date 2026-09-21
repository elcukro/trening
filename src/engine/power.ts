import type { RideSamples } from './analysis'
import { addDays, type ISODate } from './dates'

/**
 * Pkt 3 planu usprawnień (docs/14): FTP i LTHR z jazd (bez formalnego testu), krzywa mocy, historia FTP i W/kg.
 * Czysty TS – dane z `strava_activities` (mmp_w liczone przy imporcie) i z próbek jazdy.
 */

export interface RideForPower {
  id: string
  date: ISODate
  name?: string | null
  device_watts?: boolean | null
  mmp_w?: Record<string, number | null> | null
  moving_time_s: number
}

export const MMP_KEYS = ['5', '60', '300', '1200', '3600'] as const
export const MMP_LABEL: Record<(typeof MMP_KEYS)[number], string> = { '5': '5 s', '60': '1 min', '300': '5 min', '1200': '20 min', '3600': '60 min' }

/** Współczynnik: FTP ≈ 95 % najlepszych 20 min (Allen–Coggan); 60 min liczy się wprost. */
export const FTP_FROM_20MIN = 0.95
/** Propozycja zmiany FTP dopiero przy różnicy ≥ 3 % – mniejsze wahania to szum dnia. */
export const FTP_SUGGEST_MIN_GAIN = 0.03

export interface FtpSuggestion {
  ftp: number
  ride_id: string
  ride_date: ISODate
  ride_name: string | null
  /** z jakiego wysiłku: najlepsze 20 min × 0,95 albo pełne 60 min */
  basis: '20min' | '60min'
  effort_w: number
  current_ftp: number
}

/**
 * Najmocniejsza jazda z miernikiem od `since` (wyłącznie): jeśli 0,95 × MMP20 albo MMP60 przekracza aktualne FTP
 * o ≥ 3 %, zwraca propozycję. `dismissed` = jazdy, dla których użytkownik odrzucił propozycję.
 */
export function suggestFtp(rides: RideForPower[], currentFtp: number, since: ISODate | null, dismissed: Set<string> = new Set()): FtpSuggestion | null {
  let best: FtpSuggestion | null = null
  for (const r of rides) {
    if (!r.device_watts || !r.mmp_w || dismissed.has(r.id)) continue
    if (since && r.date <= since) continue
    const m20 = r.mmp_w['1200'] ?? 0
    const m60 = r.mmp_w['3600'] ?? 0
    const from20 = Math.round(m20 * FTP_FROM_20MIN)
    const cand = from20 >= m60 ? { ftp: from20, basis: '20min' as const, effort_w: m20 } : { ftp: m60, basis: '60min' as const, effort_w: m60 }
    if (cand.ftp < currentFtp * (1 + FTP_SUGGEST_MIN_GAIN)) continue
    if (!best || cand.ftp > best.ftp) best = { ...cand, ride_id: r.id, ride_date: r.date, ride_name: r.name ?? null, current_ftp: currentFtp }
  }
  return best
}

export interface PowerCurvePoint {
  key: (typeof MMP_KEYS)[number]
  label: string
  seconds: number
  /** najlepsza wartość w oknie krótszym (np. 28 dni) */
  recent: number | null
  /** najlepsza wartość w oknie dłuższym (np. 90 dni) */
  all: number | null
  recent_date: ISODate | null
  all_date: ISODate | null
}

/** Krzywa mocy: maksimum z jazd z miernikiem dla każdej długości, w dwóch oknach czasu. */
export function powerCurve(rides: RideForPower[], today: ISODate, recentDays = 28, allDays = 90): PowerCurvePoint[] {
  const fromRecent = addDays(today, -recentDays)
  const fromAll = addDays(today, -allDays)
  return MMP_KEYS.map((key) => {
    let recent: number | null = null
    let all: number | null = null
    let recent_date: ISODate | null = null
    let all_date: ISODate | null = null
    for (const r of rides) {
      if (!r.device_watts || !r.mmp_w || r.date > today || r.date < fromAll) continue
      const v = r.mmp_w[key]
      if (v == null || v <= 0) continue
      if (all == null || v > all) {
        all = v
        all_date = r.date
      }
      if (r.date >= fromRecent && (recent == null || v > recent)) {
        recent = v
        recent_date = r.date
      }
    }
    return { key, label: MMP_LABEL[key], seconds: Number(key), recent, all, recent_date, all_date }
  })
}

export interface BestEffort {
  /** początek okna w próbkach (indeks w czasie ruchu) */
  start_index: number
  avg_watts: number
  avg_hr: number | null
  /** średnie tętno z drugiej połowy okna – bliższe LTHR niż średnia z całości (tętno dogania z opóźnieniem) */
  hr_second_half: number | null
}

/** Najlepsze okno `seconds` s mocy w próbkach w ruchu, ze średnim tętnem (do LTHR z jazdy). */
export function bestEffort(s: RideSamples, seconds = 1200): BestEffort | null {
  if (!s.watts) return null
  const idx: number[] = []
  for (let i = 0; i < s.n; i++) if (!s.moving || s.moving[i]) idx.push(i)
  const w = Math.round(seconds / s.dt)
  if (w < 1 || w > idx.length) return null
  const prefix = new Float64Array(idx.length + 1)
  for (let k = 0; k < idx.length; k++) prefix[k + 1] = prefix[k]! + (s.watts[idx[k]!] ?? 0)
  let bestK = 0
  let best = -Infinity
  for (let k = 0; k + w <= idx.length; k++) {
    const v = prefix[k + w]! - prefix[k]!
    if (v > best) {
      best = v
      bestK = k
    }
  }
  const avg = (from: number, to: number): number | null => {
    if (!s.hr) return null
    let sum = 0
    let n = 0
    for (let k = from; k < to; k++) {
      const h = s.hr[idx[k]!]
      if (h == null || h <= 0) continue
      sum += h
      n++
    }
    return n ? Math.round(sum / n) : null
  }
  return { start_index: bestK, avg_watts: Math.round(best / w), avg_hr: avg(bestK, bestK + w), hr_second_half: avg(bestK + Math.floor(w / 2), bestK + w) }
}

/**
 * LTHR z jazdy: tętno z drugiej połowy najlepszych 20 min mocy, o ile ten wysiłek jest progowy
 * (0,95 × moc ≥ 97 % FTP). Bez progowego wysiłku nie zgadujemy.
 */
export function lthrFromRide(s: RideSamples, ftp: number): { lthr: number; effort_w: number } | null {
  const e = bestEffort(s, 1200)
  if (!e || e.hr_second_half == null) return null
  if (e.avg_watts * FTP_FROM_20MIN < ftp * 0.97) return null
  return { lthr: e.hr_second_half, effort_w: e.avg_watts }
}

export interface FtpPoint {
  date: ISODate
  ftp: number
  source: 'test' | 'estimate'
  weight_kg: number | null
  wkg: number | null
}

/** Historia FTP (testy z ftp_w, chronologicznie) z W/kg wg średniej masy z 7 dni przed datą. */
export function ftpSeries(tests: { date: ISODate; ftp_w?: number | null; deleted_at?: string | null }[], weights: { date: ISODate; weight_kg: number }[], estimate: number, programStart: ISODate): FtpPoint[] {
  const w = weights.toSorted((a, b) => (a.date < b.date ? -1 : 1))
  const weightAt = (date: ISODate): number | null => {
    const win = w.filter((p) => p.date <= date && p.date > addDays(date, -7))
    if (win.length) return Math.round((win.reduce((a, p) => a + p.weight_kg, 0) / win.length) * 10) / 10
    const before = w.filter((p) => p.date <= date).at(-1)
    return before ? before.weight_kg : null
  }
  const pts: FtpPoint[] = [{ date: programStart, ftp: estimate, source: 'estimate', weight_kg: null, wkg: null }]
  for (const t of tests.filter((t) => !t.deleted_at && t.ftp_w && t.ftp_w > 0).toSorted((a, b) => (a.date < b.date ? -1 : 1))) {
    pts.push({ date: t.date, ftp: t.ftp_w as number, source: 'test', weight_kg: null, wkg: null })
  }
  return pts.map((p) => {
    const kg = weightAt(p.date)
    return { ...p, weight_kg: kg, wkg: kg ? Math.round((p.ftp / kg) * 100) / 100 : null }
  })
}
