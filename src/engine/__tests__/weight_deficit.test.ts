import { describe, expect, it } from 'vitest'
import ftpJson from '../../../data/program-ftp300.json'
import alpsJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { personalizeNutrition, weightBasedDeficit } from '../nutrition'
import { enrichDay } from '../plan'
import { buildCalendar } from '../calendar'

const ftp = parseProgram(ftpJson)
const alps = parseProgram(alpsJson)
const base = { date: '2026-09-29', goalDate: '2027-06-28', maxKcalPerDay: 500, maxLossPctPerWeek: 0.7, deficitDaysPerWeek: 2 }

describe('deficyt dobierany z masy (weight_based)', () => {
  it('brakujące kilogramy rozłożone do daty celu, z limitem dziennym', () => {
    // 73 → 67 kg w ~39 tygodni: potrzeba ~0,15 kg/tydz. = ~590 kcal w każdy z 2 dni → limit 500
    const d = weightBasedDeficit({ ...base, currentKg: 73, targetKg: 67 })
    expect(d.kcal).toBe(500)
    expect(d.capped).toBe(true)
    expect(d.kg_per_week).toBeCloseTo(0.13, 2)
  })
  it('mały brak → mniejszy deficyt, bez obcinania', () => {
    const d = weightBasedDeficit({ ...base, currentKg: 69, targetKg: 67 })
    expect(d.kcal).toBe(200)
    expect(d.capped).toBe(false)
  })
  it('limit tempa: przy krótkim terminie nie więcej niż 0,7 % masy na tydzień', () => {
    const d = weightBasedDeficit({ ...base, currentKg: 80, targetKg: 67, goalDate: '2026-10-27', maxKcalPerDay: 5000 })
    expect(d.kg_per_week).toBeLessThanOrEqual(0.56 + 0.01)
  })
  it('na masie docelowej albo poniżej – bilans zerowy', () => {
    expect(weightBasedDeficit({ ...base, currentKg: 67, targetKg: 67 }).kcal).toBe(0)
    const n = personalizeNutrition({ energy: 'deficit_300', label: 'x', protein_g_per_kg: 1.8, on_bike_carbs_g_per_h: [0, 0] }, ftp.nutrition, { currentKg: 66.5, targetKg: 67, date: base.date, goalDate: base.goalDate })
    expect(n.energy).toBe('maintenance')
  })
  it('plan dnia Ferdynanda liczy deficyt z jego masy, a dni treningowe zostają bez deficytu', () => {
    const ctx = { program: ftp, settings: ftp.default_settings, current_weight_kg: 73 }
    const days = buildCalendar(ctx)
    const rest = enrichDay(days.find((d) => d.date === '2026-09-29')!, ctx) // wtorek wolny
    expect(rest.nutrition.label).toMatch(/deficyt ok\. \d+ kcal .*do 67 kg/)
    const long = enrichDay(days.find((d) => d.date === '2026-09-28')!, ctx) // poniedziałek długa
    expect(long.nutrition.energy).toBe('maintenance')
  })
  it('program alpejski bez weight_based – etykiety bez zmian', () => {
    expect(alps.nutrition.weight_based).toBeUndefined()
    const n = { energy: 'deficit_500' as const, label: 'Dzień lekki: deficyt ok. 500 kcal', protein_g_per_kg: 1.8, on_bike_carbs_g_per_h: [0, 0] as [number, number] }
    expect(personalizeNutrition(n, alps.nutrition, { currentKg: 107, targetKg: 90, date: base.date, goalDate: '2027-09-11' })).toBe(n)
  })
})
