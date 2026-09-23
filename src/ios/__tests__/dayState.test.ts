import { describe, expect, it } from 'vitest'
import { dayFlow, formLabel, goalProgress, rideVerdict, weighDue, type DayFlowInput } from '../dayState'

const BASE: DayFlowInput = {
  date: '2026-09-23',
  today: '2026-09-23',
  ride: { name: 'Baza tlenowa Z2', minutes: 60, pushable: true },
  gym: null,
  checkedIn: false,
  boltReady: false,
  rideLog: 'none',
  gymLog: 'none',
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

  it('dzień siłowni prowadzi przez sesję, a status bierze z logu siłowni', () => {
    const f = dayFlow({ ...BASE, ride: null, gym: { name: 'Sesja A' }, gymLog: 'done' })
    expect(f.steps.map((s) => s.key)).toEqual(['checkin', 'train', 'log'])
    expect(f.steps.find((s) => s.key === 'train')?.title).toBe('Sesja A')
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
