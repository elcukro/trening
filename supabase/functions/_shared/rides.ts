/**
 * Jedna jazda niezależnie od źródła (docs/33 § 4): wiersz `strava_activities` albo `wahoo_workouts` → `RideRow`
 * z polem `source`. Czysty TS – ten sam kod w Edge Functions i w aplikacji (Vitest: `src/engine/__tests__/rides.test.ts`).
 *
 * Ta sama jazda bywa w obu tabelach (Bolt wysyła ją do Wahoo, a Wahoo do Stravy). `mergeRides` zostawia kopię z Wahoo –
 * to nasze dane, bez limitu 7 dni i dozwolone dla AI – a jazdę ze Stravy tylko wtedy, gdy Wahoo jej nie ma.
 */
import type { DataSource } from './provenance.ts'

export type RideSource = Extract<DataSource, 'wahoo' | 'strava'>

export interface RideRow {
  source: RideSource
  /** identyfikator w tabeli źródła (Strava: id aktywności, Wahoo: id treningu) */
  id: number
  /** klucz unikalny między źródłami: `wahoo:123`, `strava:456` */
  key: string
  date: string
  start_at: string | null
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
  device_watts: boolean | null
  decoupling_pct: number | null
  mmp_w: Record<string, number | null> | null
  best_speed_kmh: Record<string, number | null> | null
  hr_histogram: number[] | null
  has_streams: boolean
  note: string | null
  note_source: 'ai' | 'rules' | null
  note_facts: unknown
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const obj = <T>(v: unknown): T | null => (v && typeof v === 'object' ? (v as T) : null)

export const rideKey = (source: RideSource, id: number | string): string => `${source}:${id}`

/** Wiersz `strava_activities` (serwer albo Dexie) → `RideRow`. */
export function fromStrava(a: Record<string, unknown>): RideRow {
  return {
    source: 'strava',
    id: Number(a.id),
    key: rideKey('strava', a.id as number),
    date: a.date as string,
    start_at: (a.start_at as string | null) ?? null,
    name: (a.name as string | null) ?? 'Jazda',
    moving_time_s: Number(a.moving_time_s ?? 0),
    elapsed_time_s: Number(a.elapsed_time_s ?? a.moving_time_s ?? 0),
    distance_m: Number(a.distance_m ?? 0),
    elevation_m: Number(a.elevation_m ?? 0),
    avg_hr: num(a.avg_hr),
    max_hr: num(a.max_hr),
    avg_cadence: num(a.avg_cadence),
    avg_watts: num(a.avg_watts),
    np_w: num(a.np_w),
    device_watts: (a.device_watts as boolean | null) ?? null,
    decoupling_pct: num(a.decoupling_pct),
    mmp_w: obj(a.mmp_w),
    best_speed_kmh: obj(a.best_speed_kmh),
    hr_histogram: obj(a.hr_histogram),
    has_streams: !!a.has_streams,
    note: (a.note as string | null) ?? null,
    note_source: (a.note_source as RideRow['note_source']) ?? null,
    note_facts: a.note_facts ?? null,
  }
}

/** Wiersz `wahoo_workouts` → `RideRow`. Metryki z pliku FIT (gdy jest), inaczej z podsumowania Wahoo. */
export function fromWahoo(w: Record<string, unknown>): RideRow {
  const moving = num(w.moving_time_s) ?? Number(w.minutes_active ?? 0) * 60
  const s = obj<Record<string, unknown>>(w.summary)
  const total = num(s?.duration_total_accum)
  return {
    source: 'wahoo',
    id: Number(w.id),
    key: rideKey('wahoo', w.id as number),
    date: w.date as string,
    start_at: (w.starts as string | null) ?? null,
    name: (w.name as string | null) || 'Jazda',
    moving_time_s: moving,
    elapsed_time_s: total != null ? Math.round(total) : moving,
    distance_m: Math.round(Number(w.distance_km ?? 0) * 1000),
    elevation_m: Number(w.ascent_m ?? 0),
    avg_hr: num(w.avg_hr),
    max_hr: num(w.max_hr),
    avg_cadence: num(w.avg_cadence),
    // moc z podsumowania Wahoo jest tylko, gdy był miernik; bez niego Wahoo podaje null albo 0
    avg_watts: num(w.avg_power) || null,
    np_w: num(w.np_w) || null,
    device_watts: (w.device_watts as boolean | null) ?? (num(w.avg_power) ? true : null),
    decoupling_pct: num(w.decoupling_pct),
    mmp_w: obj(w.mmp_w),
    best_speed_kmh: obj(w.best_speed_kmh),
    hr_histogram: obj(w.hr_histogram),
    has_streams: !!w.has_streams,
    note: (w.note as string | null) ?? null,
    note_source: (w.note_source as RideRow['note_source']) ?? null,
    note_facts: w.note_facts ?? null,
  }
}

/** Ta sama jazda w dwóch źródłach: start w odległości ≤ 10 min i czas jazdy różny o ≤ 25 %. Bez godziny – ta sama data i czas. */
export function sameRide(a: Pick<RideRow, 'date' | 'start_at' | 'moving_time_s'>, b: Pick<RideRow, 'date' | 'start_at' | 'moving_time_s'>): boolean {
  const dur = Math.abs(a.moving_time_s - b.moving_time_s) <= 0.25 * Math.max(a.moving_time_s, b.moving_time_s, 1)
  if (a.start_at && b.start_at) return dur && Math.abs(Date.parse(a.start_at) - Date.parse(b.start_at)) <= 10 * 60_000
  return dur && a.date === b.date
}

/** Kopia z Wahoo wygrywa; jazda ze Stravy zostaje tylko bez bliźniaka z Wahoo. Wynik po dacie i godzinie startu. */
export function mergeRides(wahoo: readonly RideRow[], strava: readonly RideRow[]): RideRow[] {
  const out: RideRow[] = [...wahoo]
  for (const s of strava) if (!wahoo.some((w) => sameRide(w, s))) out.push(s)
  return out.sort((x, y) => (x.date === y.date ? (x.start_at ?? '').localeCompare(y.start_at ?? '') : x.date.localeCompare(y.date)))
}

/** Bliźniak jazdy w drugim źródle (do pominięcia drugiego maila o tej samej jeździe). */
export function twinOf(ride: RideRow, others: readonly RideRow[]): RideRow | null {
  return others.find((o) => o.source !== ride.source && sameRide(o, ride)) ?? null
}
