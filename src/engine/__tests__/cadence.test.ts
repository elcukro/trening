import { describe, expect, it } from 'vitest'
import { cadenceByZone, cadenceHistogram, cadenceTrend, lowCadenceWarning } from '../cadence'
import type { RideSamples } from '../analysis'
import { loadProgram } from '@/data/program'

const program = loadProgram()

function samples(seconds: number, f: (t: number) => { cad?: number | null; hr?: number; watts?: number; moving?: boolean }): RideSamples {
  const n = Math.floor(seconds / 5) + 1
  const cadence: (number | null)[] = []
  const hr: number[] = []
  const watts: number[] = []
  const moving: (0 | 1)[] = []
  for (let i = 0; i < n; i++) {
    const x = f(i * 5)
    cadence.push(x.cad === undefined ? 85 : x.cad)
    hr.push(x.hr ?? 130)
    watts.push(x.watts ?? 150)
    moving.push(x.moving === false ? 0 : 1)
  }
  return { dt: 5, n, hr, watts, cadence, speed: null, distance: null, altitude: null, moving }
}

describe('cadenceHistogram', () => {
  it('kubełki, średnia i udział pedałowania (zera i postoje pominięte)', () => {
    const s = samples(600, (t) => ({ cad: t < 300 ? 60 : t < 500 ? 90 : 0, moving: t < 550 }))
    const h = cadenceHistogram(s)
    expect(h.buckets.find((b) => b.label === '60–70')!.pct).toBe(60)
    expect(h.buckets.find((b) => b.label === '90–100')!.pct).toBe(40)
    expect(h.avg_rpm).toBe(72)
    expect(h.pedaling_pct).toBeLessThan(100)
    expect(cadenceHistogram({ ...s, cadence: null }).avg_rpm).toBeNull()
  })
})

describe('cadenceByZone', () => {
  it('z tętna, gdy nie ma miernika; z mocy, gdy jest', () => {
    const s = samples(600, (t) => ({ cad: t < 300 ? 70 : 95, hr: t < 300 ? 150 : 130, watts: t < 300 ? 200 : 120 }))
    const byHr = cadenceByZone(s, { lthr: 160, hrZones: program.hr_zones_lthr_fraction })
    expect(byHr.find((z) => z.zone === 'Z2')!.avg_rpm).toBe(95)
    expect(byHr.some((z) => z.avg_rpm === 70)).toBe(true)
    const byPower = cadenceByZone(s, { devicePower: true, ftp: 200, powerZones: program.power_zones_ftp_fraction })
    expect(byPower.find((z) => z.zone === 'Z2')!.avg_rpm).toBe(95)
    expect(byPower.find((z) => z.zone === 'Z4')!.avg_rpm).toBe(70) // strefy mocy nachodzą na siebie – 200 W = 1,0 × FTP trafia w Z4 (0,91–1,05) przed THR
    expect(cadenceByZone(s, {})).toEqual([])
  })
})

const POLICY = { floor_rpm: 75, goal_rpm: 78 }

describe('cadenceTrend / lowCadenceWarning', () => {
  it('tygodnie ważone czasem i ostrzeżenie po dwóch niskich tygodniach', () => {
    const rides = [
      { date: '2026-09-08', moving_time_s: 3600, avg_cadence: 60 },
      { date: '2026-09-09', moving_time_s: 1800, avg_cadence: 90 },
      { date: '2026-09-15', moving_time_s: 3600, avg_cadence: 72 },
      { date: '2026-09-17', moving_time_s: 3600, avg_cadence: null },
    ]
    const t = cadenceTrend(rides, '2026-09-21', 3)
    expect(t.map((w) => w.monday)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21'])
    expect(t[0]!.avg_rpm).toBe(70)
    expect(t[1]!).toMatchObject({ avg_rpm: 72, rides: 1 })
    expect(t[2]!.avg_rpm).toBeNull()
    expect(lowCadenceWarning(t, POLICY)).toContain('drugi tydzień')
    expect(lowCadenceWarning([{ monday: '2026-09-07', avg_rpm: 70, rides: 1 }, { monday: '2026-09-14', avg_rpm: 80, rides: 1 }], POLICY)).toBeNull()
  })
})
