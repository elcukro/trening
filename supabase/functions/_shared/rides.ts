/**
 * Jedna jazda niezależnie od źródła (docs/33 § 4): wiersz `strava_activities`, `wahoo_workouts` albo `fit_rides`
 * (plik FIT wgrany w aplikacji, np. z MyWhoosh – § 7a) → `RideRow` z polem `source`. Czysty TS – ten sam kod w Edge Functions i w aplikacji (Vitest: `src/engine/__tests__/rides.test.ts`).
 *
 * Ta sama jazda bywa w kilku tabelach (Bolt wysyła ją do Wahoo, a Wahoo do Stravy; MyWhoosh wysyła na Stravę, a zawodnik
 * wgrywa ten sam plik). `mergeRides` zostawia kopię z Wahoo, potem z pliku – to nasze dane, bez limitu 7 dni i dozwolone
 * dla AI – a jazdę ze Stravy tylko wtedy, gdy żadna z nich jej nie ma.
 */
import type { DataSource } from './provenance.ts'
import { FOREIGN_APPS } from './wahoo_summary.ts'

export type RideSource = Extract<DataSource, 'wahoo' | 'strava' | 'fit'>

export interface RideRow {
  source: RideSource
  /** identyfikator w tabeli źródła (Strava: id aktywności, Wahoo: id treningu, plik: id w `fit_rides`) */
  id: number
  /** klucz unikalny między źródłami: `wahoo:123`, `strava:456`, `fit:7` */
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
  /**
   * Jazda z innej aplikacji, z której Wahoo oddaje tylko nazwę, start i czas (MyWhoosh, 27.10.2026). Ustępuje
   * pasującemu plikowi FIT; w widokach – przycisk „Wgraj plik FIT”.
   */
  time_only: boolean
  /** aplikacja źródłowa jazdy „tylko czas” (np. „MyWhoosh”), inaczej null */
  app: string | null
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const obj = <T>(v: unknown): T | null => (v && typeof v === 'object' ? (v as T) : null)

export const rideKey = (source: RideSource, id: number | string): string => `${source}:${id}`

/** Wiersz `strava_activities` (serwer albo Dexie) → `RideRow`. */
export const fromStrava = (a: Record<string, unknown>): RideRow => fromStravaLike('strava', a)

/** Wiersz `fit_rides` → `RideRow` (te same kolumny co `strava_activities`). */
export const fromFit = (a: Record<string, unknown>): RideRow => fromStravaLike('fit', a)

function fromStravaLike(source: 'strava' | 'fit', a: Record<string, unknown>): RideRow {
  return {
    source,
    id: Number(a.id),
    key: rideKey(source, a.id as number),
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
    time_only: false,
    app: null,
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
    time_only: num(w.foreign_app_id) != null && !w.has_streams,
    app: num(w.foreign_app_id) != null ? (FOREIGN_APPS[Number(w.foreign_app_id)] ?? null) : null,
  }
}

/**
 * Ta sama jazda w dwóch źródłach: start w odległości ≤ 10 min i czas jazdy różny o ≤ 25 %. Bez godziny – ta sama data
 * i czas. Do tego ten sam dzień, prawie ten sam czas jazdy (±2 %, ≥ 10 min) i start ≤ 3 h od siebie: jazda z MyWhoosh
 * przypięta w Wahoo do naszego planu ma godzinę planu (10.10.2026: 21:00 w Wahoo, 20:08 na Stravie, obie 96 min).
 * Nowe pliki z Wahoo mają już start z pliku FIT (`fitStart`); ten warunek łata wiersze zapisane wcześniej.
 */
export function sameRide(a: Pick<RideRow, 'date' | 'start_at' | 'moving_time_s'>, b: Pick<RideRow, 'date' | 'start_at' | 'moving_time_s'>): boolean {
  const diff = Math.abs(a.moving_time_s - b.moving_time_s)
  const longer = Math.max(a.moving_time_s, b.moving_time_s, 1)
  const dur = diff <= 0.25 * longer
  const near = (h: number) => !a.start_at || !b.start_at || Math.abs(Date.parse(a.start_at) - Date.parse(b.start_at)) <= h * 3_600_000
  if (a.date === b.date && longer >= 10 * 60 && diff <= 0.02 * longer && near(3)) return true
  if (a.start_at && b.start_at) return dur && Math.abs(Date.parse(a.start_at) - Date.parse(b.start_at)) <= 10 * 60_000
  return dur && a.date === b.date
}

/**
 * Kopia z Wahoo wygrywa, potem z wgranego pliku; jazda ze Stravy zostaje tylko bez bliźniaka w żadnej z nich.
 * Wynik po dacie i godzinie startu.
 */
export function mergeRides(wahoo: readonly RideRow[], strava: readonly RideRow[], fit: readonly RideRow[] = []): RideRow[] {
  // jazda „tylko czas” z Wahoo ustępuje pasującemu plikowi FIT (kolejność wgrania bez znaczenia)
  const kept = wahoo.filter((w) => !(w.time_only && fit.some((f) => sameRide(w, f))))
  const out: RideRow[] = [...kept]
  for (const f of fit) if (!kept.some((w) => sameRide(w, f))) out.push(f)
  const ours = [...out]
  for (const s of strava) if (!ours.some((o) => sameRide(o, s))) out.push(s)
  return out.sort((x, y) => (x.date === y.date ? (x.start_at ?? '').localeCompare(y.start_at ?? '') : x.date.localeCompare(y.date)))
}

/** Bliźniak jazdy w innym źródle (do pominięcia drugiego maila o tej samej jeździe). */
export function twinOf(ride: RideRow, others: readonly RideRow[]): RideRow | null {
  return others.find((o) => o.source !== ride.source && sameRide(o, ride)) ?? null
}

/** Wiersz tabeli źródła → `RideRow`. */
export function rideFromRow(source: RideSource, row: Record<string, unknown>): RideRow {
  return source === 'wahoo' ? fromWahoo(row) : source === 'fit' ? fromFit(row) : fromStrava(row)
}
