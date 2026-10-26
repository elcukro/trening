import { describe, expect, it } from 'vitest'
import { ageOn, bmr, dayIntake, deficitKcal, labelTotals, rideKcal, scaleMeal, sumMeals } from '../intake'
import { personalizeNutrition } from '../nutrition'
import { loadProgram } from '@/data/program'

describe('intake – budżet dnia (docs/25 § 4.2)', () => {
  it('Mifflin-St Jeor dla mężczyzny', () => {
    // 100 kg, 186 cm, 42 lata: 1000 + 1162,5 − 210 + 5
    expect(bmr(100, 186, 42)).toBeCloseTo(1957.5)
    expect(ageOn(1984, '2026-10-26')).toBe(42)
    // z pełnej daty – co do dnia
    expect(ageOn('1984-11-03', '2026-10-26')).toBe(41)
    expect(ageOn('1984-10-26', '2026-10-26')).toBe(42)
  })

  it('deficyt: liczba z masy ma pierwszeństwo, potem rodzaj dnia, dni bez deficytu = 0', () => {
    expect(deficitKcal({ energy: 'deficit_500', deficit_kcal: 350 })).toBe(350)
    expect(deficitKcal({ energy: 'deficit_500' })).toBe(500)
    expect(deficitKcal({ energy: 'deficit_300' })).toBe(300)
    expect(deficitKcal({ energy: 'maintenance' })).toBe(0)
    expect(deficitKcal({ energy: 'maintenance', deficit_kcal: 0 })).toBe(0)
    expect(deficitKcal({ energy: 'deficit_300_if_above_target' }, false)).toBe(0)
    expect(deficitKcal({ energy: 'deficit_300_if_above_target' }, true)).toBe(300)
  })

  it('personalizeNutrition wystawia deficyt jako liczbę', () => {
    const program = loadProgram('alps2027')
    const n = personalizeNutrition({ energy: 'deficit_500', label: 'Dzień lekki: x', protein_g_per_kg: 2, on_bike_carbs_g_per_h: [0, 0], deficit_share: 1 }, program.nutrition, { currentKg: 100, targetKg: 82, deficitWeeksLeft: 30 })
    expect(n.deficit_kcal).toBeGreaterThan(0)
    expect(n.label).toContain(`deficyt ok. ${n.deficit_kcal} kcal`)
    const done = personalizeNutrition({ energy: 'deficit_500', label: 'Dzień lekki: x', protein_g_per_kg: 2, on_bike_carbs_g_per_h: [0, 0], deficit_share: 1 }, program.nutrition, { currentKg: 82, targetKg: 82, deficitWeeksLeft: 30 })
    expect(done.deficit_kcal).toBe(0)
  })

  it('energia jazdy: kJ z mocy, bez mocy 60 % FTP, przed jazdą z planu', () => {
    expect(rideKcal({ rides: [{ avg_watts: 200, moving_time_s: 3600 }], planned: null, ftp: 250 })).toEqual({ kcal: 720, source: 'ride' })
    expect(rideKcal({ rides: [{ avg_watts: null, moving_time_s: 3600 }], planned: null, ftp: 250 })).toEqual({ kcal: 540, source: 'ride' })
    // 2 h przy TSS 100 → IF 0,707 × 250 W × 2 h × 3,6
    expect(rideKcal({ rides: [], planned: { duration_min: 120, tss: 100 }, ftp: 250 })).toEqual({ kcal: 1273, source: 'plan' })
    expect(rideKcal({ rides: [], planned: { duration_min: 120, tss: 100 }, ftp: 250, skipped: true })).toEqual({ kcal: 0, source: 'none' })
    expect(rideKcal({ rides: [], planned: null, ftp: 250 })).toEqual({ kcal: 0, source: 'none' })
  })

  it('suma posiłków pomija usunięte', () => {
    const t = sumMeals([
      { kcal: 500, protein_g: 30, carbs_g: 60, fat_g: 10 },
      { kcal: 300, protein_g: 20, carbs_g: null, fat_g: null },
      { kcal: 900, protein_g: 50, deleted_at: '2026-10-26T10:00:00Z' },
    ])
    expect(t).toEqual({ kcal: 800, protein_g: 50, carbs_g: 60, fat_g: 10, count: 2 })
  })

  it('budżet = bez roweru + jazda − deficyt; bez wzrostu albo roku urodzenia – tylko sumy', () => {
    const base = {
      date: '2026-10-26',
      weightKg: 100,
      heightCm: 186,
      birthYear: 1984,
      nutrition: { energy: 'deficit_500' as const, deficit_kcal: 400 },
      aboveTarget: true,
      ride: { rides: [{ avg_watts: 200, moving_time_s: 3600 }], planned: null, ftp: 250 },
      proteinTargetG: 180,
      meals: [{ kcal: 600, protein_g: 40 }],
    }
    const r = dayIntake(base)
    // round(1957,5 × 1,35) = 2643; + 720 − 400 = 2963 → 2960
    expect(r.budget).toEqual({ kcal: 2960, left: 2360, base_kcal: 2643, ride_kcal: 720, ride_source: 'ride', deficit_kcal: 400 })
    expect(r.eaten.kcal).toBe(600)
    expect(r.protein_target_g).toBe(180)
    expect(dayIntake({ ...base, heightCm: null }).budget).toBeNull()
    expect(dayIntake({ ...base, birthYear: undefined }).budget).toBeNull()
    expect(dayIntake({ ...base, birthYear: undefined, birthDate: '1984-01-01' }).budget?.base_kcal).toBe(2643)
  })

  it('etykieta: wartości na 100 × ilość', () => {
    const per100 = { kcal: 343, protein_g: 6.9, carbs_g: 77, fat_g: 0.5 }
    expect(labelTotals(per100, 200)).toEqual({ kcal: 686, protein_g: 14, carbs_g: 154, fat_g: 1 })
    expect(labelTotals({ kcal: 42, protein_g: null, carbs_g: 10.6, fat_g: null }, 500)).toEqual({ kcal: 210, protein_g: 0, carbs_g: 53, fat_g: null })
    expect(labelTotals(per100, -5).kcal).toBe(0)
  })

  it('korekta porcji skaluje sumy i pozycje', () => {
    const m = { kcal: 700, protein_g: 40, carbs_g: 80, fat_g: null, items: [{ name: 'ryż', grams: 200, kcal: 260, protein_g: 5 }] }
    const s = scaleMeal(m, 1.25)
    expect(s.kcal).toBe(875)
    expect(s.fat_g).toBeNull()
    expect(s.items[0]).toEqual({ name: 'ryż', grams: 250, kcal: 325, protein_g: 6 })
  })
})
