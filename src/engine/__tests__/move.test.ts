import { describe, expect, it } from 'vitest'
import { validateMove } from '../rules'
import { buildCalendar } from '../calendar'
import { loadProgram } from '@/data/program'

const program = loadProgram()
const days = buildCalendar({ program, settings: program.default_settings })
const win = days.filter((d) => d.date >= '2026-09-28' && d.date <= '2026-11-30')

describe('validateMove', () => {
  it('akcent ze środy na wolny czwartek tego samego miesiąca', () => {
    // 7.10 śr = sweet spot (akcent), 8.10 czw = wolne
    expect(validateMove('2026-10-07', '2026-10-08', win, { today: '2026-10-05' })).toEqual({ ok: true, warning: undefined })
  })
  it('blokuje: inny miesiąc, dzień zajęty, przeszłość, brak jazdy', () => {
    expect(validateMove('2026-10-07', '2026-11-05', win).reason).toMatch(/miesiąca/)
    // 9.10 piątek ma Z2
    expect(validateMove('2026-10-07', '2026-10-09', win).reason).toMatch(/dzień wolny/)
    expect(validateMove('2026-10-05', '2026-10-08', win).reason).toMatch(/nie ma jazdy/)
    expect(validateMove('2026-10-07', '2026-10-08', win, { today: '2026-10-12' }).reason).toMatch(/przeszłość/)
  })
  it('ostrzega przy jednostce z przeszłości, ale nie blokuje', () => {
    const r = validateMove('2026-10-07', '2026-10-08', win, { today: '2026-10-08' })
    expect(r.ok).toBe(true)
    expect(r.warning).toMatch(/R2/)
  })
  it('blokuje dwa akcenty dzień po dniu', () => {
    // w tygodniu rozładowania 22.10 (czw) i 23.10 (pt) są wolne – robimy z piątku akcent i celujemy w czwartek
    const fake = win.map((d) => (d.date === '2026-10-23' ? { ...d, day_type: 'key' as const, bike: { workout_id: 'SS_2x12', name: 'Sweet spot', duration_min: 60, bike: 'Dogma', fallback_workout_id: null } } : d))
    expect(validateMove('2026-10-28', '2026-10-22', fake).reason).toMatch(/dwa akcenty/)
  })
})
