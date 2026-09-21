import { describe, expect, it } from 'vitest'
import { adviseRide, clothingFor, fuelPlan, summarizeWindow, weatherLabel, type ClothingTable, type DayForecast } from '../weather'
import clothing from '../../../data/clothing.json'

function day(f: (h: number) => Partial<{ temp: number; feels: number; mm: number; prob: number; wind: number; gust: number; code: number }>, sunset = '2026-09-22T18:45'): DayForecast {
  return {
    date: '2026-09-22',
    sunrise: '2026-09-22T06:25',
    sunset,
    hours: Array.from({ length: 24 }, (_, h) => {
      const x = f(h)
      return { time: `2026-09-22T${String(h).padStart(2, '0')}:00`, temp_c: x.temp ?? 15, feels_c: x.feels ?? x.temp ?? 15, precip_mm: x.mm ?? 0, precip_prob: x.prob ?? 0, wind_kmh: x.wind ?? 10, gust_kmh: x.gust ?? 15, code: x.code ?? 1 }
    }),
  }
}
const table = clothing as ClothingTable

describe('summarizeWindow', () => {
  it('okno 18:00 + 90 min → godziny 18 i 19, ciemno po zachodzie', () => {
    const s = summarizeWindow(day((h) => ({ temp: h === 18 ? 16 : 14, wind: h === 19 ? 35 : 10, prob: h === 19 ? 60 : 10 })), { start_hour: 18, duration_min: 90 })!
    expect(s.from).toBe('2026-09-22T18:00')
    expect(s.to).toBe('2026-09-22T19:00')
    expect(s.temp_c).toBe(15)
    expect(s.wind_kmh).toBe(35)
    expect(s.precip_prob).toBe(60)
    expect(s.dark).toBe(true)
    expect(s.sunset).toBe('18:45')
    expect(summarizeWindow({ ...day(() => ({})), hours: [] }, { start_hour: 10, duration_min: 60 })).toBeNull()
  })
})

describe('adviseRide', () => {
  it('mróz → pod dachem; lekki mróz + sweet spot → skrócić; gołoledź; upał; wiatr; ciemno', () => {
    const frost = summarizeWindow(day(() => ({ temp: -12, feels: -14 })), { start_hour: 10, duration_min: 60 })!
    expect(adviseRide(frost)[0]).toMatchObject({ kind: 'indoor', action: 'indoor' })
    const chilly = summarizeWindow(day(() => ({ temp: -6, feels: -7 })), { start_hour: 10, duration_min: 60 })!
    expect(adviseRide(chilly, { hasSweetSpot: true })[0]!.kind).toBe('shorten_ss')
    expect(adviseRide(chilly, { hasSweetSpot: false })).toEqual([])
    const icy = summarizeWindow(day(() => ({ temp: 0, mm: 0.4, prob: 70 })), { start_hour: 10, duration_min: 60 })!
    expect(adviseRide(icy)[0]!.kind).toBe('ice')
    const hot = summarizeWindow(day(() => ({ temp: 31 })), { start_hour: 10, duration_min: 120 })!
    expect(adviseRide(hot).map((a) => a.kind)).toEqual(['heat'])
    const windy = summarizeWindow(day(() => ({ temp: 15, wind: 20, gust: 55, prob: 55 })), { start_hour: 18, duration_min: 120 })!
    expect(adviseRide(windy).map((a) => a.kind)).toEqual(['rain', 'wind', 'dark'])
  })
})

describe('clothingFor / fuelPlan / weatherLabel', () => {
  it('pas temperatury i dodatki', () => {
    const cool = summarizeWindow(day(() => ({ temp: 7, feels: 5, prob: 60 })), { start_hour: 10, duration_min: 60 })!
    const c = clothingFor(cool, table)
    expect(c.label).toBe('Chłodno')
    expect(c.items).toContain('kurtka przeciwdeszczowa')
    const hot = summarizeWindow(day(() => ({ temp: 30 })), { start_hour: 10, duration_min: 60 })!
    expect(clothingFor(hot, table).label).toBe('Upał')
  })
  it('żywienie: 2 h × 60–90 g/h, upał podnosi płyny', () => {
    const f = fuelPlan(120, [60, 90], 20)!
    expect(f.carbs_g).toEqual([120, 180])
    expect(f.fluid_ml).toEqual([1000, 1500])
    expect(f.portions).toBe(6)
    expect(fuelPlan(120, [60, 90], 30)!.fluid_ml).toEqual([1500, 2000])
    expect(fuelPlan(45, [30, 60], 15)!.portions).toBe(0)
    expect(fuelPlan(90, [0, 0], 15)!.carbs_g).toEqual([0, 0])
    expect(weatherLabel(0)).toBe('słonecznie')
    expect(weatherLabel(63)).toBe('deszcz')
  })
})
