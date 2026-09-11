import type { GymSession, Program, Settings, WeekSummary, WeekTemplate } from './schema'
import type { CalendarDay, DayFlag, DayType, EngineContext, LayoutWeek, PhaseId } from './types'
import { addDays, compareISO, WEEKDAYS, weekdayOf, type ISODate, type Weekday } from './dates'
import { layoutWeeks } from './layout'
import { nutritionFor } from './nutrition'

/** Jazdy skalowane przez `volume_scale` (R16) i ich minimalny czas. */
export const SCALABLE_WORKOUTS: Record<string, number> = {
  Z2: 45,
  Z2_CADENCE: 45,
  Z2_HEAT: 45,
  HILLS: 45,
  LONG: 90,
  LONG_TEMPO: 90,
}

export function scaleDuration(workoutId: string, durationMin: number, volumeScale: number): number {
  const min = SCALABLE_WORKOUTS[workoutId]
  if (min === undefined || volumeScale >= 1) return durationMin
  const scaled = Math.round((durationMin * volumeScale) / 5) * 5
  return Math.max(Math.min(min, durationMin), scaled)
}

/** Domyślne treningi, gdy szablon tygodnia nie definiuje dnia (port z generatora). */
const DEFAULT_SLOT: Partial<Record<Weekday, [string, number]>> = {
  thu: ['Z1_RECOVERY', 45],
  fri: ['REST', 0],
  tue: ['Z2', 60],
  wed: ['Z2', 60],
}

function isKeyWorkout(id: string, key: boolean): boolean {
  return key || /^(SS_|THR_|VO2_|TEST|WATTBIKE)/.test(id)
}

export function bikeSuggestion(phase: PhaseId, workoutId: string): string {
  if (['MOUNTAIN_DAY', 'B2B_DAY', 'BLOCK_DAY1'].includes(workoutId)) return 'Checkpoint (przełożenie 40/50, tarczówki)'
  if (['WATTBIKE_TEST', 'INDOOR_4x4'].includes(workoutId)) return 'Wattbike / rowerek na siłowni'
  if (phase === 'II') return 'Checkpoint (zima, błotniki)'
  if (phase === 'V' || phase === 'TAPER') return 'Checkpoint (docelowy rower wyjazdowy)'
  return 'Dogma na suchą szosę > 5 °C; Checkpoint na mokro, sól, szuter'
}

/** Sesja siłowa na dany dzień: slot „wed” → dzień z gym_days (A/C), slot „fri” → Sesja B. */
export function gymFor(program: Program, template: number, weekday: Weekday, gymDays: Settings['gym_days']): GymSession | null {
  const slots = program.gym_prescriptions[String(template)]
  if (!slots) return null
  for (const [slot, session] of Object.entries(slots)) {
    let day: Weekday
    if (slot === 'fri') day = gymDays.B
    else if (session.session === 'A') day = gymDays.A
    else if (session.session === 'C') day = gymDays.C
    else day = 'wed'
    if (day === weekday) return session
  }
  return null
}

export function buildDay(ctx: EngineContext, lw: LayoutWeek, weekday: Weekday, date: ISODate): CalendarDay {
  const { program, settings } = ctx
  const wk: WeekTemplate = program.weeks[String(lw.template)]!
  const phase = lw.phase
  let slot: [string, number | null]
  if (compareISO(date, settings.trip_start) >= 0) {
    slot = ['TRIP', 0]
  } else if (weekday === 'mon') {
    slot = ['REST', 0]
  } else {
    const fromTemplate = wk[weekday]
    if (fromTemplate) slot = fromTemplate
    else slot = lw.template > 0 ? (DEFAULT_SLOT[weekday] ?? ['REST', 0]) : ['REST', 0]
  }
  const [wid, durRaw] = slot
  const w = program.bike_workouts[wid]
  if (!w) throw new Error(`Nieznany trening ${wid} (tydzień ${lw.template}, ${weekday})`)
  let dur = durRaw ?? w.duration_min
  dur = scaleDuration(wid, dur, settings.volume_scale)
  const gym = gymFor(program, lw.template, weekday, settings.gym_days)
  const key = isKeyWorkout(wid, w.key)
  let fallback: string | null = phase === 'II' && /^(SS_|THR_)/.test(wid) ? 'INDOOR_4x4' : null
  if (wid === 'LONG' && phase === 'II') fallback = null

  let dayType: DayType
  if (wid === 'REST' || wid === 'TRAVEL_REST') dayType = gym ? 'gym' : 'rest'
  else if (wid === 'TRIP') dayType = 'trip'
  else dayType = key ? 'key' : dur >= 120 ? 'long' : 'easy'

  const flags: DayFlag[] = []
  if (/^(TEST|WATTBIKE)/.test(wid)) flags.push('test')
  if (w.category === 'mountain') flags.push('mountain_weekend')
  if (wid === 'B2B_DAY' || wid === 'BLOCK_DAY1') flags.push('back_to_back')
  if (wk.type === 'deload') flags.push('deload')
  if (wid === 'Z2_HEAT') flags.push('heat')

  const bikeMin = wid === 'REST' || wid === 'TRAVEL_REST' || wid === 'TRIP' ? 0 : dur
  const day: CalendarDay = {
    date,
    weekday,
    week: lw.week,
    phase,
    week_type: lw.type,
    day_type: dayType,
    bike:
      wid === 'REST'
        ? null
        : { workout_id: wid, name: w.name, duration_min: dur, bike: bikeSuggestion(phase, wid), fallback_workout_id: fallback },
    gym: gym ? { session: gym.session, name: gym.name, est_min: gym.est_min, items: gym.items } : null,
    nutrition: nutritionFor(phase, dayType, bikeMin, key),
    flags,
  }
  if (weekday === 'mon' && wk.notes) day.week_notes = wk.notes
  if (weekday === 'sat' && wk.event && !lw.cloned) day.event = wk.event
  return day
}

/** Pierwszy dzień kalendarza: piątek tygodnia 0 (dla domyślnych ustawień 11.09.2026). */
export function calendarStart(settings: Pick<Settings, 'program_start'>): ISODate {
  return addDays(settings.program_start, -3)
}

export function calendarEnd(settings: Pick<Settings, 'trip_start'>): ISODate {
  return addDays(settings.trip_start, 1)
}

/** Pełny kalendarz dzień po dniu – dla ustawień domyślnych identyczny z `data/calendar.json`. */
export function buildCalendar(ctx: EngineContext): CalendarDay[] {
  const weeks = layoutWeeks(ctx.program, ctx.settings)
  const start = calendarStart(ctx.settings)
  const end = calendarEnd(ctx.settings)
  const days: CalendarDay[] = []
  for (const lw of weeks) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(lw.monday, i)
      if (compareISO(date, end) > 0) return days
      if (compareISO(date, start) < 0) continue
      days.push(buildDay(ctx, lw, WEEKDAYS[i]!, date))
    }
  }
  return days
}

export function findLayoutWeek(weeks: LayoutWeek[], date: ISODate): LayoutWeek | undefined {
  return weeks.find((w) => compareISO(date, w.monday) >= 0 && compareISO(date, addDays(w.monday, 6)) <= 0)
}

/** Plan jednego dnia (bez reguł adaptacji – te nakłada `applyRules`). */
export function getCalendarDay(date: ISODate, ctx: EngineContext, weeks = layoutWeeks(ctx.program, ctx.settings)): CalendarDay | null {
  if (compareISO(date, calendarStart(ctx.settings)) < 0 || compareISO(date, calendarEnd(ctx.settings)) > 0) return null
  const lw = findLayoutWeek(weeks, date)
  if (!lw) return null
  return buildDay(ctx, lw, weekdayOf(date), date)
}

export function getCalendarWeek(weekStart: ISODate, ctx: EngineContext, weeks = layoutWeeks(ctx.program, ctx.settings)): CalendarDay[] {
  const out: CalendarDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = getCalendarDay(addDays(weekStart, i), ctx, weeks)
    if (d) out.push(d)
  }
  return out
}

/** Tabela tygodni sezonu – port `week_table` z generatora (dla domyślnych = `program.week_summary`). */
export function seasonSummary(ctx: EngineContext, days = buildCalendar(ctx)): WeekSummary[] {
  const weeks = new Map<number, WeekSummary>()
  for (const d of days) {
    let w = weeks.get(d.week)
    if (!w) {
      w = { week: d.week, phase: d.phase, type: d.week_type, start: d.date, end: d.date, bike_min: 0, gym: [], key: [], sat: null, sun: null }
      weeks.set(d.week, w)
    }
    if (d.bike && d.bike.workout_id !== 'TRIP' && d.bike.workout_id !== 'TRAVEL_REST') w.bike_min += d.bike.duration_min
    if (d.gym) w.gym.push(`${d.gym.session}(${d.weekday})`)
    if (d.weekday === 'wed' && d.bike) w.key.push(d.bike.workout_id)
    if (d.weekday === 'sat' && d.bike) w.sat = `${d.bike.workout_id} ${d.bike.duration_min}′`
    if (d.weekday === 'sun' && d.bike) w.sun = `${d.bike.workout_id} ${d.bike.duration_min}′`
    if (d.weekday === 'fri' && d.bike && d.bike.workout_id === 'BLOCK_DAY1') w.key.push('BLOCK_DAY1(pt)')
    w.end = d.date
  }
  const layout = layoutWeeks(ctx.program, ctx.settings)
  for (const lw of layout) {
    const w = weeks.get(lw.week)
    if (!w) continue
    const t = ctx.program.weeks[String(lw.template)]!
    w.event = lw.cloned ? null : (t.event ?? null)
    w.notes = t.notes ?? null
  }
  return [...weeks.values()].sort((a, b) => a.week - b.week)
}
