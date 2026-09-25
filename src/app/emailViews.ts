import type { DayPlan } from '@/engine/plan'
import type { Program } from '@/engine/schema'
import type { ResolvedStep } from '@/engine/types'
import { computeZones } from '@/engine/zones'
import { mondayOf } from '@/engine/dates'
import { fmtLong } from '@/lib/dates'
import { days as daysLabel } from '@/lib/format'
import type { MorningView, StepView, WorkoutView } from '../../supabase/functions/_shared/email_templates'
import { buildWorkoutView, type DaySnapshot, type RideLite, type ZoneBpmLite } from '../../supabase/functions/_shared/email_views'

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

export type RideRow = RideLite & { max_hr?: number | null }

/** Strefy tętna dnia w bpm – tak, jak liczy je silnik (te same granice co w aplikacji). */
export function zonesFor(program: Program, lthr: number | null): ZoneBpmLite[] {
  return lthr ? computeZones(program.hr_zones_lthr_fraction, lthr).map((z) => ({ id: z.id, name: z.name, low_bpm: z.low_bpm, high_bpm: z.high_bpm })) : []
}

/**
 * Migawka dnia dla serwera (tabela `email_days`): serwer nie ma silnika, więc dostaje gotowy plan dnia,
 * progi i strefy tego dnia, plan tygodnia, następny trening i poranną odprawę.
 */
export function snapshotFor(day: DayPlan, window: DayPlan[], program: Program, opts: { athlete: string; appUrl: string }): DaySnapshot {
  const monday = mondayOf(day.date)
  const weekPlanned = window.filter((d) => mondayOf(d.date) === monday).reduce((a, d) => a + (d.bike && d.workout ? d.bike.duration_min : 0), 0)
  const next = window.find((d) => d.date > day.date && d.bike && d.workout)
  const hasTraining = (!!day.bike && !!day.workout && day.bike.duration_min > 0) || !!day.gym
  return {
    date: day.date,
    dateLabel: fmtLong(day.date),
    planned: day.bike && day.workout ? { name: day.workout.name, minutes: day.bike.duration_min, day_type: day.day_type } : null,
    ftp: day.ftp,
    lthr: day.lthr,
    zones: zonesFor(program, day.lthr),
    cadence_floor: program.cadence.floor_rpm,
    week_planned_min: weekPlanned,
    next: next ? { dateLabel: fmtLong(next.date), name: next.workout!.name, minutes: next.bike!.duration_min } : null,
    morning: hasTraining ? morningView(day, program, opts) : null,
  }
}

export function workoutView(
  ride: RideRow,
  day: DayPlan | null,
  program: Program,
  opts: { athlete: string; appUrl: string; ftp: number | null; lthr: number | null; week?: WorkoutView['week']; next?: WorkoutView['next'] },
): WorkoutView {
  const snap: DaySnapshot = {
    date: ride.date,
    dateLabel: fmtLong(ride.date),
    planned: day?.bike && day.workout ? { name: day.workout.name, minutes: day.bike.duration_min, day_type: day.day_type } : null,
    ftp: opts.ftp,
    lthr: opts.lthr,
    zones: zonesFor(program, opts.lthr),
    cadence_floor: program.cadence.floor_rpm,
    week_planned_min: 0,
    next: opts.next ?? null,
    morning: null,
  }
  const v = buildWorkoutView(ride, snap, { athlete: opts.athlete, appUrl: opts.appUrl, rideDateLabel: fmtLong(ride.date) })
  return { ...v, week: opts.week ?? null }
}
