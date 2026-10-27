import { describe, expect, it } from 'vitest'
import { dayFlow, dayPhase, formLabel, goalProgress, rideVerdict, weighDue, type DayFlowInput, type DayPhaseInput } from '../dayState'

const BASE: DayFlowInput = {
  date: '2026-09-23',
  today: '2026-09-23',
  ride: { name: 'Baza tlenowa Z2', minutes: 60, pushable: true },
  checkedIn: false,
  boltReady: false,
  rideLog: 'none',
  hasActivity: false,
}

describe('dayFlow', () => {
  it('dzień z jazdą: cztery kroki, pierwszy niezrobiony to check-in', () => {
    const f = dayFlow(BASE)
    expect(f.steps.map((s) => s.key)).toEqual(['checkin', 'bolt', 'train', 'log'])
    expect(f.next?.key).toBe('checkin')
    expect(f.progress).toEqual({ done: 0, total: 4 })
  })

  it('po check-inie i wysyłce na Bolta następny krok to trening', () => {
    const f = dayFlow({ ...BASE, checkedIn: true, boltReady: true })
    expect(f.next?.key).toBe('train')
    expect(f.progress.done).toBe(2)
  })

  it('jazda ze Stravy zalicza trening, ale nie podsumowanie', () => {
    const f = dayFlow({ ...BASE, checkedIn: true, boltReady: true, hasActivity: true })
    expect(f.steps.find((s) => s.key === 'train')?.done).toBe(true)
    expect(f.next?.key).toBe('log')
  })

  it('po zapisaniu wyniku nie ma już nic do zrobienia', () => {
    const f = dayFlow({ ...BASE, checkedIn: true, boltReady: true, hasActivity: true, rideLog: 'done' })
    expect(f.next).toBeNull()
    expect(f.progress).toEqual({ done: 4, total: 4 })
  })

  it('dzień wolny ma tylko check-in', () => {
    const f = dayFlow({ ...BASE, ride: null })
    expect(f.steps.map((s) => s.key)).toEqual(['checkin'])
  })

  it('trening bez wysyłki na Bolta (test, wyjazd) pomija krok licznika', () => {
    const f = dayFlow({ ...BASE, ride: { name: 'Wyjazd', minutes: 300, pushable: false } })
    expect(f.steps.map((s) => s.key)).toEqual(['checkin', 'train', 'log'])
  })

  it('dzień bez jazdy: tylko check-in, bez kroku treningu', () => {
    const f = dayFlow({ ...BASE, ride: null })
    expect(f.steps.map((s) => s.key)).toEqual(['checkin'])
    expect(f.next?.key).toBe('checkin')
  })

  it('przeszłość: nie proponuje wysyłki na Bolta, przyszłość: nic nie jest do zrobienia', () => {
    const past = dayFlow({ ...BASE, date: '2026-09-20' })
    expect(past.past).toBe(true)
    expect(past.next?.key).toBe('checkin')
    expect(past.steps.find((s) => s.key === 'bolt')?.actionable).toBe(false)
    const future = dayFlow({ ...BASE, date: '2026-09-26' })
    expect(future.future).toBe(true)
    expect(future.next?.key).toBe('bolt') // plan na przyszły dzień można wysłać już dziś
  })
})

describe('weighDue', () => {
  it('co drugi dzień', () => {
    expect(weighDue(null, '2026-09-23')).toBe(true)
    expect(weighDue('2026-09-23', '2026-09-23')).toBe(false)
    expect(weighDue('2026-09-22', '2026-09-23')).toBe(false)
    expect(weighDue('2026-09-21', '2026-09-23')).toBe(true)
  })
})

describe('formLabel / rideVerdict / goalProgress', () => {
  it('forma po ludzku', () => {
    expect(formLabel(null)).toBeNull()
    expect(formLabel(25)?.text).toBe('Wypoczęty')
    expect(formLabel(8)?.text).toBe('Świeży')
    expect(formLabel(-5)?.text).toBe('W formie')
    expect(formLabel(-20)?.text).toBe('Zmęczony')
    expect(formLabel(-40)?.tone).toBe('warn')
  })
  it('ocena zgodności', () => {
    expect(rideVerdict(null)).toBeNull()
    expect(rideVerdict(90)?.tone).toBe('good')
    expect(rideVerdict(75)?.tone).toBe('ok')
    expect(rideVerdict(50)?.tone).toBe('warn')
    expect(rideVerdict(10)?.text).toBe('Inny trening niż zaplanowany')
  })
  it('postęp do celu', () => {
    expect(goalProgress(null, 240)).toBeNull()
    expect(goalProgress(200, 240)).toEqual({ pct: 83, missing: 40 })
    expect(goalProgress(260, 240)).toEqual({ pct: 100, missing: 0 })
  })
})

describe('dayPhase (karta stanu dnia w /m)', () => {
  const P: DayPhaseInput = { ...BASE, hour: 8, startHour: 18, hasRpe: false }
  it('dzień z jazdą: rano → odprawa → w trakcie → po jeździe → wieczór', () => {
    expect(dayPhase(P)).toBe('morning')
    expect(dayPhase({ ...P, checkedIn: true })).toBe('brief')
    expect(dayPhase({ ...P, checkedIn: true, hour: 18 })).toBe('riding')
    expect(dayPhase({ ...P, checkedIn: true, hour: 19, hasActivity: true })).toBe('after')
    expect(dayPhase({ ...P, checkedIn: true, hour: 19, hasActivity: true, hasRpe: true })).toBe('evening')
    expect(dayPhase({ ...P, checkedIn: true, hour: 21, hasActivity: true })).toBe('evening')
    expect(dayPhase({ ...P, checkedIn: true, hour: 21 })).toBe('evening')
  })
  it('jazda bez check-inu wygrywa z porankiem; pominięte i przeszłość', () => {
    expect(dayPhase({ ...P, hasActivity: true, hour: 12 })).toBe('after')
    expect(dayPhase({ ...P, rideLog: 'skipped' })).toBe('skipped')
    expect(dayPhase({ ...P, date: '2026-09-20' })).toBe('missed')
    expect(dayPhase({ ...P, date: '2026-09-20', hasActivity: true })).toBe('after')
    expect(dayPhase({ ...P, date: '2026-09-20', rideLog: 'done' })).toBe('after')
    expect(dayPhase({ ...P, date: '2026-09-30' })).toBe('future')
  })
  it('dzień wolny: check-in, potem odpoczynek', () => {
    expect(dayPhase({ ...P, ride: null })).toBe('morning')
    expect(dayPhase({ ...P, ride: null, checkedIn: true })).toBe('rest')
    expect(dayPhase({ ...P, ride: null, date: '2026-09-20' })).toBe('rest')
    expect(dayPhase({ ...P, ride: null, checkedIn: true, rideLog: 'skipped' })).toBe('rest')
  })
  it('dzień wolny z jazdą: dodatkowa jazda jak po treningu, nie „odpoczynek” (docs/35 W3)', () => {
    expect(dayPhase({ ...P, ride: null, hasActivity: true })).toBe('after')
    expect(dayPhase({ ...P, ride: null, checkedIn: true, hasActivity: true, hasRpe: true })).toBe('evening')
    expect(dayPhase({ ...P, ride: null, hasActivity: true, hour: 21 })).toBe('evening')
    expect(dayPhase({ ...P, ride: null, date: '2026-09-20', hasActivity: true })).toBe('after')
  })
})
