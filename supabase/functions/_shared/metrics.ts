/**
 * Metryki jazdy liczone ze strumieni Stravy – czysty TypeScript bez zależności od Deno,
 * żeby ten sam kod testować Vitestem (`src/engine/__tests__/metrics.test.ts`).
 *
 * Strumienie Stravy (`key_by_type=true`): { time: {data}, heartrate, watts, cadence, velocity_smooth, distance, altitude, moving }.
 * Próbkujemy je do równej siatki `dt` sekund (średnia w kubełku), bo dalsze obliczenia (NP, MMP, dopasowanie kroków)
 * zakładają stały krok czasu.
 */

export type RawStreams = Record<string, { data: (number | boolean | null)[] }>

export interface Samples {
  /** krok czasu w sekundach */
  dt: number
  /** liczba próbek; czas próbki i = i * dt (od startu aktywności, czas zegarowy z postojami) */
  n: number
  hr: (number | null)[] | null
  watts: (number | null)[] | null
  cadence: (number | null)[] | null
  /** m/s */
  speed: (number | null)[] | null
  /** m, narastająco */
  distance: (number | null)[] | null
  altitude: (number | null)[] | null
  /** 1 = w ruchu (większość kubełka) */
  moving: (0 | 1)[] | null
}

const NUMERIC_KEYS: { key: keyof Samples; src: string; decimals: number }[] = [
  { key: 'hr', src: 'heartrate', decimals: 0 },
  { key: 'watts', src: 'watts', decimals: 0 },
  { key: 'cadence', src: 'cadence', decimals: 0 },
  { key: 'speed', src: 'velocity_smooth', decimals: 2 },
  { key: 'distance', src: 'distance', decimals: 0 },
  { key: 'altitude', src: 'altitude', decimals: 1 },
]

function round(v: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

/** Równa siatka `dt` s: średnia wartości w kubełku, null gdy brak próbek; `distance` bierze ostatnią wartość (narastająca). */
export function resample(raw: RawStreams | null, dt = 5): Samples | null {
  const time = raw?.time?.data as number[] | undefined
  if (!time || time.length < 2) return null
  const last = time[time.length - 1]!
  const n = Math.floor(last / dt) + 1
  const out: Samples = { dt, n, hr: null, watts: null, cadence: null, speed: null, distance: null, altitude: null, moving: null }
  for (const { key, src, decimals } of NUMERIC_KEYS) {
    const data = raw?.[src]?.data as (number | null)[] | undefined
    if (!data || data.length !== time.length) continue
    const sum = new Float64Array(n)
    const cnt = new Int32Array(n)
    const lastVal = new Array<number | null>(n).fill(null)
    for (let i = 0; i < time.length; i++) {
      const v = data[i]
      if (v == null || !Number.isFinite(v)) continue
      const b = Math.min(n - 1, Math.floor(time[i]! / dt))
      sum[b] = (sum[b] ?? 0) + v
      cnt[b] = (cnt[b] ?? 0) + 1
      lastVal[b] = v
    }
    const arr: (number | null)[] = new Array(n).fill(null)
    let any = false
    for (let b = 0; b < n; b++) {
      if (cnt[b]! > 0) {
        arr[b] = round(key === 'distance' ? (lastVal[b] as number) : sum[b]! / cnt[b]!, decimals)
        any = true
      }
    }
    if (any) (out as unknown as Record<string, unknown>)[key] = arr
  }
  const moving = raw?.moving?.data as (boolean | null)[] | undefined
  if (moving && moving.length === time.length) {
    const yes = new Int32Array(n)
    const cnt = new Int32Array(n)
    for (let i = 0; i < time.length; i++) {
      const b = Math.min(n - 1, Math.floor(time[i]! / dt))
      cnt[b] = (cnt[b] ?? 0) + 1
      if (moving[i]) yes[b] = (yes[b] ?? 0) + 1
    }
    out.moving = Array.from({ length: n }, (_, b) => (cnt[b]! > 0 && yes[b]! * 2 >= cnt[b]! ? 1 : 0))
  }
  return out
}

/** Średnia z okna przesuwnego; null traktowane jako 0 (brak pedałowania). */
function rollingMean(values: (number | null)[], window: number): number[] {
  const out = new Array<number>(values.length)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0
    if (i >= window) sum -= values[i - window] ?? 0
    out[i] = sum / Math.min(window, i + 1)
  }
  return out
}

/** Normalized Power (Coggan): średnia krocząca 30 s → 4. potęga → średnia → pierwiastek 4. stopnia. Wymaga ≥ 5 min danych. */
export function normalizedPower(watts: (number | null)[] | null, dt: number): number | null {
  if (!watts || watts.length * dt < 300) return null
  const window = Math.max(1, Math.round(30 / dt))
  const rolled = rollingMean(watts, window)
  let acc = 0
  let n = 0
  for (let i = window - 1; i < rolled.length; i++) {
    acc += rolled[i]! ** 4
    n++
  }
  return n ? Math.round(Math.pow(acc / n, 0.25)) : null
}

/** Najlepsza średnia z okna o zadanej długości (s) dla każdej z podanych długości; null gdy jazda krótsza. */
export function bestAverages(values: (number | null)[] | null, dt: number, durations: number[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const d of durations) out[String(d)] = null
  if (!values) return out
  const prefix = new Float64Array(values.length + 1)
  for (let i = 0; i < values.length; i++) prefix[i + 1] = prefix[i]! + (values[i] ?? 0)
  for (const d of durations) {
    const w = Math.round(d / dt)
    if (w < 1 || w > values.length) continue
    let best = -Infinity
    for (let i = 0; i + w <= values.length; i++) best = Math.max(best, (prefix[i + w]! - prefix[i]!) / w)
    out[String(d)] = Math.round(best)
  }
  return out
}

/** Najlepsza średnia prędkość (km/h) z okna czasu zegarowego – z dystansu narastającego, więc postoje obniżają wynik. */
export function bestSpeeds(distance: (number | null)[] | null, dt: number, durations: number[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const d of durations) out[String(d)] = null
  if (!distance) return out
  // uzupełnij luki ostatnią znaną wartością
  const filled = new Float64Array(distance.length)
  let lastKnown = 0
  for (let i = 0; i < distance.length; i++) {
    if (distance[i] != null) lastKnown = distance[i] as number
    filled[i] = lastKnown
  }
  for (const d of durations) {
    const w = Math.round(d / dt)
    if (w < 1 || w >= filled.length) continue
    let best = 0
    for (let i = 0; i + w < filled.length; i++) best = Math.max(best, filled[i + w]! - filled[i]!)
    out[String(d)] = round((best / (w * dt)) * 3.6, 1)
  }
  return out
}

/**
 * Rozprzężenie moc:tętno (Pw:HR, Friel): stosunek P/HR w pierwszej i drugiej połowie jazdy (tylko próbki w ruchu,
 * z pominięciem pierwszych 10 min rozgrzewki, gdy jazda ≥ 60 min). Wynik w %; > 5 % = baza tlenowa do poprawy.
 * Wymaga mocy i tętna przez ≥ 40 min.
 */
export function decoupling(s: Samples): number | null {
  if (!s.watts || !s.hr) return null
  const skip = s.n * s.dt >= 3600 ? Math.round(600 / s.dt) : 0
  const idx: number[] = []
  for (let i = skip; i < s.n; i++) {
    if (s.moving && !s.moving[i]) continue
    const w = s.watts[i]
    const h = s.hr[i]
    if (w == null || h == null || h < 60 || w <= 0) continue
    idx.push(i)
  }
  if (idx.length * s.dt < 2400) return null
  const half = Math.floor(idx.length / 2)
  const ratio = (part: number[]) => {
    let p = 0
    let h = 0
    for (const i of part) {
      p += s.watts![i] as number
      h += s.hr![i] as number
    }
    return p / h
  }
  const r1 = ratio(idx.slice(0, half))
  const r2 = ratio(idx.slice(half))
  return round(((r1 - r2) / r1) * 100, 1)
}

export const MMP_DURATIONS = [5, 60, 300, 1200, 3600]
export const SPEED_DURATIONS = [300, 1200, 3600]

export interface RideMetrics {
  np_w: number | null
  mmp_w: Record<string, number | null> | null
  best_speed_kmh: Record<string, number | null> | null
  decoupling_pct: number | null
  avg_cadence_moving: number | null
}

/** Komplet metryk zapisywanych przy imporcie (moc tylko z miernika – `deviceWatts`). */
export function rideMetrics(s: Samples | null, deviceWatts: boolean): RideMetrics {
  if (!s) return { np_w: null, mmp_w: null, best_speed_kmh: null, decoupling_pct: null, avg_cadence_moving: null }
  const watts = deviceWatts ? s.watts : null
  let cadSum = 0
  let cadN = 0
  if (s.cadence) {
    for (let i = 0; i < s.n; i++) {
      const c = s.cadence[i]
      if (c == null || c <= 0 || (s.moving && !s.moving[i])) continue
      cadSum += c
      cadN++
    }
  }
  return {
    np_w: normalizedPower(watts, s.dt),
    mmp_w: watts ? bestAverages(watts, s.dt, MMP_DURATIONS) : null,
    best_speed_kmh: s.distance ? bestSpeeds(s.distance, s.dt, SPEED_DURATIONS) : null,
    decoupling_pct: deviceWatts ? decoupling(s) : null,
    avg_cadence_moving: cadN ? Math.round(cadSum / cadN) : null,
  }
}
