import type { BikeWorkout, Exercise, GymSession } from './schema'
import type { CalendarDay, EngineContext, LayoutWeek, ResolvedWorkout, ZoneBpm } from './types'
import { addDays, diffDays, mondayOf, type ISODate } from './dates'
import { buildCalendar, getCalendarDay, getCalendarWeek } from './calendar'
import { layoutWeeks } from './layout'
import { computeZones, resolveWorkout } from './zones'
import { proteinGrams } from './nutrition'

export interface DayPlan extends CalendarDay {
  /** dni do wyjazdu (0 = dzień wyjazdu, ujemne po wyjeździe) */
  days_to_trip: number
  phase_name: string
  workout: ResolvedWorkout | null
  fallback_workout: ResolvedWorkout | null
  zones: ZoneBpm[] | null
  protein_g: number
  /** ostrzeżenia z reguł (R1–R16) – etap 5; teraz tylko brak LTHR */
  warnings: PlanWarning[]
}

export interface PlanWarning {
  rule: string
  message: string
}

export function phaseName(ctx: EngineContext, phaseId: string): string {
  return ctx.program.phases.find((p) => p.id === phaseId)?.name ?? phaseId
}

/** Kompletny plan dnia dla UI: kalendarz + kroki z bpm + żywienie w gramach. */
export function getDayPlan(date: ISODate, ctx: EngineContext, weeks?: LayoutWeek[]): DayPlan | null {
  const day = getCalendarDay(date, ctx, weeks)
  if (!day) return null
  return enrichDay(day, ctx)
}

export function enrichDay(day: CalendarDay, ctx: EngineContext): DayPlan {
  const { program, settings } = ctx
  const lthr = settings.lthr_bpm
  const heat = day.flags.includes('heat') ? 4 : 0
  const w: BikeWorkout | undefined = day.bike ? program.bike_workouts[day.bike.workout_id] : undefined
  const fb: BikeWorkout | undefined = day.bike?.fallback_workout_id ? program.bike_workouts[day.bike.fallback_workout_id] : undefined
  const warnings: PlanWarning[] = []
  if (!lthr && day.bike && day.bike.workout_id !== 'TRIP' && day.bike.workout_id !== 'TRAVEL_REST') {
    warnings.push({ rule: 'LTHR', message: 'Zrób test progowy i wpisz LTHR, żeby zobaczyć cele w bpm.' })
  }
  return {
    ...day,
    days_to_trip: diffDays(settings.trip_start, day.date),
    phase_name: phaseName(ctx, day.phase),
    workout: w && day.bike ? resolveWorkout(w, day.bike.duration_min, lthr, { heatOffsetBpm: heat }) : null,
    fallback_workout: fb ? resolveWorkout(fb, fb.duration_min, lthr) : null,
    zones: lthr ? computeZones(program.hr_zones_lthr_fraction, lthr) : null,
    protein_g: proteinGrams(day.nutrition, settings.body_weight_target_kg),
    warnings,
  }
}

export function getWeekPlan(weekStart: ISODate, ctx: EngineContext, weeks?: LayoutWeek[]): DayPlan[] {
  return getCalendarWeek(mondayOf(weekStart), ctx, weeks).map((d) => enrichDay(d, ctx))
}

export function getSeason(ctx: EngineContext) {
  return { weeks: layoutWeeks(ctx.program, ctx.settings), days: buildCalendar(ctx) }
}

export function exerciseOf(ctx: EngineContext, id: string): Exercise | undefined {
  return ctx.program.exercises[id]
}

/** Szacowany czas sesji siłowej wg preskrypcji (informacyjnie). */
export function gymSessionMinutes(session: GymSession): number {
  return session.est_min
}

/** Dni zakresu kalendarza [start, end] – pomocnicze dla nawigacji. */
export function calendarRange(ctx: EngineContext): { start: ISODate; end: ISODate } {
  return { start: addDays(ctx.settings.program_start, -3), end: addDays(ctx.settings.trip_start, 1) }
}
