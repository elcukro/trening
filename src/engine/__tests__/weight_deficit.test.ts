import { describe, expect, it } from 'vitest'
import ftpJson from '../../../data/program-ftp300.json'
import alpsJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { deficitWeeksLeft, personalizeNutrition, weightBasedDeficit } from '../nutrition'
import { layoutWeeks } from '../layout'
import { enrichDay } from '../plan'
import { buildCalendar } from '../calendar'

const ftp = parseProgram(ftpJson)
const alps = parseProgram(alpsJson)
const base = { deficitWeeksLeft: 29, maxKcalPerDay: 500, maxLossPctPerWeek: 0.7, sharesPerWeek: 3.63, share: 1 }

describe('deficyt dobierany z masy (weight_based), rozłożony proporcjonalnie', () => {
  it('brakujące kilogramy na tygodnie z deficytem, pula tygodnia na dni wg udziału', () => {
    // 73 → 67 kg w 29 tygodni faz z deficytem: ~0,21 kg/tydz. = ~1590 kcal na tydzień, ~440 kcal na pełny udział
    const light = weightBasedDeficit({ ...base, currentKg: 73, targetKg: 67 })
    const medium = weightBasedDeficit({ ...base, currentKg: 73, targetKg: 67, share: 0.5 })
    expect(light.kcal).toBe(450)
    expect(medium.kcal).toBe(200)
    expect(light.capped).toBe(false)
    expect(light.kg_per_week).toBeCloseTo(0.21, 2)
  })
  it('dzień bez udziału (akcent, długa) – zero', () => {
    expect(weightBasedDeficit({ ...base, currentKg: 73, targetKg: 67, share: 0 }).kcal).toBe(0)
  })
  it('limit dzienny i limit tempa obcinają i mówią o tym', () => {
    const d = weightBasedDeficit({ ...base, currentKg: 80, targetKg: 67, deficitWeeksLeft: 4, maxKcalPerDay: 5000 })
    expect(d.kg_per_week).toBeLessThanOrEqual(0.56 + 0.01)
    expect(d.capped).toBe(true)
    expect(weightBasedDeficit({ ...base, currentKg: 73, targetKg: 67, deficitWeeksLeft: 10 })).toMatchObject({ kcal: 500, capped: true })
  })
  it('na masie docelowej albo poniżej – bilans zerowy z wyjaśnieniem', () => {
    expect(weightBasedDeficit({ ...base, currentKg: 67, targetKg: 67 }).kcal).toBe(0)
    const n = personalizeNutrition({ energy: 'deficit_300', label: 'Dzień lekki: x', protein_g_per_kg: 1.8, on_bike_carbs_g_per_h: [0, 0], deficit_share: 1 }, ftp.nutrition, { currentKg: 66.5, targetKg: 67, deficitWeeksLeft: 20 })
    expect(n.energy).toBe('maintenance')
    expect(n.label).toBe('Dzień lekki: bilans zerowy – masa docelowa osiągnięta')
  })
  it('plan Ferdynanda: deficyt w dni lekkie i spokojne, akcenty i długa bez deficytu; znika po osiągnięciu celu', () => {
    const ctx = { program: ftp, settings: ftp.default_settings, current_weight_kg: 73 }
    const days = buildCalendar(ctx)
    const at = (date: string, c = ctx) => enrichDay(days.find((d) => d.date === date)!, c).nutrition
    expect(at('2026-09-29').label).toMatch(/^Dzień lekki: deficyt ok\. \d+ kcal .*do 67 kg/) // wtorek wolny
    expect(at('2026-10-01').label).toMatch(/^Dzień treningowy: deficyt ok\. \d+ kcal/) // czwartek Z2 60
    expect(at('2026-09-30').energy).toBe('maintenance') // środa akcent
    expect(at('2026-09-28').energy).toBe('maintenance') // poniedziałek długa
    const reached = { ...ctx, current_weight_kg: 67 }
    expect(at('2026-09-29', reached)).toMatchObject({ energy: 'maintenance', label: 'Dzień lekki: bilans zerowy – masa docelowa osiągnięta' })
  })
  it('liczba tygodni z deficytem pomija fazy bez deficytu (VO2max, szczyt, taper)', () => {
    const weeks = layoutWeeks(ftp, ftp.default_settings)
    expect(deficitWeeksLeft(weeks, ftp.nutrition, '2026-09-28', '2027-06-28')).toBe(29)
  })
  it('program alpejski bez weight_based – etykiety bez zmian', () => {
    expect(alps.nutrition.weight_based).toBeUndefined()
    const n = { energy: 'deficit_500' as const, label: 'Dzień lekki: deficyt ok. 500 kcal', protein_g_per_kg: 1.8, on_bike_carbs_g_per_h: [0, 0] as [number, number] }
    expect(personalizeNutrition(n, alps.nutrition, { currentKg: 107, targetKg: 90, deficitWeeksLeft: 30 })).toBe(n)
  })
})
