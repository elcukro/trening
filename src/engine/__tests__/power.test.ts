import { describe, expect, it } from 'vitest'
import { bestEffort, ftpSeries, lthrFromRide, powerCurve, suggestFtp, type RideForPower } from '../power'
import type { RideSamples } from '../analysis'

const ride = (id: string, date: string, mmp: Record<string, number | null>, device = true): RideForPower => ({ id, date, name: `Jazda ${id}`, device_watts: device, mmp_w: mmp, moving_time_s: 5400 })

describe('suggestFtp', () => {
  it('proponuje 0,95 × MMP20, gdy przekracza FTP o ≥ 3 %; ignoruje jazdy bez miernika, sprzed testu i odrzucone', () => {
    const rides = [
      ride('a', '2026-10-01', { '1200': 200, '3600': 170 }), // 190 → za mało przy FTP 190
      ride('b', '2026-10-05', { '1200': 220, '3600': 180 }), // 209 ✓
      ride('c', '2026-10-06', { '1200': 300, '3600': 200 }, false), // szacunek Stravy – pomijamy
      ride('d', '2026-09-20', { '1200': 260, '3600': 200 }), // przed testem
    ]
    const s = suggestFtp(rides, 190, '2026-09-26')!
    expect(s.ftp).toBe(209)
    expect(s.basis).toBe('20min')
    expect(s.ride_id).toBe('b')
    expect(suggestFtp(rides, 190, '2026-09-26', new Set(['b']))).toBeNull()
    expect(suggestFtp(rides, 205, '2026-09-26')).toBeNull()
  })
  it('60 min wprost, gdy wyższe niż 0,95 × 20 min', () => {
    const s = suggestFtp([ride('x', '2026-10-01', { '1200': 210, '3600': 205 })], 190, null)!
    expect(s.basis).toBe('60min')
    expect(s.ftp).toBe(205)
  })
})

describe('powerCurve', () => {
  it('maksimum per długość w oknach 28 i 90 dni', () => {
    const rides = [ride('a', '2026-09-01', { '5': 600, '60': 350, '300': 250, '1200': 210, '3600': 180 }), ride('b', '2026-09-20', { '5': 500, '60': 360, '300': 240, '1200': 200, '3600': null })]
    const c = powerCurve(rides, '2026-10-05')
    const p20 = c.find((p) => p.key === '1200')!
    expect(p20.recent).toBe(200)
    expect(p20.all).toBe(210)
    expect(p20.all_date).toBe('2026-09-01')
    expect(c.find((p) => p.key === '3600')!.recent).toBeNull()
    expect(c.find((p) => p.key === '60')!.recent).toBe(360)
  })
})

function samples(seconds: number, f: (t: number) => { hr?: number; watts?: number }): RideSamples {
  const n = Math.floor(seconds / 5) + 1
  const hr: number[] = []
  const watts: number[] = []
  for (let i = 0; i < n; i++) {
    const x = f(i * 5)
    hr.push(x.hr ?? 0)
    watts.push(x.watts ?? 0)
  }
  return { dt: 5, n, hr, watts, cadence: null, speed: null, distance: null, altitude: null, moving: null }
}

describe('bestEffort / lthrFromRide', () => {
  it('znajduje okno 20 min i bierze tętno z drugiej połowy', () => {
    // 10 min luz, 20 min progowo (250 W, tętno 150 → 165), reszta luz
    const s = samples(3600, (t) => (t >= 600 && t < 1800 ? { watts: 250, hr: t < 1200 ? 150 : 165 } : { watts: 120, hr: 120 }))
    const e = bestEffort(s, 1200)!
    expect(e.avg_watts).toBe(250)
    expect(e.hr_second_half).toBe(165)
    expect(lthrFromRide(s, 240)).toEqual({ lthr: 165, effort_w: 250 })
    // za słaby wysiłek względem FTP → brak LTHR
    expect(lthrFromRide(s, 300)).toBeNull()
    expect(bestEffort({ ...s, watts: null }, 1200)).toBeNull()
  })
})

describe('ftpSeries', () => {
  it('szacunek na start, testy chronologicznie, W/kg z masy z 7 dni', () => {
    const pts = ftpSeries(
      [
        { date: '2026-12-01', ftp_w: 220 },
        { date: '2026-09-26', ftp_w: 180 },
        { date: '2026-10-10', ftp_w: 300, deleted_at: 'x' },
      ],
      [
        { date: '2026-09-24', weight_kg: 110 },
        { date: '2026-09-25', weight_kg: 109 },
        { date: '2026-11-30', weight_kg: 104 },
      ],
      170,
      '2026-09-14',
    )
    expect(pts.map((p) => p.ftp)).toEqual([170, 180, 220])
    expect(pts[1]!.weight_kg).toBe(109.5)
    expect(pts[1]!.wkg).toBe(1.64)
    expect(pts[2]!.wkg).toBe(2.12)
    expect(pts[0]!.wkg).toBeNull()
  })
})
