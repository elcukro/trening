import { describe, expect, it } from 'vitest'
import { completedInRange, summaryToRow, warsawDate } from '../../../supabase/functions/_shared/wahoo_summary'

const done = {
  id: 498978425,
  name: 'Baza tlenowa Z2',
  starts: '2026-09-20T16:02:10.000Z',
  workout_summary: { duration_active_accum: '3612.0', duration_total_accum: 3900, distance_accum: '24120.5', ascent_accum: 88, heart_rate_avg: '141.2', power_avg: 168, power_bike_np_last: '176', cadence_avg: '82.4', speed_avg: '6.68' },
}

describe('summaryToRow', () => {
  it('przelicza jednostki Wahoo i datę na Europe/Warsaw', () => {
    const r = summaryToRow(done)!
    expect(r.date).toBe('2026-09-20')
    expect(r.minutes_active).toBe(60)
    expect(r.distance_km).toBe(24.1)
    expect(r.avg_hr).toBe(141)
    expect(r.np_w).toBe(176)
    expect(r.avg_cadence).toBe(82)
    expect(r.avg_speed_kmh).toBe(24)
    expect(r.ascent_m).toBe(88)
  })
  it('bez podsumowania (niewykonany) albo poniżej 5 min → null; prędkość z dystansu, gdy brak speed_avg', () => {
    expect(summaryToRow({ id: 1, starts: '2026-09-21T10:00:00Z' })).toBeNull()
    expect(summaryToRow({ id: 2, starts: '2026-09-21T10:00:00Z', workout_summary: { duration_active_accum: 120 } })).toBeNull()
    const r = summaryToRow({ id: 3, starts: '2026-09-21T10:00:00Z', workout_summary: { duration_active_accum: 3600, distance_accum: 25000 } })!
    expect(r.avg_speed_kmh).toBe(25)
    expect(r.avg_hr).toBeNull()
  })
  it('północ w Warszawie: 22:30 UTC to już następny dzień', () => {
    expect(warsawDate('2026-09-21T22:30:00Z')).toBe('2026-09-22')
  })
})

describe('completedInRange', () => {
  it('filtruje po dacie lokalnej', () => {
    const list = [done, { ...done, id: 5, starts: '2026-09-10T08:00:00Z' }, { id: 6, starts: '2026-09-21T08:00:00Z' }]
    expect(completedInRange(list, '2026-09-15', '2026-09-22').map((r) => r.id)).toEqual([498978425])
  })
})
