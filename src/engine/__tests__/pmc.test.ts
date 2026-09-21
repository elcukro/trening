import { describe, expect, it } from 'vitest'
import { plannedTss, pmcSeries, rampRate, weekTss, zoneTssPerHour } from '../pmc'
import { buildCalendar } from '../calendar'
import { loadProgram } from '@/data/program'

const program = loadProgram()
const ctx = { program, settings: program.default_settings }
const days = buildCalendar(ctx)

describe('plannedTss', () => {
  it('Z2 ≈ 43 TSS/h, sweet spot więcej, dzień wolny 0', () => {
    expect(zoneTssPerHour('Z2', program.power_zones_ftp_fraction)).toBe(43)
    expect(zoneTssPerHour('SS', program.power_zones_ftp_fraction)).toBeGreaterThan(80)
    const z2 = days.find((d) => d.bike?.workout_id === 'Z2' && d.bike.duration_min === 90)!
    const t = plannedTss(z2, program)
    expect(t).toBeGreaterThan(55)
    expect(t).toBeLessThan(75)
    const ss = days.find((d) => d.bike?.workout_id === 'SS_2x12')!
    expect(plannedTss(ss, program)).toBeGreaterThan(t * 0.6)
    expect(plannedTss(days.find((d) => !d.bike)!, program)).toBe(0)
  })
})

describe('pmcSeries', () => {
  it('przeszłość z faktycznego TSS, przyszłość z planu; CTL rośnie wolniej niż ATL', () => {
    const actual = new Map([
      ['2026-09-22', 60],
      ['2026-09-24', 80],
    ])
    const s = pmcSeries({ days, program, actual, today: '2026-09-25', from: '2026-09-21', to: '2026-10-05' })
    expect(s.length).toBe(15)
    expect(s[1]!.load).toBe(60)
    expect(s[1]!.actual).toBe(60)
    expect(s[2]!.load).toBe(0) // dzień bez jazdy w przeszłości
    const future = s.find((p) => p.date === '2026-10-01')!
    expect(future.future).toBe(true)
    expect(future.actual).toBeNull()
    expect(future.load).toBe(future.planned)
    expect(future.planned).toBeGreaterThan(0) // czwartek – sweet spot
    expect(s[3]!.atl).toBeGreaterThan(s[3]!.ctl)
    expect(s[0]!.tsb).toBe(0)
    expect(s[2]!.tsb).toBeLessThan(0)
  })
  it('seed i rampRate', () => {
    const actual = new Map<string, number>()
    for (let i = 0; i < 14; i++) actual.set(`2026-09-${String(8 + i).padStart(2, '0')}`, 120)
    const s = pmcSeries({ days, program, actual, today: '2026-09-21', from: '2026-09-08', to: '2026-09-21', seed: { ctl: 20, atl: 20 } })
    expect(s[0]!.ctl).toBeGreaterThan(20)
    const r = rampRate(s, '2026-09-21')!
    expect(r.per_week).toBeGreaterThan(RAMP)
    expect(r.warning).toContain('R7')
    expect(rampRate(s, '2026-09-10')).toBeNull()
  })
})
const RAMP = 7

describe('weekTss', () => {
  it('plan tygodnia vs wykonanie do dziś', () => {
    const w = weekTss(days, program, new Map([['2026-09-29', 50]]), '2026-10-01', '2026-09-30')
    expect(w.monday).toBe('2026-09-28')
    expect(w.planned).toBeGreaterThan(100)
    expect(w.done).toBe(50)
  })
})
