/**
 * Wykonane treningi z Wahoo (`GET /v1/workouts` z `workout_summary`) → wiersze `wahoo_workouts`.
 * Czysty TS (bez Deno), testowany Vitestem: `src/engine/__tests__/wahoo_summary.test.ts`.
 * Jednostki Wahoo: sekundy, metry, m/s. Datę dnia liczymy w Europe/Warsaw.
 */

export interface WahooSummary {
  id?: number
  /** plik FIT z jazdy (docs/33 § 7) */
  file?: { url?: string | null } | null
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
  moving_time_s: number
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

/**
 * Start i data jazdy z pliku FIT (pierwsza próbka). Jazda z MyWhoosh, która trafiła do Wahoo przez nasz plan na dany
 * dzień, ma w podsumowaniu `starts` planu (10.10.2026: 21:00 zamiast 20:08) – plik mówi, kiedy naprawdę jechano.
 * Pusto, gdy plik nie ma czasu.
 */
export function fitStart(d: { start: string | null }): { starts?: string; date?: string } {
  if (!d.start) return {}
  return { starts: d.start, date: warsawDate(d.start) }
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
    moving_time_s: Math.round(active),
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

/** Hosty, z których wolno pobrać plik FIT (Wahoo i jego magazyn plików) – adres przychodzi z API albo z webhooka. */
export const FIT_HOSTS = [/(^|\.)wahooligan\.com$/, /(^|\.)wahoofitness\.com$/, /\.amazonaws\.com$/, /\.cloudfront\.net$/]

/** Czy adres jest bezpiecznym źródłem pliku FIT: https, host z listy, bez adresu IP i bez danych logowania w adresie. */
export function isFitHost(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false
  const host = u.hostname.toLowerCase()
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false
  return FIT_HOSTS.some((re) => re.test(host))
}

/** Adres pliku FIT z podsumowania (pole `file.url`), gdy Wahoo go podał i host jest dozwolony. */
export function fitUrl(s: WahooSummary | null | undefined): string | null {
  const u = s?.file?.url
  return typeof u === 'string' && isFitHost(u) ? u : null
}

/**
 * Błąd pobrania pliku FIT, który mija sam (przekroczony czas, sieć, 429/5xx) – plik wraca przy następnym odpytaniu.
 * Uszkodzony plik albo 403/404 to błąd trwały (`fit_error`).
 */
export function isTransientFitError(e: unknown): boolean {
  const name = e instanceof Error ? e.name : ''
  const msg = e instanceof Error ? e.message : String(e)
  return name === 'AbortError' || name === 'TimeoutError' || /^fit (sieć|429|5\d\d)(\D|$)|signal has been aborted/i.test(msg)
}
