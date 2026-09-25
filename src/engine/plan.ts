import type { BikeWorkout, Exercise, GymSession } from './schema'
import type { CalendarDay, EngineContext, LayoutWeek, PlanOverride, ResolvedWorkout, ZoneBpm } from './types'
import { applyOverrides } from './rules'
import { addDays, diffDays, mondayOf, type ISODate } from './dates'
import { buildCalendar, getCalendarDay, getCalendarWeek } from './calendar'
import { layoutWeeks } from './layout'
import { computeZones, resolveWorkout } from './zones'
import { personalizeNutrition, proteinGrams } from './nutrition'
import { effectiveFtp, effectiveLthr } from './progress'

export interface DayPlan extends CalendarDay {
  /** dni do wyjazdu (0 = dzień wyjazdu, ujemne po wyjeździe) */
  days_to_trip: number
  phase_name: string
  workout: ResolvedWorkout | null
  fallback_workout: ResolvedWorkout | null
  zones: ZoneBpm[] | null
  lthr: number | null
  lthr_source: 'test' | 'manual' | null
  /** FTP obowiązujące tego dnia (null, gdy nie ma miernika mocy) */
  ftp: number | null
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
  const eff = effectiveLthr(day.date, settings.lthr_bpm, (ctx.tests ?? []).filter((t): t is { date: string; lthr_bpm: number } => !!t.lthr_bpm))
  const lthr = eff.lthr
  const ftp = settings.power_meter ? effectiveFtp(day.date, settings.ftp_w_estimate, ctx.tests ?? []).ftp : null
  const heat = day.flags.includes('heat') ? 4 : 0
  const resolveOpts = { heatOffsetBpm: heat, ftp, powerZones: program.power_zones_ftp_fraction }
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
    workout: w && day.bike ? resolveWorkout(w, day.bike.duration_min, lthr, resolveOpts) : null,
    fallback_workout: fb ? resolveWorkout(fb, fb.duration_min, lthr, { ...resolveOpts, heatOffsetBpm: 0 }) : null,
    zones: lthr ? computeZones(program.hr_zones_lthr_fraction, lthr) : null,
    lthr,
    lthr_source: eff.source,
    ftp,
    nutrition: personalizeNutrition(day.nutrition, program.nutrition, {
      currentKg: ctx.current_weight_kg ?? settings.body_weight_start_kg,
      targetKg: settings.body_weight_target_kg,
      date: day.date,
      goalDate: settings.trip_start,
    }),
    protein_g: proteinGrams(day.nutrition, settings.body_weight_target_kg),
    warnings,
  }
}

/**
 * Dni `[from, from + days)` po nałożeniu nadpisań – wspólna ścieżka dla UI i dla wysyłki na Bolta.
 * Margines musi objąć drugi koniec przeniesienia (do miesiąca), inaczej `move` nie ma czego przenieść.
 */
export const OVERRIDE_PAD_DAYS = 40

export function planWindow(from: ISODate, days: number, ctx: EngineContext, weeks?: LayoutWeek[], overrides: PlanOverride[] = [], pad = OVERRIDE_PAD_DAYS): DayPlan[] {
  const to = addDays(from, days - 1)
  const base: CalendarDay[] = []
  for (let i = -pad; i < days + pad; i++) {
    const d = getCalendarDay(addDays(from, i), ctx, weeks)
    if (d) base.push(d)
  }
  return applyOverrides(base, overrides, ctx.program)
    .filter((d) => d.date >= from && d.date <= to)
    .map((d) => enrichDay(d, ctx))
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
