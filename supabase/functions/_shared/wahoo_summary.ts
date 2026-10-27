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

/** Wpis z tokenem naszego planu (`YYYY-MM-DD:…`) – niewykonany plan albo jazda z innej aplikacji przypięta do planu. */
export function isOurPlan(w: WahooWorkoutRaw): boolean {
  return typeof w.workout_token === 'string' && /^\d{4}-\d{2}-\d{2}:/.test(w.workout_token)
}

/**
 * Czy dociągnąć podsumowanie osobnym zapytaniem (`GET /v1/workouts/{id}/workout_summary`). Lista Wahoo nie dołącza
 * podsumowania do jazd z innych aplikacji (27.10.2026: wszystkie jazdy Ferdynanda z MyWhoosh, typ 12, z prawdziwą
 * godziną startu). Pomijamy nasze plany, przyszłość i wpisy o północy UTC – to plany innych aplikacji na dzień
 * („The Model”, „Fight Club” z SYSTM), nie jazdy.
 */
export function needsSummaryFetch(w: WahooWorkoutRaw, from: string, to: string, now = Date.now()): boolean {
  if (w.workout_summary || !w.starts || isOurPlan(w)) return false
  const t = Date.parse(w.starts)
  if (!Number.isFinite(t) || t > now) return false
  if (/T00:00:00(\.0+)?Z$/.test(w.starts)) return false
  const d = warsawDate(w.starts)
  return d >= from && d <= to
}

/** Dlaczego trening z listy Wahoo nie trafia do `wahoo_workouts` (null = trafia). Te same warunki co `summaryToRow`. */
export function dropReason(w: WahooWorkoutRaw): string | null {
  const s = w.workout_summary
  if (!s) return 'brak workout_summary'
  if (!w.starts) return 'brak starts'
  const active = n(s.duration_active_accum) ?? n(s.duration_total_accum)
  if (!active) return 'brak czasu w podsumowaniu'
  if (active < 300) return `za krótko (${Math.round(active)} s)`
  return null
}

export interface DroppedWorkout {
  id: number
  starts: string | null
  name: string | null
  workout_type_id: unknown
  reason: string
  our_plan: boolean
  summary_keys: string[] | null
  duration_active_accum: unknown
  duration_total_accum: unknown
  /** klucze wpisu z listy – czy podsumowanie nie leży gdzie indziej (np. w innym polu niż `workout_summary`) */
  keys: string[]
}

/**
 * Diagnostyka (27.10.2026: jazdy z MyWhoosh są w chmurze Wahoo, a nie w `wahoo_workouts`): odrzucone wpisy z listy
 * z powodem i kształtem podsumowania, z okna dat jak zapis. Bez adresów i tokenów – tylko nazwy kluczy, czasy
 * i identyfikatory. `our_plan`: wpis z tokenem naszego planu (`YYYY-MM-DD:…`) – niewykonany plan albo jazda z innej
 * aplikacji przypięta do planu (10.10.2026).
 */
export function droppedWorkouts(list: WahooWorkoutRaw[], from: string, to: string, limit = 25): DroppedWorkout[] {
  const out: DroppedWorkout[] = []
  for (const w of list) {
    if (w.starts) {
      const d = warsawDate(w.starts)
      if (d < from || d > to) continue
    }
    const reason = dropReason(w)
    if (!reason) continue
    const s = w.workout_summary
    out.push({
      id: w.id,
      starts: w.starts ?? null,
      name: w.name ?? null,
      workout_type_id: w.workout_type_id ?? null,
      reason,
      our_plan: isOurPlan(w),
      summary_keys: s && typeof s === 'object' ? Object.keys(s).sort() : null,
      duration_active_accum: s?.duration_active_accum ?? null,
      duration_total_accum: s?.duration_total_accum ?? null,
      keys: Object.keys(w).sort(),
    })
    if (out.length >= limit) break
  }
  return out
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
