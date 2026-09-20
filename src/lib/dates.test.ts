import { describe, expect, it } from 'vitest'
import { addMonths, fmtDate, fmtMonth, fmtRange, fmtShort, localTimeISO, monthEnd, monthStart } from './dates'

describe('daty w strefie Europe/Warsaw', () => {
  it('start treningu 6:00 lokalnie – zimą i latem', () => {
    expect(localTimeISO('2027-01-13')).toBe('2027-01-13T05:00:00.000Z') // CET (+1)
    expect(localTimeISO('2027-05-15')).toBe('2027-05-15T04:00:00.000Z') // CEST (+2)
    expect(localTimeISO('2027-03-28', 6)).toBe('2027-03-28T04:00:00.000Z') // dzień zmiany czasu
  })
  it('formaty po polsku', () => {
    expect(fmtDate('2026-09-16')).toBe('16.09.2026')
    expect(fmtShort('2026-09-16')).toMatch(/śr/)
    expect(fmtRange('2026-09-14', '2026-09-20')).toBe('14.09–20.09')
  })
  it('miesiące kalendarza', () => {
    expect(fmtMonth('2026-09-16')).toBe('wrzesień 2026')
    expect(monthStart('2026-09-16')).toBe('2026-09-01')
    expect(monthEnd('2027-02-10')).toBe('2027-02-28')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(addMonths('2026-09-16', 3)).toBe('2026-12-01')
  })
})
