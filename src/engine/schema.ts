import { z } from 'zod'

/** Schemat `data/program.json` – walidowany przy starcie aplikacji. */

const zoneId = z.string().min(1)

export const HrZoneSchema = z.object({
  id: zoneId,
  name: z.string(),
  low: z.number(),
  high: z.number(),
  rpe: z.tuple([z.number(), z.number()]),
})

export const PowerZoneSchema = z.object({ id: zoneId, low: z.number(), high: z.number() })

export const StepSchema = z.object({
  name: z.string(),
  duration_s: z.number().int().nonnegative(),
  zone: zoneId,
  target: z.object({ type: z.literal('threshold_hr'), low: z.number(), high: z.number() }),
  rpe: z.tuple([z.number(), z.number()]),
  intensity_type: z.enum(['wu', 'active', 'tempo', 'lt', 'ftp', 'map', 'ac', 'recover', 'cd']),
  cadence_rpm: z.tuple([z.number(), z.number()]).optional(),
  note: z.string().optional(),
})

export type StepBlock = z.infer<typeof StepSchema> | { repeat: number; steps: StepBlock[] }

export const StepBlockSchema: z.ZodType<StepBlock> = z.lazy(() =>
  z.union([StepSchema, z.object({ repeat: z.number().int().positive(), steps: z.array(StepBlockSchema) })]),
)

export const BikeWorkoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  key: z.boolean(),
  steps: z.array(StepBlockSchema),
  duration_min: z.number(),
  description: z.string(),
  parametric_duration: z.boolean().optional(),
  insert: StepBlockSchema.optional(),
})

export const ExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  pattern: z.string(),
  equipment: z.array(z.string()),
  cues: z.array(z.string()),
  why: z.string(),
  alternatives: z.array(z.string()).optional().default([]),
  load_unit: z.string(),
  per_side: z.boolean(),
})

export const RxSchema = z.object({
  sets: z.union([z.number().int(), z.string()]),
  reps: z.union([z.number().int(), z.string()]),
  rir: z.union([z.number().int(), z.string()]).optional(),
  rest_s: z.number().int().optional(),
  note: z.string().optional(),
  load_hint: z.string().optional(),
})

export const GymItemSchema = z.object({
  exercise: z.string(),
  rx: RxSchema,
  block: z.string().optional(),
  circuit: z.string().optional(),
})

export const GymSessionSchema = z.object({
  session: z.string(),
  name: z.string(),
  est_min: z.number(),
  items: z.array(GymItemSchema),
})

const daySlot = z.tuple([z.string(), z.number().nullable()]).nullable().optional()

export const WeekTemplateSchema = z.object({
  phase: z.string(),
  type: z.enum(['prep', 'build', 'deload', 'test', 'taper']),
  /** Poniedziałek jest domyślnie wolny; program może go wykorzystać (np. długa jazda na początku tygodnia). */
  mon: daySlot,
  tue: daySlot,
  wed: daySlot,
  thu: daySlot,
  fri: daySlot,
  sat: daySlot,
  sun: daySlot,
  gym_stage: z.string().nullable().optional(),
  notes: z.string().optional(),
  event: z.string().optional(),
})

export const PhaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  weeks: z.tuple([z.number().int(), z.number().int()]).optional(),
})

/** Dni siłowni: program alpejski używa wed/fri, program „FTP 300” jednej sesji w sobotę. */
const weekdayEnum = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
export const GymDaysSchema = z.object({
  A: weekdayEnum,
  B: weekdayEnum,
  C: weekdayEnum,
})

export const SettingsSchema = z.object({
  program_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trip_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  athlete_name: z.string(),
  body_weight_start_kg: z.number(),
  body_weight_target_kg: z.number(),
  bike_and_kit_kg: z.number(),
  lthr_bpm: z.number().nullable(),
  hr_max_bpm: z.number().nullable(),
  ftp_w_estimate: z.number(),
  ftp_w_goal: z.number(),
  /** miernik mocy: cele mocy w planach Wahoo i waty na ekranie */
  power_meter: z.boolean().default(false),
  gym_days: GymDaysSchema,
  timezone: z.string(),
  volume_scale: z.number().min(0.7).max(1),
  /** Który program treningowy obowiązuje tego użytkownika (klucz z `src/data/program.ts`). */
  program_id: z.string().optional(),
  units: z.string(),
  language: z.string(),
})

export const WeekSummarySchema = z.object({
  week: z.number().int(),
  phase: z.string(),
  type: z.string(),
  start: z.string(),
  end: z.string(),
  bike_min: z.number(),
  gym: z.array(z.string()),
  key: z.array(z.string()),
  sat: z.string().nullable(),
  sun: z.string().nullable(),
  event: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const ProgramSchema = z.object({
  version: z.string(),
  default_settings: SettingsSchema,
  hr_zones_lthr_fraction: z.array(HrZoneSchema),
  power_zones_ftp_fraction: z.array(PowerZoneSchema),
  phases: z.array(PhaseSchema),
  bike_workouts: z.record(z.string(), BikeWorkoutSchema),
  exercises: z.record(z.string(), ExerciseSchema),
  gym_prescription_stages: z.record(z.string(), z.string()),
  weeks: z.record(z.string(), WeekTemplateSchema),
  gym_prescriptions: z.record(z.string(), z.record(z.string(), GymSessionSchema)),
  week_summary: z.array(WeekSummarySchema),
  /**
   * `fixed` – tygodnie idą po kolei od szablonu 0 do ostatniego (program o stałej długości).
   * Brak pola = układ sezonowy z R14 (rozciąganie fazy IV do daty wyjazdu) – tak działa program alpejski.
   */
  layout: z.object({ mode: z.literal('fixed') }).optional(),
  /** Rower pokazywany przy treningach; bez niego obowiązuje reguła fazowa z `bikeSuggestion`. */
  bike_default: z.string().optional(),
})

export type Program = z.infer<typeof ProgramSchema>
export type HrZone = z.infer<typeof HrZoneSchema>
export type PowerZone = z.infer<typeof PowerZoneSchema>
export type Step = z.infer<typeof StepSchema>
export type BikeWorkout = z.infer<typeof BikeWorkoutSchema>
export type Exercise = z.infer<typeof ExerciseSchema>
export type Rx = z.infer<typeof RxSchema>
export type GymItem = z.infer<typeof GymItemSchema>
export type GymSession = z.infer<typeof GymSessionSchema>
export type WeekTemplate = z.infer<typeof WeekTemplateSchema>
export type Phase = z.infer<typeof PhaseSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type GymDays = z.infer<typeof GymDaysSchema>
export type WeekSummary = z.infer<typeof WeekSummarySchema>

export function parseProgram(raw: unknown): Program {
  return ProgramSchema.parse(raw)
}
