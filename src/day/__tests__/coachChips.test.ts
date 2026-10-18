import { describe, expect, it } from 'vitest'
import { coachChips } from '../coachChips'

describe('coachChips', () => {
  it('rano: waga z ostatnią wartością jako początek wiadomości', () => {
    const c = coachChips({ phase: 'morning', lastWeightKg: 104.8, rideName: 'Z2', tomorrowRide: null })
    expect(c[0]).toEqual({ label: 'Waga 104,8…', prefill: 'Waga 104,8, tętno ' })
    expect(coachChips({ phase: 'morning', lastWeightKg: null, rideName: null, tomorrowRide: null })[0]!.prefill).toBe('Waga ')
  })
  it('po jeździe: RPE do dokończenia; wieczorem pytanie o jutro z nazwą jazdy', () => {
    expect(coachChips({ phase: 'after', lastWeightKg: null, rideName: null, tomorrowRide: null })[0]).toEqual({ label: 'RPE…', prefill: 'RPE ' })
    expect(coachChips({ phase: 'evening', lastWeightKg: null, rideName: null, tomorrowRide: 'Długa jazda' })[0]!.send).toMatch(/Długa jazda/)
    expect(coachChips({ phase: 'evening', lastWeightKg: null, rideName: null, tomorrowRide: null })[0]!.label).toBe('Co w tym tygodniu?')
  })
  it('każdy stan ma 3–4 podpowiedzi, każda z prefill albo send', () => {
    for (const phase of ['morning', 'brief', 'riding', 'after', 'evening', 'rest', 'skipped', 'missed', 'future'] as const) {
      const c = coachChips({ phase, lastWeightKg: 100, rideName: 'X', tomorrowRide: 'Y' })
      expect(c.length).toBeGreaterThanOrEqual(3)
      expect(c.length).toBeLessThanOrEqual(4)
      for (const x of c) expect(!!x.prefill || !!x.send).toBe(true)
    }
  })
})
