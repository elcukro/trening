import { describe, expect, it } from 'vitest'
import { fmtDate, fmtRange, fmtShort, localTimeISO } from './dates'

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
})
