import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { buildCalendar } from '../calendar'
import { addDays, diffDays } from '../dates'
import { hrvAlarm, hrvStatus, type ReadinessCheckin } from '../readiness'
import { warningsFor } from '../rules'

const day = '2026-10-27'
/** 14 dni normy (HRV 44–48) przed `day`, potem wartości z `tail` na kolejne dni kończące się na `day`. */
function history(tail: number[]): ReadinessCheckin[] {
  const out: ReadinessCheckin[] = []
  for (let i = 14 + tail.length - 1; i >= tail.length; i--) out.push({ date: addDays(day, -i), hrv_ms: 44 + (i % 3) * 2 })
  tail.forEach((v, i) => out.push({ date: addDays(day, -(tail.length - 1 - i)), hrv_ms: v }))
  return out
}

describe('hrvStatus', () => {
  it('wartość dnia na tle średniej z 28 dni', () => {
    const s = hrvStatus(history([45]), day)!
    expect(s.value).toBe(45)
    expect(s.baseline).toBeGreaterThan(44)
    expect(s.baseline).toBeLessThan(48)
    expect(s.low).toBe(false)
    expect(hrvStatus(history([30]), day)!.low).toBe(true)
  })
  it('bez pomiaru dnia albo z krótką historią – brak oceny', () => {
    expect(hrvStatus([{ date: day, hrv_ms: null }], day)).toBeNull()
    const short = Array.from({ length: 5 }, (_, i) => ({ date: addDays(day, -i - 1), hrv_ms: 45 })).concat({ date: day, hrv_ms: 30 })
    expect(hrvStatus(short, day)).toBeNull()
  })
  it('stała norma (SD 0): spadek o mniej niż 1 ms to jeszcze nie sygnał', () => {
    const flat = Array.from({ length: 10 }, (_, i) => ({ date: addDays(day, -i - 1), hrv_ms: 45 }))
    expect(hrvStatus([...flat, { date: day, hrv_ms: 44.5 }], day)!.low).toBe(false)
    expect(hrvStatus([...flat, { date: day, hrv_ms: 43 }], day)!.low).toBe(true)
  })
})

describe('hrvAlarm', () => {
  it('dwa dni z rzędu poniżej normy – alarm; jeden dzień – nie', () => {
    expect(hrvAlarm(history([31, 30]), day)).toBe(true)
    expect(hrvAlarm(history([46, 30]), day)).toBe(false)
    expect(hrvAlarm(history([30, 46]), day)).toBe(false)
  })
})

describe('R6 z HRV', () => {
  it('niskie HRV dwa dni z rzędu daje ostrzeżenie R6 z powodem „HRV”; norma – brak ostrzeżenia', () => {
    const program = parseProgram(programJson)
    const all = buildCalendar({ program, settings: program.default_settings })
    const target = all.find((d) => d.bike && d.date >= '2027-01-01')!
    const window = all.filter((d) => d.date >= addDays(target.date, -3) && d.date <= addDays(target.date, 4))
    const shifted = (tail: number[]) => history(tail).map((c) => ({ ...c, date: addDays(c.date, diffDays(target.date, day)) }))
    const r6 = (tail: number[]) => warningsFor(target.date, window, { program, logs: [], checkins: shifted(tail), today: target.date }).find((x) => x.rule === 'R6')
    expect(r6([31, 30])?.message).toMatch(/HRV/)
    expect(r6([46, 45])).toBeUndefined()
  })
})
