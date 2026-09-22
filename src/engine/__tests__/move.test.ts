import { describe, expect, it } from 'vitest'
import { validateMove } from '../rules'
import { buildCalendar } from '../calendar'
import { loadProgram } from '@/data/program'

const program = loadProgram()
const days = buildCalendar({ program, settings: program.default_settings })
const win = days.filter((d) => d.date >= '2026-09-28' && d.date <= '2026-11-08')

describe('validateMove', () => {
  it('akcent z czwartku na wolny poniedziałek tego samego miesiąca', () => {
    // 1.10 czw = sweet spot (akcent), 5.10 pn = wolne
    expect(validateMove('2026-10-01', '2026-10-05', win, { today: '2026-09-29' })).toEqual({ ok: true, warning: undefined })
  })
  it('blokuje: inny miesiąc, dzień zajęty, przeszłość, brak jazdy', () => {
    expect(validateMove('2026-10-01', '2026-11-02', win).reason).toMatch(/miesiąca/)
    // 3.10 sobota ma długą jazdę
    expect(validateMove('2026-10-01', '2026-10-03', win).reason).toMatch(/dzień wolny/)
    // 30.09 środa ma siłownię (Sesja A) – też nie jest „Wolne”
    expect(validateMove('2026-10-01', '2026-09-30', win).reason).toMatch(/miesiąca|dzień wolny/)
    expect(validateMove('2026-10-05', '2026-10-12', win).reason).toMatch(/nie ma jazdy/)
    expect(validateMove('2026-10-01', '2026-10-05', win, { today: '2026-10-08' }).reason).toMatch(/przeszłość/)
  })
  it('ostrzega przy jednostce z przeszłości, ale nie blokuje', () => {
    const r = validateMove('2026-10-01', '2026-10-05', win, { today: '2026-10-03' })
    expect(r.ok).toBe(true)
    expect(r.warning).toMatch(/R2/)
  })
  it('blokuje dwa akcenty dzień po dniu', () => {
    // w oknie testowym robimy z wolnego poniedziałku 5.10 akcent – wtedy przeniesienie na niedzielę 4.10 daje dwa pod rząd
    const fake = win.map((d) => (d.date === '2026-10-05' ? { ...d, day_type: 'key' as const, bike: { workout_id: 'SS_2x12', name: 'Sweet spot', duration_min: 60, bike: 'Dogma', fallback_workout_id: null } } : d))
    expect(validateMove('2026-10-01', '2026-10-04', fake).reason).toMatch(/dwa akcenty/)
  })
})
