import type { Nutrition, PhaseId, DayType } from './types'

type DeficitPolicy = true | false | 'if_above_target'

const DEFICIT_PHASES: Record<PhaseId, DeficitPolicy> = {
  PREP: true,
  I: true,
  II: true,
  III: true,
  IV: 'if_above_target',
  V: false,
  TAPER: false,
}

/** Port 1:1 `nutrition_for` z reference_generator.py. */
export function nutritionFor(phase: PhaseId, dayType: DayType, bikeMin: number, key: boolean): Nutrition {
  const d = DEFICIT_PHASES[phase]
  if (dayType === 'trip') {
    return {
      energy: 'maintenance_plus',
      label: 'Wyjazd: jedz do syta, 70–80 g węgli/h na podjazdach',
      protein_g_per_kg: 1.6,
      on_bike_carbs_g_per_h: [70, 80],
    }
  }
  const heavy = key || bikeMin >= 120
  let energy: Nutrition['energy']
  let label: string
  if (d === false) {
    energy = 'maintenance'
    label = 'Bilans zerowy – jedz na pełną wydajność'
  } else if (heavy) {
    energy = 'maintenance'
    label = 'Dzień ciężki: bez deficytu, paliwo na trening'
  } else if (bikeMin >= 60) {
    energy = 'deficit_300'
    label = 'Deficyt ok. 300 kcal'
  } else {
    energy = 'deficit_500'
    label = 'Dzień lekki: deficyt ok. 500 kcal'
  }
  if (d === 'if_above_target' && energy.startsWith('deficit')) {
    label += ' (tylko jeśli waga > celu)'
    energy = `${energy}_if_above_target` as Nutrition['energy']
  }
  return {
    energy,
    label,
    protein_g_per_kg: 1.8,
    on_bike_carbs_g_per_h: bikeMin >= 90 ? [60, 80] : bikeMin >= 60 ? [30, 40] : [0, 0],
    post_workout: bikeMin >= 60 || key ? '30–40 g białka + węglowodany w ciągu 1–2 h' : null,
  }
}

/** Dzienna dawka białka w gramach (masa docelowa × g/kg), zaokrąglona do 5 g. */
export function proteinGrams(nutrition: Nutrition, targetWeightKg: number): number {
  return Math.round((nutrition.protein_g_per_kg * targetWeightKg) / 5) * 5
}
