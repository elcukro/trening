import type { NutritionPolicy } from './schema'
import { diffDays, type ISODate } from './dates'
import type { Nutrition, PhaseId, DayType } from './types'

/**
 * Żywienie dnia z polityki programu (`program.nutrition`). Silnik nie ma własnych progów ani etykiet –
 * deficyty, białko i węgle to decyzje o konkretnym zawodniku (docs/18, decoupling v1).
 * Port 1:1 `nutrition_for` z generatorów – golden pilnuje zgodności.
 */
export function nutritionFor(policy: NutritionPolicy, phase: PhaseId, dayType: DayType, bikeMin: number, key: boolean): Nutrition {
  if (dayType === 'trip' && policy.trip) {
    return {
      energy: policy.trip.energy,
      label: policy.trip.label,
      protein_g_per_kg: policy.trip.protein_g_per_kg,
      on_bike_carbs_g_per_h: [...policy.trip.carbs_g_per_h],
    }
  }
  const d = policy.deficit_by_phase[phase] ?? false
  const heavy = key || bikeMin >= policy.heavy_min
  const b = policy.buckets
  const bucket = d === false ? b.no_deficit : heavy ? b.heavy : bikeMin >= policy.medium_min ? b.medium : b.light
  let energy: Nutrition['energy'] = bucket.energy
  let label = bucket.label
  if (d === 'if_above_target' && energy.startsWith('deficit')) {
    label += policy.if_above_target_suffix
    energy = `${energy}_if_above_target` as Nutrition['energy']
  }
  const carbs = policy.carbs_g_per_h.find(([min]) => bikeMin >= min)
  return {
    energy,
    label,
    protein_g_per_kg: policy.protein_g_per_kg,
    on_bike_carbs_g_per_h: carbs ? [...carbs[1]] : [0, 0],
    post_workout: bikeMin >= policy.post_workout.min_ride_min || key ? policy.post_workout.text : null,
  }
}

/** Dzienna dawka białka w gramach (masa docelowa × g/kg), zaokrąglona do 5 g. */
export function proteinGrams(nutrition: Nutrition, targetWeightKg: number): number {
  return Math.round((nutrition.protein_g_per_kg * targetWeightKg) / 5) * 5
}

/** Energia w 1 kg tkanki tłuszczowej (przybliżenie stosowane w dietetyce sportowej). */
export const KCAL_PER_KG = 7700

export interface WeightDeficit {
  /** dzienny deficyt w dni z deficytem, zaokrąglony do 50 kcal (0 = bilans zerowy) */
  kcal: number
  /** tempo chudnięcia, które z tego wynika */
  kg_per_week: number
  /** czy limit dzienny albo limit tempa obciął to, czego wymagałby cel w terminie */
  capped: boolean
}

/**
 * Deficyt z danych zawodnika: brakujące kilogramy rozłożone na tygodnie do daty celu i na dni z deficytem.
 * Dwa bezpieczniki: limit kcal na dzień i limit tempa (% masy na tydzień). Przy masie ≤ docelowej – zero.
 */
export function weightBasedDeficit(inp: {
  currentKg: number
  targetKg: number
  date: ISODate
  goalDate: ISODate
  maxKcalPerDay: number
  maxLossPctPerWeek: number
  deficitDaysPerWeek: number
}): WeightDeficit {
  const gap = inp.currentKg - inp.targetKg
  if (gap <= 0 || inp.deficitDaysPerWeek <= 0) return { kcal: 0, kg_per_week: 0, capped: false }
  const weeksLeft = Math.max(1, diffDays(inp.goalDate, inp.date) / 7)
  const needKgPerWeek = gap / weeksLeft
  const maxKgPerWeek = (inp.currentKg * inp.maxLossPctPerWeek) / 100
  const kgPerWeek = Math.min(needKgPerWeek, maxKgPerWeek)
  const rawKcal = (kgPerWeek * KCAL_PER_KG) / inp.deficitDaysPerWeek
  const kcal = Math.round(Math.min(rawKcal, inp.maxKcalPerDay) / 50) * 50
  const effectiveKgPerWeek = (kcal * inp.deficitDaysPerWeek) / KCAL_PER_KG
  return { kcal, kg_per_week: Math.round(effectiveKgPerWeek * 100) / 100, capped: kcal < Math.round(((needKgPerWeek * KCAL_PER_KG) / inp.deficitDaysPerWeek) / 50) * 50 }
}

/**
 * Zamienia stałą etykietę dnia z deficytem na deficyt policzony z masy zawodnika (gdy program ma `weight_based`).
 * Dni bez deficytu i programy bez tej polityki zostają bez zmian.
 */
export function personalizeNutrition(n: Nutrition, policy: NutritionPolicy, inp: { currentKg: number; targetKg: number; date: ISODate; goalDate: ISODate }): Nutrition {
  const wb = policy.weight_based
  if (!wb || !n.energy.startsWith('deficit')) return n
  const d = weightBasedDeficit({ ...inp, maxKcalPerDay: wb.max_kcal_per_day, maxLossPctPerWeek: wb.max_loss_pct_per_week, deficitDaysPerWeek: wb.deficit_days_per_week })
  if (d.kcal < 100) return { ...n, energy: 'maintenance', label: 'Bilans zerowy – masa docelowa osiągnięta albo blisko' }
  const kg = d.kg_per_week.toLocaleString('pl-PL', { maximumFractionDigits: 2 })
  const target = inp.targetKg.toLocaleString('pl-PL', { maximumFractionDigits: 1 })
  return {
    ...n,
    energy: d.kcal >= 400 ? 'deficit_500' : 'deficit_300',
    // przy obciętym deficycie mówimy wprost, że cel w terminie wymagałby więcej – bez udawania, że się zdąży
    label: `Dzień lekki: deficyt ok. ${d.kcal} kcal (≈ ${kg} kg/tydz. do ${target} kg${d.capped ? ', limit dzienny – cel później niż w terminie' : ''})`,
  }
}
