import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { getDayPlan } from '../plan'
import { buildCalendar } from '../calendar'
import { compliance, e1rmSeries, effectiveLthr, targetWeightAt, tonnage, weeklyVolume, weightSeries, weightTrend } from '../progress'

const program = parseProgram(programJson)
const settings = program.default_settings

describe('R11 – skuteczne LTHR', () => {
  it('test obowiązuje od następnego dnia; wcześniej wartość ręczna', () => {
    const tests = [{ date: '2026-09-16', lthr_bpm: 158 }, { date: '2026-10-28', lthr_bpm: 162 }]
    expect(effectiveLthr('2026-09-16', 150, tests)).toMatchObject({ lthr: 150, source: 'manual' })
    expect(effectiveLthr('2026-09-17', 150, tests)).toMatchObject({ lthr: 158, source: 'test', test_date: '2026-09-16' })
    expect(effectiveLthr('2026-11-01', null, tests)).toMatchObject({ lthr: 162 })
    expect(effectiveLthr('2026-09-10', null, tests)).toMatchObject({ lthr: null, source: null })
  })
  it('getDayPlan używa LTHR z testu', () => {
    const ctx = { program, settings, tests: [{ date: '2026-09-16', lthr_bpm: 160 }] }
    const before = getDayPlan('2026-09-15', ctx)!
    expect(before.lthr).toBeNull()
    const after = getDayPlan('2026-09-23', ctx)!
    expect(after.lthr).toBe(160)
    expect(after.lthr_source).toBe('test')
    expect(after.workout!.steps.find((s) => s.zone === 'SS')!.bpm).toEqual([147, 154])
  })
})

describe('masa', () => {
  it('linia celu 0,45 kg/tydz. do 90 kg', () => {
    expect(targetWeightAt('2026-09-14', '2026-09-14', 105, 90)).toBe(105)
    expect(targetWeightAt('2026-09-28', '2026-09-14', 105, 90)).toBeCloseTo(104.1)
    expect(targetWeightAt('2028-01-01', '2026-09-14', 105, 90)).toBe(90)
  })
  it('średnia 7-dniowa od 3 pomiarów, trend i ostrzeżenie R10', () => {
    const pts = Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(14 + i).padStart(2, '0')}`, weight_kg: 105 - i * 0.25 }))
    const s = weightSeries(pts, '2026-09-14', 105, 90)
    expect(s[0]!.avg7).toBeNull()
    expect(s[2]!.avg7).toBeCloseTo(104.75)
    expect(s.at(-1)!.avg7).toBeCloseTo(102.5)
    const t = weightTrend(pts)!
    expect(t.kg_per_week).toBeCloseTo(-1.75)
    expect(t.warning).toContain('R10')
    expect(weightTrend(pts.slice(0, 3))).toBeNull()
  })
})

describe('siła', () => {
  it('e1RM z najlepszej serii, tonaż', () => {
    const sets = [{ weight_kg: 20, reps: 8, is_warmup: true }, { weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 7 }]
    const series = e1rmSeries([{ date: '2026-10-07', exercise_id: 'back_squat', sets }])
    expect(series[0]!.e1rm).toBeCloseTo(101.33, 1)
    expect(series[0]!.best_set).toEqual({ weight_kg: 80, reps: 8 })
    expect(tonnage(sets)).toBe(1200)
  })
})

describe('objętość', () => {
  it('plan vs wykonanie per tydzień i zgodność', () => {
    const days = buildCalendar({ program, settings })
    const rides = [
      { date: '2026-09-15', status: 'done' as const, duration_min: 65 },
      { date: '2026-09-16', status: 'done' as const, duration_min: null },
      { date: '2026-09-19', status: 'skipped' as const, duration_min: null },
    ]
    const v = weeklyVolume(days, rides, '2026-09-20', 2)
    expect(v).toHaveLength(2)
    const w1 = v[1]!
    expect(w1.week).toBe(1)
    expect(w1.planned_min).toBe(375)
    expect(w1.done_min).toBe(125)
    expect(w1.done_sessions).toBe(2)
    expect(w1.compliance_pct).toBe(33)
    expect(compliance(v, 1)).toBe(33)
    expect(compliance([], 4)).toBeNull()
  })
})
