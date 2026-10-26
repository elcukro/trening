import type { Nutrition } from './types'

/**
 * Budżet jedzenia dnia (Dietetyk, docs/25 § 4.2). Czysty TS: model tylko rozpoznaje posiłki, liczby dnia liczy kod.
 *   bmr = 10·masa + 6,25·wzrost − 5·wiek + 5          (Mifflin-St Jeor, mężczyzna)
 *   bez roweru = bmr × 1,35                           (praca siedząca, spacery; kalibracja – Beta 3)
 *   budżet = bez roweru + energia jazdy − deficyt dnia
 * Energia jazdy: kJ z jazdy (≈ kcal przy sprawności ~24 %), a przed jazdą – plan (IF z planowanego TSS × FTP × czas).
 */

export const ACTIVITY_FACTOR = 1.35

export function bmr(weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5
}

/** Wiek w dniu `date`: z pełnej daty urodzenia co do dnia, z samego roku – różnica lat (1 rok = 5 kcal). */
export function ageOn(birth: number | string, date: string): number {
  if (typeof birth === 'number') return Number(date.slice(0, 4)) - birth
  const years = Number(date.slice(0, 4)) - Number(birth.slice(0, 4))
  return date.slice(5) < birth.slice(5) ? years - 1 : years
}

/** Deficyt dnia w kcal: liczba z masy, gdy program ją liczy; inaczej z rodzaju dnia (300/500); dni bez deficytu – 0. */
export function deficitKcal(n: Pick<Nutrition, 'energy' | 'deficit_kcal'>, aboveTarget = true): number {
  if (n.deficit_kcal != null) return n.deficit_kcal
  if (n.energy.endsWith('_if_above_target') && !aboveTarget) return 0
  if (n.energy.startsWith('deficit_500')) return 500
  if (n.energy.startsWith('deficit_300')) return 300
  return 0
}

export interface RideEnergyInput {
  /** jazdy dnia ze Stravy: średnia moc i czas ruchu */
  rides: { avg_watts?: number | null; moving_time_s: number }[]
  /** plan dnia, gdy jazdy jeszcze nie ma */
  planned: { duration_min: number; tss: number } | null
  ftp: number
  /** dzień pominięty – plan się nie liczy */
  skipped?: boolean
}

/** Udział FTP przy jeździe bez pomiaru mocy (spokojna jazda, Z2) */
const NO_POWER_FTP_SHARE = 0.6

export function rideKcal(inp: RideEnergyInput): { kcal: number; source: 'ride' | 'plan' | 'none' } {
  if (inp.rides.length) {
    let kj = 0
    for (const r of inp.rides) kj += ((r.avg_watts && r.avg_watts > 0 ? r.avg_watts : NO_POWER_FTP_SHARE * inp.ftp) * r.moving_time_s) / 1000
    return { kcal: Math.round(kj), source: 'ride' }
  }
  if (inp.skipped || !inp.planned || inp.planned.duration_min <= 0) return { kcal: 0, source: 'none' }
  const h = inp.planned.duration_min / 60
  const intensity = inp.planned.tss > 0 ? Math.sqrt(inp.planned.tss / (100 * h)) : NO_POWER_FTP_SHARE
  return { kcal: Math.round(intensity * inp.ftp * h * 3.6), source: 'plan' }
}

export interface MealTotals {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  count: number
}

export function sumMeals(meals: { kcal: number; protein_g: number; carbs_g?: number | null; fat_g?: number | null; deleted_at?: string | null }[]): MealTotals {
  const t: MealTotals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, count: 0 }
  for (const m of meals) {
    if (m.deleted_at) continue
    t.kcal += m.kcal
    t.protein_g += m.protein_g
    t.carbs_g += m.carbs_g ?? 0
    t.fat_g += m.fat_g ?? 0
    t.count++
  }
  return t
}

export interface DayIntakeInput {
  date: string
  weightKg: number
  heightCm: number | null | undefined
  birthYear: number | null | undefined
  /** pełna data urodzenia ma pierwszeństwo przed rokiem */
  birthDate?: string | null
  nutrition: Pick<Nutrition, 'energy' | 'deficit_kcal'>
  aboveTarget: boolean
  ride: RideEnergyInput
  proteinTargetG: number
  meals: Parameters<typeof sumMeals>[0]
}

export interface DayIntake {
  eaten: MealTotals
  protein_target_g: number
  /** null = brak wzrostu albo roku urodzenia w profilu – pokazujemy tylko sumy */
  budget: null | {
    kcal: number
    left: number
    base_kcal: number
    ride_kcal: number
    ride_source: 'ride' | 'plan' | 'none'
    deficit_kcal: number
  }
}

export function dayIntake(inp: DayIntakeInput): DayIntake {
  const eaten = sumMeals(inp.meals)
  const birth = inp.birthDate ?? inp.birthYear
  if (!inp.heightCm || !birth) return { eaten, protein_target_g: inp.proteinTargetG, budget: null }
  const base = Math.round(bmr(inp.weightKg, inp.heightCm, ageOn(birth, inp.date)) * ACTIVITY_FACTOR)
  const ride = rideKcal(inp.ride)
  const deficit = deficitKcal(inp.nutrition, inp.aboveTarget)
  // budżet zaokrąglony do 10 kcal – to szacunek ±10 %, nie pomiar
  const kcal = Math.round((base + ride.kcal - deficit) / 10) * 10
  return { eaten, protein_target_g: inp.proteinTargetG, budget: { kcal, left: kcal - eaten.kcal, base_kcal: base, ride_kcal: ride.kcal, ride_source: ride.source, deficit_kcal: deficit } }
}

/** Produkt z etykiety: wartości na 100 g/ml × zjedzona ilość (docs/25 § 3 „Produkt z etykietą”). */
export function labelTotals(per100: { kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }, amount: number): { kcal: number; protein_g: number; carbs_g: number | null; fat_g: number | null } {
  const f = Math.max(0, amount) / 100
  const r = (v: number | null) => (v == null ? null : Math.round(v * f))
  return { kcal: Math.round(per100.kcal * f), protein_g: Math.round((per100.protein_g ?? 0) * f), carbs_g: r(per100.carbs_g), fat_g: r(per100.fat_g) }
}

/** Korekta porcji dania: mnożnik na sumach i pozycjach (−25 % / +25 % / ×2). */
export function scaleMeal<T extends { kcal: number; protein_g: number; carbs_g: number | null; fat_g: number | null; items: { name: string; grams: number | null; kcal: number; protein_g: number }[] }>(m: T, factor: number): T {
  const r = (v: number) => Math.round(v * factor)
  return {
    ...m,
    kcal: r(m.kcal),
    protein_g: r(m.protein_g),
    carbs_g: m.carbs_g == null ? null : r(m.carbs_g),
    fat_g: m.fat_g == null ? null : r(m.fat_g),
    items: m.items.map((i) => ({ ...i, grams: i.grams == null ? null : r(i.grams), kcal: r(i.kcal), protein_g: r(i.protein_g) })),
  }
}
