import { getCalendarWeek } from '@/engine/calendar'
import type { ISODate, Weekday } from '@/engine/dates'
import { generateProgram, type GeneratedPlan, type PlanTuning } from '@/engine/generator'
import type { AthleteProfile } from '@/engine/onboarding'
import type { DayType } from '@/engine/types'

/**
 * Podgląd wygenerowanego planu dla ekranu „Gotowe!” onboardingu (docs/32 § 6): pierwszy tydzień dzień po dniu
 * i kilka liczb o całym planie. Czysty TS – program liczy generator, tu tylko wybieramy, co pokazać.
 */

export interface PreviewDay {
  weekday: Weekday
  date: ISODate
  /** null = dzień wolny */
  name: string | null
  duration_min: number
  day_type: DayType
  test: boolean
}

export interface PlanPreview {
  plan: GeneratedPlan
  weeks: number
  /** docelowe godziny tygodniowo (po ograniczeniu limitami dni) */
  hours_per_week: number
  /** godziny pierwszego tygodnia */
  first_week_hours: number
  phases: { name: string; weeks: number }[]
  first_week: PreviewDay[]
  /** dzień testu kalibracyjnego w pierwszym tygodniu (null = bez testu w tygodniu 0) */
  test_day: Weekday | null
  horizon: GeneratedPlan['skeleton']['horizon']
  notes: string[]
}

/** `tuning` – dopasowanie z wiersza planu (AI albo wybór zawodnika, docs/33 § 8.2); bez niego plan domyślny. */
export function planPreview(profile: AthleteProfile, today: ISODate, tuning?: PlanTuning | null): PlanPreview {
  const plan = generateProgram(profile, today, tuning)
  const { program } = plan
  const settings = program.default_settings
  const days = getCalendarWeek(settings.program_start, { program, settings })
  const first_week: PreviewDay[] = days.map((d) => ({
    weekday: d.weekday,
    date: d.date,
    name: d.bike && d.bike.workout_id !== 'TRIP' ? d.bike.name : null,
    duration_min: d.bike && d.bike.workout_id !== 'TRIP' ? d.bike.duration_min : 0,
    day_type: d.day_type,
    test: d.flags.includes('test'),
  }))
  const minutes = first_week.reduce((s, d) => s + d.duration_min, 0)
  return {
    plan,
    weeks: plan.skeleton.weeks.length,
    hours_per_week: Math.round((Math.max(...plan.skeleton.weeks.map((w) => w.minutes)) / 60) * 10) / 10,
    first_week_hours: Math.round((minutes / 60) * 10) / 10,
    phases: program.phases.map((p) => ({ name: p.name, weeks: p.weeks ? p.weeks[1] - p.weeks[0] + 1 : 0 })),
    first_week,
    test_day: first_week.find((d) => d.test)?.weekday ?? null,
    horizon: plan.skeleton.horizon,
    notes: plan.notes,
  }
}
