import type { GymSession, Program, Settings } from './schema'
import type { ISODate, Weekday } from './dates'

export type PhaseId = 'PREP' | 'I' | 'II' | 'III' | 'IV' | 'V' | 'TAPER'
export type WeekType = 'prep' | 'build' | 'deload' | 'test' | 'taper'
export type DayType = 'rest' | 'gym' | 'easy' | 'long' | 'key' | 'trip'
export type DayFlag = 'test' | 'deload' | 'mountain_weekend' | 'back_to_back' | 'heat'
export type EnergyKind =
  | 'maintenance'
  | 'maintenance_plus'
  | 'deficit_300'
  | 'deficit_500'
  | 'deficit_300_if_above_target'
  | 'deficit_500_if_above_target'

export interface Nutrition {
  energy: EnergyKind
  label: string
  protein_g_per_kg: number
  on_bike_carbs_g_per_h: [number, number]
  post_workout?: string | null
  /** udział w tygodniowym deficycie (tylko programy z `weight_based`) */
  deficit_share?: number
}

export interface BikeDay {
  workout_id: string
  name: string
  duration_min: number
  bike: string
  fallback_workout_id: string | null
}

/** Dokładnie format `data/calendar.json → days[]`. */
export interface CalendarDay {
  date: ISODate
  weekday: Weekday
  week: number
  phase: PhaseId
  week_type: WeekType
  day_type: DayType
  bike: BikeDay | null
  gym: GymSession | null
  nutrition: Nutrition
  flags: DayFlag[]
  week_notes?: string
  event?: string
}

/** Tydzień w układzie sezonu (po R14). */
export interface LayoutWeek {
  /** numer kolejny w kalendarzu użytkownika (0 = tydzień przygotowawczy) */
  week: number
  /** numer tygodnia-szablonu z `program.weeks` */
  template: number
  monday: ISODate
  phase: PhaseId
  type: WeekType
  /** true, gdy tydzień powstał przez rozciągnięcie fazy IV (R14) */
  cloned: boolean
}

export type OverrideKind = 'swap' | 'move' | 'skip' | 'indoor' | 'sick' | 'downgrade'

/** Nadpisania planu (etap 5) – model zdefiniowany od razu, żeby nie przebudowywać silnika. */
export interface PlanOverride {
  id: string
  date: ISODate
  kind: OverrideKind
  payload: Record<string, unknown>
}

export interface EngineContext {
  program: Program
  settings: Settings
  overrides?: PlanOverride[]
  /** wyniki testów – R11: strefy od następnego dnia po teście (LTHR z terenu, FTP z Wattbike'a) */
  tests?: { date: ISODate; lthr_bpm: number | null; ftp_w?: number | null }[]
  /** ostatnia zmierzona masa (check-in); bez niej silnik bierze masę startową z ustawień */
  current_weight_kg?: number | null
}

export interface ZoneBpm {
  id: string
  name: string
  low_bpm: number
  high_bpm: number
  low_frac: number
  high_frac: number
  rpe: [number, number]
}

export interface ResolvedStep {
  name: string
  duration_s: number
  zone: string
  bpm: [number, number] | null
  /** cel mocy w watach (gdy jest miernik i FTP) */
  watts: [number, number] | null
  rpe: [number, number]
  cadence_rpm?: [number, number]
  intensity_type: string
  note?: string
  /** głębokość w blokach powtórzeń (0 = poziom główny) */
  depth: number
  /** np. „2/3” dla powtórzeń */
  repeat_label?: string
}

export interface ResolvedWorkout {
  id: string
  name: string
  category: string
  key: boolean
  description: string
  duration_min: number
  steps: ResolvedStep[]
  has_bpm: boolean
}
