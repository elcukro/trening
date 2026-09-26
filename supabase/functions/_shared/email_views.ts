/**
 * Model widoku podsumowania treningu – czysty TS wspólny dla aplikacji (podgląd, testy) i Edge Function
 * (wysyłka zaraz po imporcie jazdy ze Stravy). Serwer nie ma silnika planu, więc dostaje od aplikacji
 * „migawkę dnia” (`DaySnapshot`): co było w planie, progi i strefy w bpm obowiązujące tego dnia, plan tygodnia.
 */
import type { MorningView, WorkoutView } from './email_templates.ts'

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

const dec = (x: number, d = 1) => x.toFixed(d).replace('.', ',')
const if2 = (x: number) => x.toFixed(2).replace('.', ',')
const hmLabel = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')} h`

export function buildWorkoutView(ride: RideLite, snap: DaySnapshot | null, opts: { athlete: string; appUrl: string; weekDoneMin?: number | null; rideDateLabel: string; note?: string | null }): WorkoutView {
  const min = ride.moving_time_s / 60
  const zones = snap?.zones ?? []
  const load = rideLoadLite(ride, snap?.ftp ?? null, zones)
  const planned = snap?.planned ? { name: snap.planned.name, minutes: snap.planned.minutes } : null

  const stats: WorkoutView['stats'] = [min >= 60 ? { label: 'czas jazdy', value: `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`, unit: 'h' } : { label: 'czas jazdy', value: String(Math.round(min)), unit: 'min' }]
  stats.push({ label: 'dystans', value: dec(ride.distance_m / 1000), unit: 'km' })
  if (ride.device_watts && ride.np_w) stats.push({ label: 'moc znormalizowana', value: String(ride.np_w), unit: 'W' })
  if (ride.device_watts && ride.avg_watts) stats.push({ label: 'średnia moc', value: String(ride.avg_watts), unit: 'W' })
  if (ride.avg_hr) stats.push({ label: 'średnie tętno', value: String(Math.round(ride.avg_hr)), unit: 'bpm' })
  if (load) stats.push({ label: load.method === 'power' ? 'TSS (z mocy)' : 'TSS (z tętna)', value: String(load.tss) })
  if (load) stats.push({ label: 'intensywność (IF)', value: if2(load.if) })
  if (ride.avg_cadence) stats.push({ label: 'kadencja', value: String(Math.round(ride.avg_cadence)), unit: 'rpm' })
  if (ride.elevation_m >= 1) stats.push({ label: 'przewyższenie', value: String(Math.round(ride.elevation_m)), unit: 'm' })

  const shares: WorkoutView['zones'] = []
  if (ride.hr_histogram && zones.length) {
    for (const z of hrZoneSeconds(ride.hr_histogram, zones)) {
      const b = zones.find((x) => x.id === z.id)!
      if (z.pct >= 1) shares.push({ zone: z.id, label: `${z.id} ${b.name} (${b.low_bpm}–${b.high_bpm} bpm)`, pct: z.pct })
    }
  }

  let verdict: WorkoutView['verdict'] = { tone: 'ok', text: 'Jazda poza planem – policzona do obciążenia tygodnia' }
  if (planned) {
    const ratio = min / planned.minutes
    verdict =
      ratio >= 0.9 && ratio <= 1.2
        ? { tone: 'good', text: 'Zrobione zgodnie z planem' }
        : ratio < 0.9
          ? { tone: 'warn', text: `Krócej niż w planie (${Math.round(ratio * 100)} %)` }
          : { tone: 'ok', text: `Dłużej niż w planie (${Math.round(ratio * 100)} %)` }
  }

  const insights: string[] = []
  const easy = !snap?.planned || snap.planned.day_type === 'easy' || snap.planned.day_type === 'long'
  if (load && easy) insights.push(load.if <= 0.75 ? `IF ${if2(load.if)} – spokojnie, tak jak ma być na jeździe tlenowej.` : `IF ${if2(load.if)} – jak na spokojną jazdę za mocno; Z2 kończy się ok. 0,75.`)
  if (ride.decoupling_pct != null) {
    const d = ride.decoupling_pct
    insights.push(
      d < 5
        ? `Dryf tętna względem mocy ${dec(d)} % – baza tlenowa trzyma (poniżej 5 %).`
        : d < 10
          ? `Dryf tętna względem mocy ${dec(d)} % – w drugiej połowie tętno uciekało; zjedz i napij się wcześniej, a tempo trzymaj równiej.`
          : `Dryf tętna względem mocy ${dec(d)} % – duży. Zmęczenie, upał albo za mało jedzenia; ta intensywność to jeszcze nie Twoje Z2 na tak długo.`,
    )
  }
  if (ride.avg_cadence && snap?.cadence_floor && Math.round(ride.avg_cadence) < snap.cadence_floor) {
    insights.push(`Średnia kadencja ${Math.round(ride.avg_cadence)} rpm – poniżej progu ${snap.cadence_floor} rpm.`)
  }

  const week =
    snap && snap.week_planned_min > 0 && opts.weekDoneMin != null
      ? { label: 'Ten tydzień', done: hmLabel(opts.weekDoneMin), planned: hmLabel(snap.week_planned_min), pct: (opts.weekDoneMin / snap.week_planned_min) * 100 }
      : null

  return { athlete: opts.athlete, appUrl: `${opts.appUrl}/i/dzien/${ride.date}`, dateLabel: opts.rideDateLabel, name: ride.name, planned, verdict, stats, zones: shares, insights, week, next: snap?.next ?? null, note: opts.note ?? null }
}
