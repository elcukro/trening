/**
 * Model widoku podsumowania treningu – czysty TS wspólny dla aplikacji (podgląd, testy) i Edge Function
 * (wysyłka zaraz po imporcie jazdy ze Stravy). Serwer nie ma silnika planu, więc dostaje od aplikacji
 * „migawkę dnia” (`DaySnapshot`): co było w planie, progi i strefy w bpm obowiązujące tego dnia, plan tygodnia.
 */
import type { MorningView, WorkoutView } from './email_templates.ts'
import { fix, strings, type Lang } from './i18n.ts'

export interface ZoneBpmLite {
  id: string
  name: string
  low_bpm: number
  high_bpm: number
}

/** Krok roboczy planu (interwał) z celem – do sprawdzenia wykonania w notatce po treningu. */
export interface WorkStep {
  name: string
  zone: string
  minutes: number
  /** ile powtórzeń (1 = pojedynczy blok) */
  reps: number
  watts: [number, number] | null
  bpm: [number, number] | null
}

/** Kontekst planu dla notatki AI (docs/20) – po co był ten trening i na jakim etapie programu. */
export interface PlanContext {
  workout_id: string
  category: string
  description: string
  work: WorkStep[]
  phase: string
  phase_goal: string
  week_type: string
  flags: string[]
  goal: string
  coach_notes: string[]
}

/** Migawka dnia zapisywana przez aplikację w `email_days.payload`. */
export interface DaySnapshot {
  date: string
  dateLabel: string
  planned: { name: string; minutes: number; day_type: string } | null
  /** brak w migawkach sprzed 26.09.2026 */
  context?: PlanContext | null
  ftp: number | null
  lthr: number | null
  zones: ZoneBpmLite[]
  cadence_floor: number | null
  /** minuty jazd zaplanowane w tygodniu tej daty */
  week_planned_min: number
  next: { dateLabel: string; name: string; minutes: number } | null
  /** gotowa poranna odprawa (null = dzień bez treningu) */
  morning: MorningView | null
}

export interface RideLite {
  date: string
  name: string
  moving_time_s: number
  distance_m: number
  elevation_m: number
  avg_hr: number | null
  avg_cadence: number | null
  avg_watts: number | null
  np_w: number | null
  device_watts: boolean | null
  decoupling_pct: number | null
  hr_histogram: number[] | null
}

/** TSS na godzinę w strefie tętna – te same wartości co `HR_ZONE_TSS_PER_HOUR` w silniku (analysis.ts). */
export const HR_TSS_PER_HOUR: Record<string, number> = { Z1: 30, Z2: 49, Z3: 72, Z4: 90, Z5a: 110, Z5b: 132, Z5c: 156 }

/**
 * Sekundy w strefach z histogramu tętna (indeks = bpm). Kolejność listy stref decyduje przy nakładaniu (SS w Z3/Z4),
 * a tętno z dziury między strefami idzie do najbliższej strefy poniżej – jak `zoneDistribution` w silniku.
 */
export function hrZoneSeconds(hist: number[], zones: ZoneBpmLite[]): { id: string; seconds: number; pct: number }[] {
  const out = zones.map((z) => ({ id: z.id, seconds: 0, pct: 0 }))
  let total = 0
  hist.forEach((sec, bpm) => {
    if (!sec) return
    total += sec
    let t = zones.findIndex((z, i) => bpm >= z.low_bpm && (bpm < z.high_bpm || (i === zones.length - 1 && bpm >= z.low_bpm)))
    if (t < 0) {
      t = 0
      zones.forEach((z, i) => {
        if (bpm >= z.high_bpm && z.high_bpm >= zones[t]!.high_bpm) t = i
      })
      if (bpm > zones.at(-1)!.high_bpm) t = zones.length - 1
    }
    out[t]!.seconds += sec
  })
  if (total > 0) for (const o of out) o.pct = Math.round((o.seconds / total) * 100)
  return out
}

/** Obciążenie: moc (NP/FTP) albo czas w strefach tętna – jak `rideLoad` w silniku (bez gałęzi RPE). */
export function rideLoadLite(r: RideLite, ftp: number | null, zones: ZoneBpmLite[]): { tss: number; if: number; method: 'power' | 'hr' } | null {
  const hours = r.moving_time_s / 3600
  if (hours <= 0) return null
  const np = r.device_watts ? (r.np_w ?? r.avg_watts) : null
  if (np && ftp) {
    const ifv = np / ftp
    return { tss: Math.round(hours * ifv * ifv * 100), if: Math.round(ifv * 100) / 100, method: 'power' }
  }
  if (r.hr_histogram && zones.length) {
    const dist = hrZoneSeconds(r.hr_histogram, zones)
    let tss = 0
    let secs = 0
    for (const z of dist) {
      tss += (z.seconds / 3600) * (HR_TSS_PER_HOUR[z.id] ?? 49)
      secs += z.seconds
    }
    if (secs >= 300) {
      const h = secs / 3600
      return { tss: Math.round(tss), if: Math.round(Math.sqrt(tss / (h * 100)) * 100) / 100, method: 'hr' }
    }
  }
  return null
}

/**
 * Czy jazda „wypełnia” zaplanowany trening: ≥ 80 % planowanego czasu (decyzja 1.10.2026), a bez planu – ≥ 30 min.
 * Tylko taka jazda dostaje mail zaraz po imporcie i jest porównywana z planem; krótszy dojazd przed treningiem
 * czeka na wieczorne „Dzień w liczbach”.
 */
export const PLAN_FULFIL_RATIO = 0.8
/**
 * Próg „to był ten trening, tylko skrócony” (21.10.2026): jazda od połowy planu, najdłuższa danego dnia, jest planowym treningiem
 * zrobionym krócej – nie jazdą poza planem. Poniżej połowy to dojazd albo inna jazda. Mail od razu nadal tylko od 80 % (`fulfilsPlan`).
 */
export const PLAN_PARTIAL_RATIO = 0.5

export function isShortenedPlan(movingS: number, plannedMinutes: number | null | undefined): boolean {
  return !!plannedMinutes && movingS >= PLAN_PARTIAL_RATIO * plannedMinutes * 60 && movingS < PLAN_FULFIL_RATIO * plannedMinutes * 60
}
export function fulfilsPlan(movingS: number, plannedMinutes: number | null | undefined): boolean {
  return plannedMinutes ? movingS >= PLAN_FULFIL_RATIO * plannedMinutes * 60 : movingS >= 30 * 60
}

const hmLabel = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')} h`

export function buildWorkoutView(ride: RideLite, snap: DaySnapshot | null, opts: { athlete: string; appUrl: string; weekDoneMin?: number | null; rideDateLabel: string; note?: string | null; extras?: RideLite[]; lang?: Lang }): WorkoutView {
  const lang = opts.lang ?? 'pl'
  const V = strings(lang).mail.view
  const dec = (x: number, d = 1) => fix(x, d, lang)
  const if2 = (x: number) => fix(x, 2, lang)
  const min = ride.moving_time_s / 60
  const zones = snap?.zones ?? []
  const load = rideLoadLite(ride, snap?.ftp ?? null, zones)
  const planned = snap?.planned ? { name: snap.planned.name, minutes: snap.planned.minutes } : null

  const stats: WorkoutView['stats'] = [min >= 60 ? { label: V.movingTime, value: `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`, unit: 'h' } : { label: V.movingTime, value: String(Math.round(min)), unit: 'min' }]
  stats.push({ label: V.distance, value: dec(ride.distance_m / 1000), unit: 'km' })
  if (ride.device_watts && ride.np_w) stats.push({ label: V.np, value: String(ride.np_w), unit: 'W' })
  if (ride.device_watts && ride.avg_watts) stats.push({ label: V.avgPower, value: String(ride.avg_watts), unit: 'W' })
  if (ride.avg_hr) stats.push({ label: V.avgHr, value: String(Math.round(ride.avg_hr)), unit: 'bpm' })
  if (load) stats.push({ label: load.method === 'power' ? V.tssPower : V.tssHr, value: String(load.tss) })
  if (load) stats.push({ label: V.intensity, value: if2(load.if) })
  if (ride.avg_cadence) stats.push({ label: V.cadence, value: String(Math.round(ride.avg_cadence)), unit: 'rpm' })
  if (ride.elevation_m >= 1) stats.push({ label: V.elevation, value: String(Math.round(ride.elevation_m)), unit: 'm' })

  const shares: WorkoutView['zones'] = []
  if (ride.hr_histogram && zones.length) {
    for (const z of hrZoneSeconds(ride.hr_histogram, zones)) {
      const b = zones.find((x) => x.id === z.id)!
      if (z.pct >= 1) shares.push({ zone: z.id, label: `${z.id} ${b.name} (${b.low_bpm}–${b.high_bpm} bpm)`, pct: z.pct })
    }
  }

  let verdict: WorkoutView['verdict'] = { tone: 'ok', text: V.unplanned }
  if (planned) {
    const ratio = min / planned.minutes
    verdict =
      ratio >= 0.9 && ratio <= 1.2
        ? { tone: 'good', text: V.asPlanned }
        : ratio < PLAN_PARTIAL_RATIO
          ? { tone: 'warn', text: V.notDone(Math.round(ratio * 100)) }
          : ratio < PLAN_FULFIL_RATIO
            ? { tone: 'warn', text: V.shortened(Math.round(ratio * 100)) }
          : ratio < 0.9
            ? { tone: 'warn', text: V.shorter(Math.round(ratio * 100)) }
            : { tone: 'ok', text: V.longer(Math.round(ratio * 100)) }
  }

  const insights: string[] = []
  const easy = !snap?.planned || snap.planned.day_type === 'easy' || snap.planned.day_type === 'long'
  if (load && easy) insights.push(load.if <= 0.75 ? V.ifEasy(if2(load.if)) : V.ifHard(if2(load.if), if2(0.75)))
  // dryf Pw:HR ma sens tylko na równej jeździe – na interwałach i teście połówki jazdy różnią się strukturą, nie zmęczeniem
  const steady = !ride.device_watts || !ride.np_w || !ride.avg_watts || ride.np_w / ride.avg_watts <= 1.08
  if (ride.decoupling_pct != null && easy && steady) {
    const d = ride.decoupling_pct
    insights.push(
      d < 5
        ? V.driftLow(dec(d))
        : d < 10
          ? V.driftMid(dec(d))
          : V.driftHigh(dec(d)),
    )
  }
  if (ride.avg_cadence && snap?.cadence_floor && Math.round(ride.avg_cadence) < snap.cadence_floor) {
    insights.push(V.lowCadence(Math.round(ride.avg_cadence), snap.cadence_floor))
  }

  const week =
    snap && snap.week_planned_min > 0 && opts.weekDoneMin != null
      ? { label: V.thisWeek, done: hmLabel(opts.weekDoneMin), planned: hmLabel(snap.week_planned_min), pct: (opts.weekDoneMin / snap.week_planned_min) * 100 }
      : null

  // wieczorne „Dzień w liczbach”: wszystkie jazdy dnia, pierwsza to ta opisana wyżej
  const all = opts.extras?.length ? [ride, ...opts.extras] : null
  const day = all
    ? (() => {
        const rows = all.map((r) => {
          const l = rideLoadLite(r, snap?.ftp ?? null, zones)
          return { name: r.name, minutes: Math.round(r.moving_time_s / 60), km: r.distance_m / 1000, watts: r.device_watts ? (r.np_w ?? r.avg_watts) : null, hr: r.avg_hr, tss: l?.tss ?? null }
        })
        const tssKnown = rows.every((r) => r.tss != null)
        return { rides: rows, total_min: rows.reduce((s, r) => s + r.minutes, 0), total_tss: tssKnown ? rows.reduce((s, r) => s + (r.tss ?? 0), 0) : null }
      })()
    : null
  if (day && day.rides.length > 1) insights.push(V.manyRides(day.rides.length))

  return { athlete: opts.athlete, appUrl: `${opts.appUrl}/i/dzien/${ride.date}`, dateLabel: opts.rideDateLabel, name: ride.name, planned, verdict, stats, zones: shares, insights, week, next: snap?.next ?? null, note: opts.note ?? null, day }
}
