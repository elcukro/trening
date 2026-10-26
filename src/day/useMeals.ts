import { useLiveQuery } from 'dexie-react-hooks'
import { db, type MealRow, type SessionLog, type StravaActivity } from '@/db'
import { useEngine } from '@/app/useSettings'
import { dayIntake, type DayIntake } from '@/engine/intake'
import { plannedTss } from '@/engine/pmc'
import type { DayPlan } from '@/engine/plan'
import type { ISODate } from '@/engine/dates'

export interface MealsDay {
  enabled: boolean
  meals: MealRow[]
  intake: DayIntake | null
}

/**
 * Jedzenie dnia (docs/25): posiłki z Dexie + budżet z `intake.ts`. Wspólne dla `/m` (karta Jedzenie) i przyszłego kontekstu trenera.
 * Energia jazdy: jazdy dnia ze Stravy, a przed nimi plan; pominięty trening nie dolicza nic.
 */
export function useMeals(date: ISODate, day: DayPlan | null, d: { activities: StravaActivity[]; rideLog: SessionLog | undefined; ftp: number | null }): MealsDay {
  const engine = useEngine()
  const { settings, program } = engine.ctx
  const enabled = !!settings.diet_enabled
  const meals = useLiveQuery(async () => (enabled ? (await db.meals.where('date').equals(date).toArray()).filter((m) => !m.deleted_at).toSorted((a, b) => (a.time ?? '').localeCompare(b.time ?? '')) : []), [date, enabled]) ?? []
  if (!enabled || !day) return { enabled, meals, intake: null }
  const weightKg = engine.ctx.current_weight_kg ?? settings.body_weight_start_kg
  const ftp = d.ftp ?? settings.ftp_w_estimate
  const intake = dayIntake({
    date,
    weightKg,
    heightCm: settings.height_cm,
    birthYear: settings.birth_year,
    nutrition: day.nutrition,
    aboveTarget: weightKg > settings.body_weight_target_kg,
    ride: {
      rides: d.activities.filter((a) => a.is_ride),
      planned: day.bike ? { duration_min: day.bike.duration_min, tss: plannedTss(day, program) } : null,
      ftp,
      skipped: d.rideLog?.status === 'skipped',
    },
    proteinTargetG: day.protein_g,
    meals,
  })
  return { enabled, meals, intake }
}
