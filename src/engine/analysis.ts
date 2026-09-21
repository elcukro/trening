import type { HrZone } from './schema'
import type { ResolvedStep, ResolvedWorkout } from './types'
import { zoneDistribution } from './zones'

/**
 * Analiza wykonanej jazdy: obciążenie (TSS/IF) i dopasowanie kroków treningu do strumienia z Stravy
 * (pkt 1 planu usprawnień, docs/14). Czysty TS – bez UI, bez bazy.
 */

/** Próbki jazdy co `dt` s (format z `strava_streams`, patrz supabase/functions/_shared/metrics.ts). */
export interface RideSamples {
  dt: number
  n: number
  hr: (number | null)[] | null
  watts: (number | null)[] | null
  cadence: (number | null)[] | null
  speed: (number | null)[] | null
  distance: (number | null)[] | null
  altitude: (number | null)[] | null
  moving: (0 | 1)[] | null
}

// ---------------------------------------------------------------- obciążenie
export type LoadMethod = 'power' | 'hr' | 'rpe'

export interface RideLoad {
  tss: number
  /** Intensity Factor (dla tętna/RPE – równoważny, wyprowadzony z TSS) */
  if: number
  method: LoadMethod
}

/** TSS na godzinę w strefie tętna – reprezentatywny IF strefy do kwadratu × 100 (Z2 ≈ 0,7 → 49). */
export const HR_ZONE_TSS_PER_HOUR: Record<string, number> = { Z1: 30, Z2: 49, Z3: 72, Z4: 90, Z5a: 110, Z5b: 132, Z5c: 156 }

/** IF z RPE (1–10): 5 → 0,70, 7 → 0,82, 10 → 1,00. */
export function ifFromRpe(rpe: number): number {
  return Math.min(1.1, Math.max(0.4, 0.4 + rpe * 0.06))
}

export interface RideLoadInput {
  moving_s: number
  device_watts?: boolean | null
  np_w?: number | null
  avg_watts?: number | null
  ftp?: number | null
  hr_histogram?: number[] | null
  zones?: HrZone[] | null
  lthr?: number | null
  rpe?: number | null
}

/** Obciążenie jazdy: moc (NP/FTP) → tętno (czas w strefach) → RPE; null, gdy nie ma z czego liczyć. */
export function rideLoad(r: RideLoadInput): RideLoad | null {
  const hours = r.moving_s / 3600
  if (hours <= 0) return null
  const np = r.device_watts ? (r.np_w ?? r.avg_watts) : null
  if (np && r.ftp) {
    const ifv = np / r.ftp
    return { tss: Math.round(hours * ifv * ifv * 100), if: round2(ifv), method: 'power' }
  }
  if (r.hr_histogram && r.lthr && r.zones) {
    const dist = zoneDistribution(r.hr_histogram, r.zones, r.lthr)
    let tss = 0
    let secs = 0
    for (const z of dist) {
      tss += (z.seconds / 3600) * (HR_ZONE_TSS_PER_HOUR[z.id] ?? 49)
      secs += z.seconds
    }
    if (secs >= 300) {
      const h = secs / 3600
      return { tss: Math.round(tss), if: round2(Math.sqrt(tss / (h * 100))), method: 'hr' }
    }
  }
  if (r.rpe) {
    const ifv = ifFromRpe(r.rpe)
    return { tss: Math.round(hours * ifv * ifv * 100), if: round2(ifv), method: 'rpe' }
  }
  return null
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// ---------------------------------------------------------------- dopasowanie kroków
export type StepRating = 'ok' | 'warn' | 'miss'

export interface StepResult {
  index: number
  name: string
  zone: string
  planned_s: number
  /** początek i koniec kroku w czasie ruchu (s) */
  from_s: number
  to_s: number
  avg_watts: number | null
  avg_hr: number | null
  avg_cadence: number | null
  /** cel kadencji kroku i % czasu w nim (± 5 rpm) */
  cadence_target: [number, number] | null
  cadence_in_target_pct: number | null
  /** cel użyty do oceny */
  target: { kind: 'watts' | 'bpm'; low: number; high: number } | null
  in_target_pct: number | null
  rating: StepRating | null
  /** krok „pracy” (liczy się do wyniku) czy rozgrzewka/luz */
  work: boolean
}

export interface MatchResult {
  offset_s: number
  steps: StepResult[]
  /** zgodność kroków pracy ważona czasem (0–100) albo null, gdy nie ma czego oceniać */
  score: number | null
  /** ile sekund ruchu ma jazda */
  moving_s: number
}

/** `active` to w formacie Wahoo zwykły interwał pracy – lekkie są tylko rozgrzewka, schłodzenie, przerwa i odpoczynek. */
const EASY_TYPES = new Set(['wu', 'cd', 'recover', 'rest'])

export function isWorkStep(step: Pick<ResolvedStep, 'intensity_type' | 'zone'>): boolean {
  return !EASY_TYPES.has(step.intensity_type) && step.zone !== 'Z1'
}

/** Indeksy próbek w ruchu (gdy brak flagi – wszystkie). */
function movingIndex(s: RideSamples): number[] {
  const idx: number[] = []
  for (let i = 0; i < s.n; i++) if (!s.moving || s.moving[i]) idx.push(i)
  return idx
}

function mean(vals: (number | null)[], from: number, to: number, idx: number[]): number | null {
  let sum = 0
  let n = 0
  for (let k = from; k < to; k++) {
    const v = vals[idx[k]!]
    if (v == null) continue
    sum += v
    n++
  }
  return n ? Math.round(sum / n) : null
}

function inTargetPct(vals: (number | null)[], from: number, to: number, idx: number[], low: number, high: number, easy: boolean): number | null {
  let hit = 0
  let n = 0
  for (let k = from; k < to; k++) {
    const v = vals[idx[k]!]
    if (v == null) continue
    n++
    if (easy ? v <= high : v >= low && v <= high) hit++
  }
  return n ? Math.round((hit / n) * 100) : null
}

export function ratingFor(pct: number | null): StepRating | null {
  if (pct == null) return null
  return pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'miss'
}

/**
 * Dopasowuje kroki treningu do próbek: krok k zajmuje [cum_k, cum_k + dur_k) czasu ruchu, przesunięte o `offset_s`
 * (start treningu na Bolcie nie musi pokrywać się ze startem nagrania). Ocena kroku = % czasu w celu:
 * moc, gdy jest miernik i cel w watach, inaczej tętno; kroki lekkie oceniamy tylko „nie za mocno” (≤ górna granica).
 * `auto` szuka przesunięcia (−5…+15 min co 15 s), które maksymalizuje zgodność kroków pracy.
 */
export function matchSteps(workout: ResolvedWorkout, s: RideSamples, opts: { offset_s?: number; auto?: boolean; ftp?: number | null } = {}): MatchResult {
  const idx = movingIndex(s)
  const moving_s = idx.length * s.dt
  const usePower = !!s.watts && workout.steps.some((st) => st.watts)
  const evalAt = (offset: number): MatchResult => {
    let cum = offset
    const steps: StepResult[] = []
    let wSum = 0
    let wN = 0
    workout.steps.forEach((st, index) => {
      const from_s = cum
      const to_s = cum + st.duration_s
      cum = to_s
      const from = Math.max(0, Math.round(from_s / s.dt))
      const to = Math.min(idx.length, Math.round(to_s / s.dt))
      const work = isWorkStep(st)
      const easy = !work
      let target: StepResult['target'] = null
      let pct: number | null = null
      if (to > from) {
        if (usePower && st.watts && s.watts) {
          const tol = opts.ftp ? Math.round(opts.ftp * 0.05) : 10
          target = { kind: 'watts', low: st.watts[0], high: st.watts[1] }
          pct = inTargetPct(s.watts, from, to, idx, st.watts[0] - tol, st.watts[1] + tol, easy)
        } else if (st.bpm && s.hr) {
          target = { kind: 'bpm', low: st.bpm[0], high: st.bpm[1] }
          pct = inTargetPct(s.hr, from, to, idx, st.bpm[0] - 3, st.bpm[1] + 3, easy)
        }
      }
      if (work && pct != null) {
        wSum += pct * st.duration_s
        wN += st.duration_s
      }
      const cadPct = to > from && s.cadence && st.cadence_rpm ? inTargetPct(s.cadence.map((c) => (c && c > 0 ? c : null)), from, to, idx, st.cadence_rpm[0] - 5, st.cadence_rpm[1] + 5, false) : null
      steps.push({
        index,
        name: st.name,
        zone: st.zone,
        planned_s: st.duration_s,
        from_s,
        to_s,
        avg_watts: to > from && s.watts ? mean(s.watts, from, to, idx) : null,
        avg_hr: to > from && s.hr ? mean(s.hr, from, to, idx) : null,
        avg_cadence: to > from && s.cadence ? mean(s.cadence.map((c) => (c && c > 0 ? c : null)), from, to, idx) : null,
        cadence_target: st.cadence_rpm ?? null,
        cadence_in_target_pct: cadPct,
        target,
        in_target_pct: pct,
        rating: ratingFor(pct),
        work,
      })
    })
    return { offset_s: offset, steps, score: wN ? Math.round(wSum / wN) : null, moving_s }
  }
  if (!opts.auto) return evalAt(opts.offset_s ?? 0)
  let best = evalAt(0)
  for (let off = -300; off <= 900; off += 15) {
    if (off === 0) continue
    const r = evalAt(off)
    if (r.score != null && (best.score == null || r.score > best.score + 0.5)) best = r
  }
  return best
}

/** Status dnia na podstawie zgodności: ≥ 60 % kroków pracy w celu = wykonane, inaczej zmienione. */
export function statusFromScore(score: number | null): 'done' | 'modified' {
  return score == null || score >= 60 ? 'done' : 'modified'
}

export interface ChartPoint {
  /** minuta czasu ruchu */
  t: number
  watts: number | null
  hr: number | null
  lo: number | null
  hi: number | null
}

/** Punkty do wykresu (co `every` s czasu ruchu) z pasem celu z dopasowanych kroków. */
export function chartSeries(s: RideSamples, match: MatchResult, every = 30): ChartPoint[] {
  const idx = movingIndex(s)
  const per = Math.max(1, Math.round(every / s.dt))
  const out: ChartPoint[] = []
  for (let k = 0; k < idx.length; k += per) {
    const t_s = k * s.dt
    const step = match.steps.find((st) => t_s >= st.from_s && t_s < st.to_s)
    const w = s.watts ? mean(s.watts, k, Math.min(idx.length, k + per), idx) : null
    const h = s.hr ? mean(s.hr, k, Math.min(idx.length, k + per), idx) : null
    out.push({ t: Math.round(t_s / 60), watts: w, hr: h, lo: step?.target?.low ?? null, hi: step?.target?.high ?? null })
  }
  return out
}
