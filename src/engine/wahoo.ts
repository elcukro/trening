import type { BikeWorkout, StepBlock } from './schema'
import { totalSeconds } from './zones'

/**
 * Generator pliku `plan.json` dla Wahoo Cloud API (ELEMNT Bolt).
 * Czysty TypeScript – kroki z `program.json` → interwały Wahoo z celami tętna jako ułamek LTHR.
 * Dokumentacja: https://cloud-api.wahooligan.com/ (plans, workouts).
 */

export type WahooTargetType = 'threshold_hr' | 'rpm' | 'rpe'
export type WahooIntensity = 'wu' | 'active' | 'tempo' | 'lt' | 'map' | 'ac' | 'recover' | 'cd'

export interface WahooTarget {
  type: WahooTargetType
  low: number
  high: number
}

export interface WahooInterval {
  name: string
  exit_trigger_type: 'time' | 'repeat'
  exit_trigger_value: number
  intensity_type?: WahooIntensity
  targets?: WahooTarget[]
  intervals?: WahooInterval[]
}

export interface WahooPlan {
  header: {
    name: string
    version: string
    description: string
    workout_type_family: number
    workout_type_location: number
    threshold_hr?: number
    ftp?: number
  }
  intervals: WahooInterval[]
}

/** Rodziny i lokalizacje wg Wahoo: 0 = kolarstwo; lokalizacja 0 = pod dachem, 1 = na zewnątrz. */
export const WORKOUT_TYPE_FAMILY_CYCLING = 0
export const LOCATION_INDOOR = 0
export const LOCATION_OUTDOOR = 1

/** workout_type_id: 0 = BIKING (na zewnątrz), 61 = BIKING_INDOOR_TRAINER. */
export const WORKOUT_TYPE_ID_OUTDOOR = 0
export const WORKOUT_TYPE_ID_INDOOR = 61

const INDOOR_WORKOUTS = new Set(['INDOOR_4x4', 'WATTBIKE_TEST'])

export function isIndoor(workoutId: string): boolean {
  return INDOOR_WORKOUTS.has(workoutId)
}

/** `ftp` z naszych danych nie występuje u Wahoo – test progowy prowadzimy jak wysiłek progowy. */
function intensity(type: string): WahooIntensity {
  return type === 'ftp' ? 'lt' : (type as WahooIntensity)
}

function isRepeat(b: StepBlock): b is { repeat: number; steps: StepBlock[] } {
  return 'repeat' in b
}

function targetsFor(step: Exclude<StepBlock, { repeat: number; steps: StepBlock[] }>, hasLthr: boolean): WahooTarget[] {
  const out: WahooTarget[] = []
  if (hasLthr) {
    // Wahoo oczekuje ułamka tętna progowego, nie bpm
    out.push({ type: 'threshold_hr', low: round2(step.target.low), high: round2(step.target.high) })
  } else {
    out.push({ type: 'rpe', low: step.rpe[0], high: step.rpe[1] })
  }
  if (step.cadence_rpm) out.push({ type: 'rpm', low: step.cadence_rpm[0], high: step.cadence_rpm[1] })
  return out
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function convert(blocks: StepBlock[], hasLthr: boolean): WahooInterval[] {
  return blocks.map((b) => {
    if (isRepeat(b)) {
      return {
        name: `${b.repeat}×`,
        exit_trigger_type: 'repeat' as const,
        exit_trigger_value: b.repeat,
        intervals: convert(b.steps, hasLthr),
      }
    }
    return {
      name: b.name,
      exit_trigger_type: 'time' as const,
      exit_trigger_value: b.duration_s,
      intensity_type: intensity(b.intensity_type),
      targets: targetsFor(b, hasLthr),
    }
  })
}

/**
 * Bloki treningu z czasem dnia. Jazdy parametryczne (Z2, LONG…) to jeden interwał o czasie z kalendarza;
 * LONG_TEMPO dostaje blok tempa w środku, tak samo jak w aplikacji.
 */
export function planBlocks(workout: BikeWorkout, durationMin: number): StepBlock[] {
  const first = workout.steps[0]
  if (workout.parametric_duration && workout.steps.length === 1 && first && !isRepeat(first)) {
    const total = durationMin * 60
    if (workout.insert) {
      const insertSec = totalSeconds([workout.insert])
      const rest = Math.max(0, total - insertSec)
      const before = Math.round(rest / 2 / 60) * 60
      const after = Math.max(0, rest - before)
      return [{ ...first, duration_s: before }, workout.insert, { ...first, name: `${first.name} (c.d.)`, duration_s: after }]
    }
    return [{ ...first, duration_s: total }]
  }
  return workout.steps
}

export interface BuildPlanOptions {
  durationMin: number
  lthr: number | null
  ftp?: number | null
  /** nazwa widoczna na Bolcie (domyślnie nazwa treningu) */
  name?: string
  programVersion: string
}

export function buildWahooPlan(workout: BikeWorkout, opts: BuildPlanOptions): WahooPlan {
  const blocks = planBlocks(workout, opts.durationMin)
  const hasLthr = !!opts.lthr
  const header: WahooPlan['header'] = {
    name: (opts.name ?? workout.name).slice(0, 80),
    version: '1.0.0',
    description: workout.description.slice(0, 500),
    workout_type_family: WORKOUT_TYPE_FAMILY_CYCLING,
    workout_type_location: isIndoor(workout.id) ? LOCATION_INDOOR : LOCATION_OUTDOOR,
  }
  if (opts.lthr) header.threshold_hr = opts.lthr
  if (opts.ftp) header.ftp = opts.ftp
  return { header, intervals: convert(blocks, hasLthr) }
}

/** Identyfikator w Wahoo – pozwala aktualizować zamiast duplikować. */
export function externalId(date: string, workoutId: string, programVersion: string): string {
  return `${date}:${workoutId}:${programVersion}`
}

export interface WahooPushItem {
  date: string
  workout_id: string
  name: string
  minutes: number
  workout_type_id: number
  external_id: string
  /** godzina startu treningu w ISO z przesunięciem strefy Europe/Warsaw */
  starts: string
  plan: WahooPlan
}

/** Treningi, których nie wysyłamy na Bolta. */
const SKIP = new Set(['REST', 'TRIP', 'TRAVEL_REST'])

export function isPushable(workoutId: string | null | undefined): boolean {
  return !!workoutId && !SKIP.has(workoutId)
}

/** Suma czasu planu w minutach (do pola `workout[minutes]`). */
export function planMinutes(plan: WahooPlan): number {
  const walk = (xs: WahooInterval[]): number =>
    xs.reduce((a, i) => a + (i.exit_trigger_type === 'repeat' ? i.exit_trigger_value * walk(i.intervals ?? []) : i.exit_trigger_value), 0)
  return Math.round(walk(plan.intervals) / 60)
}
