/**
 * Paczka faktów o jeździe dla notatki po treningu (docs/20). Czysty TS bez Deno – ten sam kod w Edge Function
 * i w testach Vitest. Zasada: liczby liczy kod, model językowy tylko je interpretuje i opowiada – nie dostaje
 * surowych próbek (koszt) i nie ma skąd wziąć liczby, której tu nie ma (weryfikacja w `numbersOk`).
 */
import type { DaySnapshot, PlanContext, ZoneBpmLite } from './email_views.ts'

/** Próbki co `dt` s w formacie `strava_streams.samples`. */
export interface StoredSamples {
  dt: number
  watts?: (number | null)[] | null
  hr?: (number | null)[] | null
  cadence?: (number | null)[] | null
  speed?: (number | null)[] | null
  altitude?: (number | null)[] | null
  moving?: (0 | 1)[] | null
}

export interface RideRowLite {
  id: number | string
  date: string
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
}

export interface History {
  /** najlepsze średnie mocy z ostatnich 90 dni bez tej jazdy: {"60": 300, "300": 260, "1200": 240} */
  mmp90: Record<string, number | null>
  /** ostatnie wykonanie tego samego treningu (ten sam workout_id) */
  previous_same: { date: string; np_w: number | null; avg_hr: number | null; work_avg_w: number | null; work_avg_hr: number | null } | null
  week: { done_min: number; planned_min: number; rides: number } | null
  /** poranny check-in i RPE z dziennika, jeśli są */
  /** oceny 1–5 (5 = najlepiej) – nie godziny snu */
  checkin: { sleep_1to5: number | null; legs_1to5: number | null; motivation_1to5: number | null; resting_hr: number | null } | null
  rpe: number | null
}

export interface Effort {
  start_min: number
  minutes: number
  avg_w: number
  avg_hr: number | null
  /** średnia moc względem środka celu (%), null bez celu */
  vs_target_pct: number | null
  in_target: boolean | null
}

export interface RideFacts {
  ride: {
    name: string
    date: string
    minutes: number
    stopped_min: number
    km: number
    elevation_m: number
    avg_w: number | null
    np_w: number | null
    if: number | null
    tss: number | null
    variability: number | null
    avg_hr: number | null
    max_hr: number | null
    cadence: number | null
    decoupling_pct: number | null
  }
  plan: {
    name: string
    minutes: number
    day_type: string
    category: string
    purpose: string
    phase: string
    phase_goal: string
    week_type: string
    flags: string[]
    work: { name: string; zone: string; minutes: number; reps: number; watts: [number, number] | null; bpm: [number, number] | null }[]
  } | null
  athlete: { ftp: number | null; lthr: number | null; goal: string; coach_notes: string[] }
  /** czas w strefach tętna (% czasu w ruchu), tylko strefy ≥ 1 % */
  hr_zones_pct: Record<string, number>
  /** % czasu w ruchu powyżej górnej granicy Z2 mocy (0,75 FTP) – dla dni spokojnych */
  above_z2_pct: number | null
  halves: { first: { avg_w: number | null; avg_hr: number | null }; second: { avg_w: number | null; avg_hr: number | null } } | null
  /** wykryte odcinki robocze (interwały) i porównanie z planem */
  efforts: { planned_reps: number; target_w: [number, number] | null; detected: Effort[]; fade_pct: number | null } | null
  /** test FTP: najlepsze 20 min, szacunek FTP i tempo w blokach 5-minutowych */
  test: { best20_w: number; ftp_est: number; blocks_w: number[]; blocks_hr: (number | null)[] } | null
  records: { seconds: number; watts: number; previous_best: number | null }[]
  previous_same: History['previous_same']
  week: History['week']
  checkin: History['checkin']
  rpe: number | null
  /** gotowe porównania – model nie liczy sam, więc każda liczba w notatce jest w faktach */
  derived: Record<string, number>
}

const HARD_ZONES = new Set(['SS', 'Z4', 'THR', 'Z5a', 'Z5b', 'Z5c'])

function mean(a: (number | null | undefined)[]): number | null {
  let s = 0
  let n = 0
  for (const x of a) {
    if (x == null) continue
    s += x
    n++
  }
  return n ? s / n : null
}

const r0 = (x: number | null) => (x == null ? null : Math.round(x))
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10)
const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100)

function np(watts: (number | null)[], dt: number): number | null {
  const k = Math.max(1, Math.round(30 / dt))
  if (watts.length < k) return null
  let sum4 = 0
  let n = 0
  for (let i = k - 1; i < watts.length; i++) {
    const m = mean(watts.slice(i - k + 1, i + 1))
    if (m == null) continue
    sum4 += m ** 4
    n++
  }
  return n ? (sum4 / n) ** 0.25 : null
}

function bestAvg(watts: (number | null)[], dt: number, seconds: number): { avg: number; start: number } | null {
  const k = Math.round(seconds / dt)
  if (watts.length < k) return null
  let best: { avg: number; start: number } | null = null
  let sum = 0
  for (let i = 0; i < watts.length; i++) {
    sum += watts[i] ?? 0
    if (i >= k) sum -= watts[i - k] ?? 0
    if (i >= k - 1) {
      const avg = sum / k
      if (!best || avg > best.avg) best = { avg, start: i - k + 1 }
    }
  }
  return best
}

/** Czas w strefach tętna – jak `hrZoneSeconds`, ale z próbek (tylko w ruchu). */
function hrZoneShares(hr: (number | null)[], moving: (0 | 1)[] | null, zones: ZoneBpmLite[]): Record<string, number> {
  if (!zones.length) return {}
  const secs: Record<string, number> = {}
  let total = 0
  hr.forEach((b, i) => {
    if (b == null || (moving && !moving[i])) return
    let t = zones.findIndex((z, j) => b >= z.low_bpm && (b < z.high_bpm || j === zones.length - 1))
    if (t < 0) {
      t = 0
      zones.forEach((z, j) => {
        if (b >= z.high_bpm && z.high_bpm >= zones[t]!.high_bpm) t = j
      })
      if (b > zones.at(-1)!.high_bpm) t = zones.length - 1
    }
    secs[zones[t]!.id] = (secs[zones[t]!.id] ?? 0) + 1
    total++
  })
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(secs)) {
    const pct = Math.round((v / total) * 100)
    if (pct >= 1) out[k] = pct
  }
  return out
}

/**
 * Odcinki robocze: moc wygładzona 30 s powyżej progu przez co najmniej `minSec`, przerwy do 30 s scalane.
 * Próg to 90 % dolnej granicy celu (albo 88 % FTP bez celu) – wykrywa interwał nawet lekko poniżej zakresu.
 */
export function detectEfforts(watts: (number | null)[], hr: (number | null)[] | null, dt: number, threshold: number, minSec: number): { start: number; end: number }[] {
  const k = Math.max(1, Math.round(30 / dt))
  const smooth = watts.map((_, i) => mean(watts.slice(Math.max(0, i - k + 1), i + 1)) ?? 0)
  const runs: { start: number; end: number }[] = []
  let cur: { start: number; end: number } | null = null
  const gap = Math.round(30 / dt)
  smooth.forEach((w, i) => {
    if (w >= threshold) {
      if (cur && i - cur.end <= gap) cur.end = i
      else {
        if (cur) runs.push(cur)
        cur = { start: i, end: i }
      }
    }
  })
  if (cur) runs.push(cur)
  void hr
  // wygładzanie przesuwa początek o pół okna – korygujemy, żeby średnia liczyła się z samego wysiłku
  return runs
    .map((r) => ({ start: Math.max(0, r.start - Math.floor(k / 2)), end: r.end }))
    .filter((r) => (r.end - r.start + 1) * dt >= minSec)
}

export function rideFacts(ride: RideRowLite, samples: StoredSamples | null, snap: DaySnapshot | null, hist: History): RideFacts {
  const dt = samples?.dt ?? 5
  const W = samples?.watts && ride.device_watts ? samples.watts : null
  const H = samples?.hr ?? null
  const M = samples?.moving ?? null
  const ftp = snap?.ftp ?? null
  const ctx: PlanContext | null = snap?.context ?? null
  const npW = ride.np_w ?? (W ? r0(np(W, dt)) : null)
  const ifv = npW && ftp ? npW / ftp : null

  const facts: RideFacts = {
    ride: {
      name: ride.name,
      date: ride.date,
      minutes: Math.round(ride.moving_time_s / 60),
      stopped_min: Math.max(0, Math.round((ride.elapsed_time_s - ride.moving_time_s) / 60)),
      km: r1(ride.distance_m / 1000) ?? 0,
      elevation_m: Math.round(ride.elevation_m),
      avg_w: ride.device_watts ? ride.avg_watts : null,
      np_w: ride.device_watts ? npW : null,
      if: r2(ifv),
      tss: ifv ? Math.round((ride.moving_time_s / 3600) * ifv * ifv * 100) : null,
      variability: ride.device_watts && npW && ride.avg_watts ? r2(npW / ride.avg_watts) : null,
      avg_hr: ride.avg_hr,
      max_hr: ride.max_hr,
      cadence: ride.avg_cadence,
      decoupling_pct: ride.decoupling_pct,
    },
    plan: snap?.planned
      ? {
          name: snap.planned.name,
          minutes: snap.planned.minutes,
          day_type: snap.planned.day_type,
          category: ctx?.category ?? '',
          purpose: ctx?.description ?? '',
          phase: ctx?.phase ?? '',
          phase_goal: ctx?.phase_goal ?? '',
          week_type: ctx?.week_type ?? '',
          flags: ctx?.flags ?? [],
          work: ctx?.work ?? [],
        }
      : null,
    athlete: { ftp, lthr: snap?.lthr ?? null, goal: ctx?.goal ?? '', coach_notes: ctx?.coach_notes ?? [] },
    hr_zones_pct: H && snap?.zones?.length ? hrZoneShares(H, M, snap.zones) : {},
    above_z2_pct: null,
    halves: null,
    efforts: null,
    test: null,
    records: [],
    previous_same: hist.previous_same,
    week: hist.week,
    checkin: hist.checkin,
    rpe: hist.rpe,
    derived: {},
  }

  if (W && ftp) {
    const mov = W.filter((_, i) => !M || M[i])
    const above = mov.filter((w) => (w ?? 0) > 0.75 * ftp).length
    facts.above_z2_pct = mov.length ? Math.round((above / mov.length) * 100) : null
  }

  // pierwsza i druga połowa czasu w ruchu – czy moc albo tętno „uciekały”
  if (W || H) {
    const idx = [...Array(Math.max(W?.length ?? 0, H?.length ?? 0)).keys()].filter((i) => !M || M[i])
    const half = Math.floor(idx.length / 2)
    const part = (ids: number[]) => ({ avg_w: W ? r0(mean(ids.map((i) => W[i]))) : null, avg_hr: H ? r0(mean(ids.map((i) => H[i]))) : null })
    if (idx.length > 20) facts.halves = { first: part(idx.slice(0, half)), second: part(idx.slice(half)) }
  }

  // test FTP: najlepsze 20 min i tempo w blokach
  const isTest = ctx?.workout_id === 'FTP_TEST' || ctx?.workout_id === 'WATTBIKE_TEST' || /test/i.test(ride.name)
  if (W && isTest) {
    const b = bestAvg(W, dt, 1200)
    if (b) {
      const blk = Math.round(300 / dt)
      const blocks_w: number[] = []
      const blocks_hr: (number | null)[] = []
      for (let i = 0; i < 4; i++) {
        blocks_w.push(Math.round(mean(W.slice(b.start + i * blk, b.start + (i + 1) * blk)) ?? 0))
        blocks_hr.push(H ? r0(mean(H.slice(b.start + i * blk, b.start + (i + 1) * blk))) : null)
      }
      facts.test = { best20_w: Math.round(b.avg), ftp_est: Math.round(b.avg * 0.95), blocks_w, blocks_hr }
    }
  }

  // interwały: tylko gdy plan ma kroki mocniejsze niż Z3 (albo nie ma planu, a jazda wygląda na interwałową)
  // interwały z planu, a bez planu – z nazwy jazdy („3x12 słodki”, „4×8”)
  const hard = (ctx?.work ?? []).filter((s) => HARD_ZONES.has(s.zone))
  const named = ride.name.match(/(\d{1,2})\s*[x×]\s*(\d{1,2})/)
  const fromName = !hard.length && !snap?.planned && named ? { name: named[0], zone: 'SS', minutes: Number(named[2]), reps: Number(named[1]), watts: null, bpm: null } : null
  if (W && !facts.test && (hard.length || fromName)) {
    const main = fromName ?? hard.toSorted((a, b) => b.minutes * b.reps - a.minutes * a.reps)[0] ?? null
    const target = main?.watts ?? null
    const threshold = target ? 0.9 * target[0] : ftp ? (fromName ? 0.78 : 0.88) * ftp : null
    if (threshold) {
      const minSec = main ? Math.max(60, main.minutes * 60 * 0.5) : 120
      const runs = detectEfforts(W, H, dt, threshold, minSec)
      const detected: Effort[] = runs.slice(0, 12).map((r) => {
        const avg = mean(W.slice(r.start, r.end + 1)) ?? 0
        const mid = target ? (target[0] + target[1]) / 2 : null
        return {
          start_min: Math.round((r.start * dt) / 60),
          minutes: Math.round(((r.end - r.start + 1) * dt) / 6) / 10,
          avg_w: Math.round(avg),
          avg_hr: H ? r0(mean(H.slice(r.start, r.end + 1))) : null,
          vs_target_pct: mid ? Math.round((avg / mid) * 100) : null,
          in_target: target ? avg >= target[0] * 0.98 && avg <= target[1] * 1.03 : null,
        }
      })
      if (detected.length || main) {
        const fade = detected.length >= 2 ? Math.round(((detected.at(-1)!.avg_w - detected[0]!.avg_w) / detected[0]!.avg_w) * 100) : null
        facts.efforts = { planned_reps: main?.reps ?? 0, target_w: target, detected, fade_pct: fade }
      }
    }
  }

  // rekordy: najlepsze 1 / 5 / 20 min tej jazdy na tle ostatnich 90 dni
  if (W) {
    for (const sec of [60, 300, 1200]) {
      const b = bestAvg(W, dt, sec)
      const prev = hist.mmp90[String(sec)] ?? null
      if (b && (prev == null || b.avg > prev)) facts.records.push({ seconds: sec, watts: Math.round(b.avg), previous_best: prev })
    }
  }

  const d = facts.derived
  const put = (k: string, v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) d[k] = Math.round(v * 10) / 10
  }
  if (facts.plan) put('minutes_vs_plan', facts.ride.minutes - facts.plan.minutes)
  const work = facts.efforts?.detected ?? []
  const workW = work.length ? work.reduce((a, e) => a + e.avg_w, 0) / work.length : null
  const workHr = work.length && work.every((e) => e.avg_hr != null) ? work.reduce((a, e) => a + (e.avg_hr ?? 0), 0) / work.length : null
  put('work_avg_w', workW == null ? null : Math.round(workW))
  put('work_avg_hr', workHr == null ? null : Math.round(workHr))
  const prev = hist.previous_same
  if (prev) {
    if (workW != null && prev.work_avg_w != null) put('work_w_vs_previous', Math.round(workW) - prev.work_avg_w)
    if (workHr != null && prev.work_avg_hr != null) put('work_hr_vs_previous', Math.round(workHr) - prev.work_avg_hr)
    if (facts.ride.np_w != null && prev.np_w != null) put('np_vs_previous', facts.ride.np_w - prev.np_w)
    if (facts.ride.avg_hr != null && prev.avg_hr != null) put('hr_vs_previous', facts.ride.avg_hr - prev.avg_hr)
  }
  if (facts.week) {
    put('week_left_min', Math.max(0, facts.week.planned_min - facts.week.done_min))
    if (facts.week.planned_min > 0) put('week_done_pct', Math.round((facts.week.done_min / facts.week.planned_min) * 100))
  }
  if (facts.test && ftp) put('ftp_change_w', facts.test.ftp_est - ftp)
  if (facts.test && ftp) put('ftp_change_pct', Math.round(((facts.test.ftp_est - ftp) / ftp) * 100))
  for (const r of facts.records) if (r.previous_best != null) put(`record_${r.seconds}s_gain_w`, r.watts - r.previous_best)
  if (facts.halves?.first.avg_hr != null && facts.halves.second.avg_hr != null) put('hr_second_half_change', facts.halves.second.avg_hr - facts.halves.first.avg_hr)
  if (facts.halves?.first.avg_w != null && facts.halves.second.avg_w != null) put('w_second_half_change', facts.halves.second.avg_w - facts.halves.first.avg_w)
  return facts
}

/** Wszystkie liczby z paczki faktów (także zaokrąglone) – do sprawdzenia, czy notatka niczego nie zmyśliła. */
export function factNumbers(facts: unknown): number[] {
  const out: number[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v)
    else if (typeof v === 'string') for (const m of v.matchAll(/\d+(?:[.,]\d+)?/g)) out.push(Number(m[0].replace(',', '.')))
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(facts)
  return out
}

/**
 * Czy każda liczba w notatce jest w faktach (wprost albo po zaokrągleniu; porównania są policzone w `derived`),
 * albo jest małą liczbą całkowitą (≤ 12: „2 interwały”, „3 z 4”). Różnic między dowolnymi faktami nie dopuszczamy –
 * przy setkach liczb dałoby się tak „uzasadnić” niemal każdą zmyśloną wartość.
 */
export function numbersOk(note: string, facts: unknown): { ok: boolean; unknown: number[] } {
  const known = factNumbers(facts)
  // tolerancja zaokrąglenia do wypisanej precyzji: „0,7” ~ 0,70, „247” ~ 246,6 – ale „1,13” nie przejdzie jako „1”
  const near = (n: number, v: number, raw: string) => {
    const decimals = raw.split(/[.,]/)[1]?.length ?? 0
    return Math.abs(n - v) <= 0.5 * 10 ** -decimals + 1e-9
  }
  const bad: number[] = []
  for (const m of note.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = Number(m[0].replace(',', '.'))
    if (n <= 12 && Number.isInteger(n) && !/[.,]/.test(m[0])) continue
    if (!known.some((v) => near(n, v, m[0]) || near(n, Math.abs(v), m[0]))) bad.push(n)
  }
  return { ok: bad.length === 0, unknown: bad }
}
