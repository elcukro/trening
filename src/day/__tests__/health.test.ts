import { describe, expect, it } from 'vitest'
import type { Checkin } from '@/db'
import { fromHealth, healthLine, healthPatch, isCheckedIn, sleepLabel, sourcesAfterManual } from '../health'

const base = (over: Partial<Checkin> = {}): Checkin => ({ id: 'c1', date: '2026-10-27', updated_at: '', weight_kg: null, resting_hr: null, sleep: null, legs: null, motivation: null, sick: false, ...over })

describe('healthPatch', () => {
  it('pusty dzień: wszystkie pola ze Zdrowia z zaokrągleniem i źródłem', () => {
    const p = healthPatch(undefined, { weight_kg: 103.46, resting_hr: 52.4, hrv_ms: 41.6, sleep_min: 431.2 })
    expect(p).toEqual({ weight_kg: 103.5, resting_hr: 52, hrv_ms: 42, sleep_min: 431, field_sources: { weight_kg: 'health', resting_hr: 'health', hrv_ms: 'health', sleep_min: 'health' } })
  })
  it('wpis ręczny wygrywa – Zdrowie uzupełnia tylko puste pola', () => {
    const p = healthPatch(base({ weight_kg: 104 }), { weight_kg: 103.4, hrv_ms: 40 })
    expect(p).toEqual({ hrv_ms: 40, field_sources: { hrv_ms: 'health' } })
  })
  it('pole ze Zdrowia aktualizuje się nowszym pomiarem; bez zmian = null (bez zapisu)', () => {
    const c = base({ weight_kg: 103.4, field_sources: { weight_kg: 'health' } })
    expect(healthPatch(c, { weight_kg: 103.1 })).toEqual({ weight_kg: 103.1, field_sources: { weight_kg: 'health' } })
    expect(healthPatch(c, { weight_kg: 103.4 })).toBeNull()
    expect(healthPatch(c, {})).toBeNull()
  })
  it('wartości zerowe i brak danych są pomijane', () => {
    expect(healthPatch(undefined, { weight_kg: 0, resting_hr: null, sleep_min: Number.NaN })).toBeNull()
  })
})

describe('sourcesAfterManual', () => {
  it('ręczna zmiana pola zdejmuje źródło; to samo pole bez zmiany je zostawia', () => {
    const c = base({ weight_kg: 103.4, hrv_ms: 40, field_sources: { weight_kg: 'health', hrv_ms: 'health' } })
    expect(sourcesAfterManual(c, { weight_kg: 102.9 })).toEqual({ hrv_ms: 'health' })
    expect(sourcesAfterManual(c, { weight_kg: 103.4, legs: 4 })).toEqual({ weight_kg: 'health', hrv_ms: 'health' })
    expect(sourcesAfterManual(base({ weight_kg: 103, field_sources: { weight_kg: 'health' } }), { weight_kg: 101 })).toBeNull()
  })
})

describe('isCheckedIn', () => {
  it('same dane ze Zdrowia nie zaliczają check-inu; ocena albo waga wpisana ręcznie – tak', () => {
    expect(isCheckedIn(undefined)).toBe(false)
    expect(isCheckedIn(base({ weight_kg: 103.4, hrv_ms: 40, field_sources: { weight_kg: 'health', hrv_ms: 'health' } }))).toBe(false)
    expect(isCheckedIn(base({ weight_kg: 103.4 }))).toBe(true)
    expect(isCheckedIn(base({ legs: 3, field_sources: { weight_kg: 'health' }, weight_kg: 103 }))).toBe(true)
    expect(isCheckedIn(base({ motivation: 4 }))).toBe(true)
  })
  it('fromHealth i sleepLabel', () => {
    expect(fromHealth(base({ hrv_ms: 40, field_sources: { hrv_ms: 'health' } }), 'hrv_ms')).toBe(true)
    expect(fromHealth(base({ hrv_ms: null, field_sources: { hrv_ms: 'health' } }), 'hrv_ms')).toBe(false)
    expect(sleepLabel(425)).toBe('7 h 05')
  })
})

describe('healthLine', () => {
  it('linia z danymi ze Zdrowia, z przecinkiem dziesiętnym; filtr pól', () => {
    expect(healthLine({ weight_kg: 103.4, resting_hr: 52, hrv_ms: 41.6, sleep_min: 425 })).toBe('waga 103,4 kg · tętno 52 · HRV 42 ms · sen 7 h 05')
    expect(healthLine({ hrv_ms: 40 }, (f) => f !== 'hrv_ms')).toBe('')
    expect(healthLine(null)).toBe('')
  })
})
