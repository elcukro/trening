import { t } from '../i18n'
import type { NutritionPolicy } from './schema'
import { mondayOf, type ISODate } from './dates'
import type { Nutrition, PhaseId, DayType } from './types'

/**
 * Żywienie dnia z polityki programu (`program.nutrition`). Silnik nie ma własnych progów ani etykiet –
 * deficyty, białko i węgle to decyzje o konkretnym zawodniku (docs/18, decoupling v1).
 * Port 1:1 `nutrition_for` z generatorów – golden pilnuje zgodności.
 */
/** Treningi, które nie liczą się jako czas jazdy (podróż, wyjazd). */
export const NO_RIDE_WORKOUTS = new Set(['REST', 'TRAVEL_REST', 'TRIP'])

/**
 * Żywienie policzone z gotowego dnia – te same reguły co przy budowie kalendarza. Używane po nadpisaniach
 * (przeniesienie, zamiana, choroba…), żeby dzień, który stracił jazdę, nie trzymał etykiety „Dzień treningowy”.
 */
export function nutritionForDay(policy: NutritionPolicy, day: { phase: PhaseId; day_type: DayType; bike: { workout_id: string; duration_min: number } | null; flags: string[] }): Nutrition {
  const bikeMin = day.bike && !NO_RIDE_WORKOUTS.has(day.bike.workout_id) ? day.bike.duration_min : 0
  return nutritionFor(policy, day.phase, day.day_type, bikeMin, day.day_type === 'key', day.flags.some((f) => f === 'test' || f === 'mountain_weekend' || f === 'back_to_back'))
}

export function nutritionFor(policy: NutritionPolicy, phase: PhaseId, dayType: DayType, bikeMin: number, key: boolean, protectedDay = false): Nutrition {
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
  // dzień ciężki: zwykle bez deficytu; w wybranych fazach mały deficyt poza treningiem – nigdy w dzień testu, gór i back-to-back
  const heavyBucket = b.heavy_deficit && !protectedDay && (policy.heavy_deficit_phases ?? []).includes(phase) ? b.heavy_deficit : b.heavy
  const bucket = d === false ? b.no_deficit : heavy ? heavyBucket : bikeMin >= policy.medium_min ? b.medium : b.light
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
    ...(bucket.deficit_share !== undefined ? { deficit_share: bucket.deficit_share } : {}),
  }
}

/** Dzienna dawka białka w gramach (masa docelowa × g/kg), zaokrąglona do 5 g. */
export function proteinGrams(nutrition: Nutrition, targetWeightKg: number): number {
  return Math.round((nutrition.protein_g_per_kg * targetWeightKg) / 5) * 5
}

/** Energia w 1 kg tkanki tłuszczowej (przybliżenie stosowane w dietetyce sportowej). */
export const KCAL_PER_KG = 7700

export interface WeightDeficit {
  /** deficyt tego dnia, zaokrąglony do 50 kcal (0 = bilans zerowy) */
  kcal: number
  /** tempo chudnięcia, które z tego wynika */
  kg_per_week: number
  /** czy limit dzienny albo limit tempa obciął to, czego wymagałby cel w terminie */
  capped: boolean
  /** tempo, którego wymagałby cel w terminie (bez limitów) */
  need_kg_per_week: number
}

/**
 * Deficyt z danych zawodnika, rozłożony proporcjonalnie: brakujące kilogramy dzielimy na pozostałe tygodnie
 * faz z deficytem, a tygodniową pulę na dni wg udziału (`share`: dzień lekki 1, treningowy 0,5, akcent 0).
 * Bezpieczniki: limit kcal na dzień i limit tempa (% masy na tydzień). Przy masie ≤ docelowej – zero.
 */
export function weightBasedDeficit(inp: {
  currentKg: number
  targetKg: number
  /** ile tygodni z deficytem zostało do daty celu (łącznie z bieżącym) */
  deficitWeeksLeft: number
  maxKcalPerDay: number
  maxLossPctPerWeek: number
  sharesPerWeek: number
  /** udział tego dnia */
  share: number
}): WeightDeficit {
  const gap = inp.currentKg - inp.targetKg
  const needKgPerWeek = gap > 0 ? gap / Math.max(1, inp.deficitWeeksLeft) : 0
  if (gap <= 0 || inp.sharesPerWeek <= 0 || inp.share <= 0) return { kcal: 0, kg_per_week: 0, capped: false, need_kg_per_week: needKgPerWeek }
  const maxKgPerWeek = (inp.currentKg * inp.maxLossPctPerWeek) / 100
  const kgPerWeek = Math.min(needKgPerWeek, maxKgPerWeek)
  const perShare = (kgPerWeek * KCAL_PER_KG) / inp.sharesPerWeek
  // limit dzienny dotyczy pełnego udziału; dzień z mniejszym udziałem dostaje proporcjonalnie mniej także po obcięciu
  const kcal = Math.round((Math.min(perShare, inp.maxKcalPerDay) * inp.share) / 50) * 50
  // tempo przy limicie dziennym liczone ostrożnie: jakby każdy udział był obcięty tak jak dzień pełny
  const effKgPerWeek = (Math.min(perShare, inp.maxKcalPerDay) * inp.sharesPerWeek) / KCAL_PER_KG
  return { kcal, kg_per_week: Math.round(effKgPerWeek * 100) / 100, capped: needKgPerWeek > maxKgPerWeek || perShare > inp.maxKcalPerDay, need_kg_per_week: Math.round(needKgPerWeek * 100) / 100 }
}

/**
 * Zamienia stałą etykietę dnia z deficytem na deficyt policzony z masy zawodnika (gdy program ma `weight_based`).
 * Dni bez deficytu i programy bez tej polityki zostają bez zmian.
 */
export function personalizeNutrition(n: Nutrition, policy: NutritionPolicy, inp: { currentKg: number; targetKg: number; deficitWeeksLeft: number; targetDate?: ISODate | null; finalKg?: number | null }): Nutrition {
  const wb = policy.weight_based
  if (!wb || !n.energy.startsWith('deficit')) return n
  const d = weightBasedDeficit({ ...inp, maxKcalPerDay: wb.max_kcal_per_day, maxLossPctPerWeek: wb.max_loss_pct_per_week, sharesPerWeek: wb.deficit_shares_per_week, share: n.deficit_share ?? 1 })
  const T = t().engine.nutrition
  // etykieta programu (już w języku zawodnika) ma postać „Rodzaj dnia: …” – bierzemy część przed dwukropkiem
  const kind = n.label.split(':')[0] ?? T.dayFallback
  if (d.kcal < 100) return { ...n, energy: 'maintenance', deficit_kcal: 0, label: inp.currentKg <= inp.targetKg ? T.reached(kind) : T.almostThere(kind) }
  // punkt kontrolny ma datę i cel końcowy w etykiecie („do punktu kontrolnego 91 kg na 1.03 (cel 82 kg)”), cel końcowy – nie
  const target = T.target(inp.targetKg, inp.targetDate ?? null, inp.targetDate ? (inp.finalKg ?? null) : null)
  // tempo dotyczy całego tygodnia (dni lekkie mają większy deficyt niż ten dzień) – mówimy to wprost;
  // przy obciętym deficycie podajemy, ile wymagałby cel w terminie, bez udawania, że się zdąży
  const week = d.capped ? T.weekCapped(d.kg_per_week, target, d.need_kg_per_week) : T.week(d.kg_per_week, target)
  return {
    ...n,
    energy: d.kcal >= 400 ? 'deficit_500' : 'deficit_300',
    deficit_kcal: d.kcal,
    label: T.deficit(kind, d.kcal, week),
  }
}

/**
 * Do czego teraz dążymy: najbliższy punkt kontrolny, którego data jeszcze nie minęła i którego masa jest niższa
 * od obecnej; gdy takich nie ma – masa docelowa na datę celu.
 */
export function weightTarget(policy: NutritionPolicy, currentKg: number, finalKg: number, date: ISODate, goalDate: ISODate): { kg: number; date: ISODate; milestone: boolean } {
  const next = (policy.weight_based?.milestones ?? [])
    .toSorted((a, b) => (a.date < b.date ? -1 : 1))
    .find((m) => m.date > date && m.date < goalDate && m.kg < currentKg && m.kg > finalKg)
  return next ? { kg: next.kg, date: next.date, milestone: true } : { kg: finalKg, date: goalDate, milestone: false }
}

/** Tygodnie z deficytem od tygodnia z `date` do daty celu – mianownik rozkładu brakujących kilogramów. */
export function deficitWeeksLeft(weeks: { monday: ISODate; phase: PhaseId }[], policy: NutritionPolicy, date: ISODate, goalDate: ISODate): number {
  const from = mondayOf(date)
  return weeks.filter((w) => w.monday >= from && w.monday < goalDate && policy.deficit_by_phase[w.phase]).length
}
