import type { DayPlan } from '@/engine/plan'
import type { Program } from '@/engine/schema'
import type { ResolvedStep } from '@/engine/types'
import { computeZones, zoneDistribution } from '@/engine/zones'
import { rideLoad } from '@/engine/analysis'
import { fmtLong } from '@/lib/dates'
import { days as daysLabel, num } from '@/lib/format'
import type { MorningView, StepView, WorkoutView } from '../../supabase/functions/_shared/email_templates'

/**
 * Model widoku maili (poranna odprawa, podsumowanie treningu) z danych silnika i Stravy.
 * Liczy aplikacja – tak jak plan dla Wahoo – a serwer tylko składa szablon i wysyła (docs/19).
 */

const range = (r: [number, number] | null | undefined, unit: string) => (r ? `${r[0]}–${r[1]} ${unit}` : null)

/** Kroki do tabeli: powtórzenia zwinięte do jednego wiersza „×N”, reszta jak w planie. */
export function stepRows(steps: ResolvedStep[]): StepView[] {
  const out: StepView[] = []
  for (const s of steps) {
    const rep = s.repeat_label?.split('/')
    if (rep && rep[0] !== '1') continue
    out.push({
      name: s.name,
      minutes: Math.round(s.duration_s / 60),
      zone: s.zone,
      hr: range(s.bpm, 'bpm'),
      watts: range(s.watts, 'W'),
      cadence: s.cadence_rpm ? `${s.cadence_rpm[0]}–${s.cadence_rpm[1]}` : null,
      repeat: rep ? `×${rep[1]}` : null,
    })
  }
  return out
}

export function morningView(day: DayPlan, program: Program, opts: { athlete: string; appUrl: string }): MorningView {
  const w = day.workout
  const target = program.meta.target
  const notes: string[] = []
  if (day.flags.includes('test')) notes.push('Dziś test – rozgrzewka pełna, pierwsze 5 min nie za mocno, zawsze te same warunki.')
  for (const x of day.warnings) notes.push(x.message)
  const all = w?.steps ?? []
  return {
    athlete: opts.athlete,
    appUrl: `${opts.appUrl}/i/dzien/${day.date}`,
    dateLabel: fmtLong(day.date),
    weekLabel: `Tydzień ${day.week} · ${day.phase_name}`,
    countdown: day.days_to_trip > 0 ? `${daysLabel(day.days_to_trip)} ${target.until}` : null,
    workout:
      w && day.bike
        ? {
            name: w.name,
            minutes: Math.round(all.reduce((a, s) => a + s.duration_s, 0) / 60) || day.bike.duration_min,
            key: day.day_type === 'key',
            bike: day.bike.bike,
            description: w.description,
            // pasek osi czasu potrzebuje wszystkich kroków, tabela – zwiniętych
            steps: stepRows(all),
            timeline: morningTimeline(day),
          }
        : null,
    gym: day.gym
      ? {
          name: day.gym.name,
          minutes: day.gym.est_min,
          items: day.gym.items.map((it) => {
            const ex = program.exercises[it.exercise]?.name ?? it.exercise
            const rx = [it.rx.sets && it.rx.reps ? `${it.rx.sets}×${it.rx.reps}` : null, it.rx.rir !== undefined ? `RIR ${it.rx.rir}` : null].filter(Boolean).join(', ')
            return rx ? `${ex} – ${rx}` : ex
          }),
        }
      : null,
    nutrition: {
      label: day.nutrition.label,
      carbs: day.nutrition.on_bike_carbs_g_per_h[1] > 0 ? `${day.nutrition.on_bike_carbs_g_per_h[0]}–${day.nutrition.on_bike_carbs_g_per_h[1]} g węglowodanów na godzinę` : null,
      protein: `${day.protein_g} g w ciągu dnia`,
      after: day.nutrition.post_workout ?? null,
    },
    notes,
  }
}

/** Oś czasu w mailu rysuje wszystkie kroki – zwinięte wiersze tabeli nie wystarczą. */
export function morningTimeline(day: DayPlan): { zone: string; minutes: number }[] {
  return (day.workout?.steps ?? []).map((s) => ({ zone: s.zone, minutes: s.duration_s / 60 }))
}

export interface RideRow {
  date: string
  name: string
  moving_time_s: number
  distance_m: number
  elevation_m: number
  avg_hr: number | null
  max_hr: number | null
  avg_cadence: number | null
  avg_watts: number | null
  np_w: number | null
  device_watts: boolean | null
  decoupling_pct: number | null
  hr_histogram: number[] | null
}

export function workoutView(
  ride: RideRow,
  day: DayPlan | null,
  program: Program,
  opts: { athlete: string; appUrl: string; ftp: number | null; lthr: number | null; week?: WorkoutView['week']; next?: WorkoutView['next'] },
): WorkoutView {
  const min = ride.moving_time_s / 60
  const load = rideLoad({ moving_s: ride.moving_time_s, device_watts: ride.device_watts, np_w: ride.np_w, avg_watts: ride.avg_watts, ftp: opts.ftp, hr_histogram: ride.hr_histogram, zones: program.hr_zones_lthr_fraction, lthr: opts.lthr })
  const planned = day?.bike && day.workout ? { name: day.workout.name, minutes: day.bike.duration_min } : null

  const stats: WorkoutView['stats'] = [{ label: 'czas jazdy', value: min >= 60 ? `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)}`, unit: min >= 60 ? 'h' : 'min' }]
  stats.push({ label: 'dystans', value: num(ride.distance_m / 1000, 1), unit: 'km' })
  if (ride.device_watts && ride.np_w) stats.push({ label: 'moc znormalizowana', value: String(ride.np_w), unit: 'W' })
  if (ride.device_watts && ride.avg_watts) stats.push({ label: 'średnia moc', value: String(ride.avg_watts), unit: 'W' })
  if (ride.avg_hr) stats.push({ label: 'średnie tętno', value: String(ride.avg_hr), unit: 'bpm' })
  if (load) stats.push({ label: load.method === 'power' ? 'TSS (z mocy)' : 'TSS (z tętna)', value: String(load.tss) })
  if (load) stats.push({ label: 'intensywność (IF)', value: load.if.toFixed(2).replace('.', ',') })
  if (ride.avg_cadence) stats.push({ label: 'kadencja', value: String(Math.round(ride.avg_cadence)), unit: 'rpm' })
  if (ride.elevation_m >= 1) stats.push({ label: 'przewyższenie', value: String(Math.round(ride.elevation_m)), unit: 'm' })

  const zones: WorkoutView['zones'] = []
  if (ride.hr_histogram && opts.lthr) {
    const bpm = computeZones(program.hr_zones_lthr_fraction, opts.lthr)
    for (const z of zoneDistribution(ride.hr_histogram, program.hr_zones_lthr_fraction, opts.lthr)) {
      const b = bpm.find((x) => x.id === z.id)
      zones.push({ zone: z.id, label: b ? `${z.id} ${b.name} (${b.low_bpm}–${b.high_bpm} bpm)` : z.id, pct: z.pct })
    }
  }

  // werdykt: długość względem planu (intensywność opisują obserwacje niżej)
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
  const easy = !day || day.day_type === 'easy' || day.day_type === 'long'
  if (load && easy) {
    insights.push(load.if <= 0.75 ? `IF ${load.if.toFixed(2).replace('.', ',')} – spokojnie, tak jak ma być na jeździe tlenowej.` : `IF ${load.if.toFixed(2).replace('.', ',')} – jak na spokojną jazdę za mocno; Z2 kończy się ok. 0,75.`)
  }
  if (ride.decoupling_pct != null) {
    const d = ride.decoupling_pct
    insights.push(
      d < 5
        ? `Dryf tętna względem mocy ${num(d, 1)} % – baza tlenowa trzyma (poniżej 5 %).`
        : d < 10
          ? `Dryf tętna względem mocy ${num(d, 1)} % – w drugiej połowie tętno uciekało; zjedz i napij się wcześniej, a tempo trzymaj równiej.`
          : `Dryf tętna względem mocy ${num(d, 1)} % – duży. Zmęczenie, upał albo za mało jedzenia; ta intensywność to jeszcze nie Twoje Z2 na tak długo.`,
    )
  }
  if (ride.avg_cadence && program.cadence) {
    const c = Math.round(ride.avg_cadence)
    if (c < program.cadence.floor_rpm) insights.push(`Średnia kadencja ${c} rpm – poniżej progu ${program.cadence.floor_rpm} rpm.`)
  }

  return { athlete: opts.athlete, appUrl: `${opts.appUrl}/i/dzien/${ride.date}`, dateLabel: fmtLong(ride.date), name: ride.name, planned, verdict, stats, zones, insights, week: opts.week ?? null, next: opts.next ?? null }
}
