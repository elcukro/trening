/**
 * Jazda z wgranego pliku FIT (docs/33 § 7a). MyWhoosh (i inne aplikacje bez Wahoo) wysyła jazdę prosto na Stravę,
 * a stamtąd nie wolno jej brać do AI (polityka API § 5.3). Zawodnik pobiera plik (mywhoosh.com → Profil → Aktywności)
 * i wgrywa go w aplikacji; wiersz `fit_rides` (źródło `fit`) liczy ten sam kod co plik z Wahoo.
 * Czysty TS – Vitest: `src/engine/__tests__/fit_ride.test.ts`.
 */
import { fitToStreams, type FitDecoded } from './fit.ts'
import { hrHistogram, movingTotals, resample, rideMetrics, type Samples } from './metrics.ts'
import { warsawDate } from './wahoo_summary.ts'

/** Największy plik do wgrania (godzina jazdy z MyWhoosh to ok. 200–400 kB). */
export const FIT_UPLOAD_MAX_BYTES = 8 * 1024 * 1024

/** Krótsza „jazda” to zwykle plik testowy albo pomyłka – nie zapisujemy. */
export const FIT_MIN_MOVING_S = 5 * 60

/** Wiersz `fit_rides` bez kluczy (kolumny jak w `strava_activities`, żeby `RideRow` był wspólny). */
export interface FitRideRow {
  date: string
  start_at: string
  name: string
  moving_time_s: number
  elapsed_time_s: number
  distance_m: number
  elevation_m: number
  avg_hr: number | null
  max_hr: number | null
  avg_cadence: number | null
  avg_watts: number | null
  np_w: number | null
  device_watts: boolean
  decoupling_pct: number | null
  mmp_w: Record<string, number | null> | null
  best_speed_kmh: Record<string, number | null> | null
  hr_histogram: number[] | null
  has_streams: true
}

/** Nazwa jazdy: podana przez zawodnika, inaczej z nazwy pliku („MyWhoosh”), inaczej „Jazda z pliku”. */
export function fitRideName(name: string | null | undefined, fileName: string | null | undefined): string {
  const own = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (own) return own
  if (/mywhoosh/i.test(fileName ?? '')) return 'MyWhoosh'
  return 'Jazda z pliku'
}

/** Przewyższenie z wysokości co 5 s: suma podjazdów z histerezą 2 m (szum barometru/wirtualnej trasy nie nabija metrów). */
export function ascentM(altitude: (number | null)[] | null): number {
  if (!altitude) return 0
  let base: number | null = null
  let total = 0
  for (const a of altitude) {
    if (a == null) continue
    if (base == null || a < base) base = a
    else if (a - base >= 2) {
      total += a - base
      base = a
    }
  }
  return Math.round(total)
}

/** Plik → wiersz i próbki co 5 s (do `fit_streams`). Null, gdy plik nie ma jazdy (za mało próbek albo ruchu). */
export function fitRide(d: FitDecoded, opts: { name?: string | null; fileName?: string | null } = {}): { row: FitRideRow; samples: Samples } | null {
  const streams = fitToStreams(d)
  const samples = resample(streams, 5)
  if (!streams || !samples || !d.start) return null
  const deviceWatts = !!samples.watts?.some((w) => (w ?? 0) > 0)
  const totals = movingTotals(samples, deviceWatts)
  if (!totals.moving_time_s || totals.moving_time_s < FIT_MIN_MOVING_S) return null
  const { avg_cadence_moving, ...metrics } = rideMetrics(samples, deviceWatts)
  const rec = d.records
  const maxHr = rec.reduce<number | null>((m, r) => (r.hr != null && r.hr > 0 && r.hr < 250 && (m == null || r.hr > m) ? r.hr : m), null)
  let hrSum = 0
  let hrN = 0
  for (let i = 0; i < samples.n; i++) {
    const h = samples.hr?.[i]
    if (h == null || h <= 0 || (samples.moving && !samples.moving[i])) continue
    hrSum += h
    hrN++
  }
  const dist = rec.reduce((m, r) => (r.distance != null && r.distance > m ? r.distance : m), 0)
  return {
    row: {
      date: warsawDate(d.start),
      start_at: d.start,
      name: fitRideName(opts.name, opts.fileName),
      moving_time_s: totals.moving_time_s,
      elapsed_time_s: Math.round(rec[rec.length - 1]!.t - rec[0]!.t),
      distance_m: Math.round(dist),
      elevation_m: ascentM(samples.altitude),
      avg_hr: hrN ? Math.round(hrSum / hrN) : null,
      max_hr: maxHr,
      avg_cadence: avg_cadence_moving,
      avg_watts: totals.avg_watts,
      ...metrics,
      device_watts: deviceWatts,
      hr_histogram: hrHistogram(streams),
      has_streams: true,
    },
    samples,
  }
}

/** Skrót pliku (hex) – ten sam plik wgrany drugi raz nie tworzy drugiej jazdy. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('')
}
