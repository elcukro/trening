/**
 * Wykonane treningi z Wahoo (`GET /v1/workouts` z `workout_summary`) → wiersze `wahoo_workouts`.
 * Czysty TS (bez Deno), testowany Vitestem: `src/engine/__tests__/wahoo_summary.test.ts`.
 * Jednostki Wahoo: sekundy, metry, m/s. Datę dnia liczymy w Europe/Warsaw.
 */

export interface WahooSummary {
  id?: number
  duration_active_accum?: number | string | null
  duration_total_accum?: number | string | null
  distance_accum?: number | string | null
  ascent_accum?: number | string | null
  heart_rate_avg?: number | string | null
  power_avg?: number | string | null
  power_bike_np_last?: number | string | null
  cadence_avg?: number | string | null
  speed_avg?: number | string | null
  calories_accum?: number | string | null
  [k: string]: unknown
}

export interface WahooWorkoutRaw {
  id: number
  name?: string | null
  starts?: string | null
  minutes?: number | null
  workout_token?: string | null
  workout_summary?: WahooSummary | null
  [k: string]: unknown
}

export interface WahooWorkoutRow {
  id: number
  date: string
  starts: string
  name: string | null
  minutes_active: number
  distance_km: number | null
  avg_hr: number | null
  avg_power: number | null
  np_w: number | null
  avg_cadence: number | null
  avg_speed_kmh: number | null
  ascent_m: number | null
  summary: WahooSummary
}

function n(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : null
}

/** Data lokalna (YYYY-MM-DD) chwili ISO w strefie Europe/Warsaw. */
export function warsawDate(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date(iso))
}

/** Wiersz do zapisu albo null, gdy trening nie ma podsumowania (niewykonany) lub sensownego czasu. */
export function summaryToRow(w: WahooWorkoutRaw): WahooWorkoutRow | null {
  const s = w.workout_summary
  if (!s || !w.starts) return null
  const active = n(s.duration_active_accum) ?? n(s.duration_total_accum)
  if (!active || active < 300) return null
  const dist = n(s.distance_accum)
  const speed = n(s.speed_avg)
  const r = (v: number | null) => (v == null ? null : Math.round(v))
  return {
    id: w.id,
    date: warsawDate(w.starts),
    starts: w.starts,
    name: w.name ?? null,
    minutes_active: Math.round(active / 60),
    distance_km: dist == null ? null : Math.round(dist / 100) / 10,
    avg_hr: r(n(s.heart_rate_avg)),
    avg_power: r(n(s.power_avg)),
    np_w: r(n(s.power_bike_np_last)),
    avg_cadence: r(n(s.cadence_avg)),
    avg_speed_kmh: speed == null ? (dist != null ? Math.round((dist / active) * 36) / 10 : null) : Math.round(speed * 36) / 10,
    ascent_m: r(n(s.ascent_accum)),
    summary: s,
  }
}

/** Treningi z okna [from, to] (daty lokalne) z podsumowaniem – do zapisu. */
export function completedInRange(list: WahooWorkoutRaw[], from: string, to: string): WahooWorkoutRow[] {
  const out: WahooWorkoutRow[] = []
  for (const w of list) {
    const row = summaryToRow(w)
    if (row && row.date >= from && row.date <= to) out.push(row)
  }
  return out
}
