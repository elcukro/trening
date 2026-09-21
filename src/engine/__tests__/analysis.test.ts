import { describe, expect, it } from 'vitest'
import { chartSeries, ifFromRpe, matchSteps, rideLoad, statusFromScore, type RideSamples } from '../analysis'
import { resolveWorkout } from '../zones'
import { loadProgram } from '@/data/program'

const program = loadProgram()

function samples(seconds: number, f: (t: number) => { hr?: number; watts?: number; cad?: number; moving?: boolean }): RideSamples {
  const n = Math.floor(seconds / 5) + 1
  const hr: number[] = []
  const watts: number[] = []
  const cadence: number[] = []
  const moving: (0 | 1)[] = []
  for (let i = 0; i < n; i++) {
    const x = f(i * 5)
    hr.push(x.hr ?? 0)
    watts.push(x.watts ?? 0)
    cadence.push(x.cad ?? 85)
    moving.push(x.moving === false ? 0 : 1)
  }
  return { dt: 5, n, hr, watts, cadence, speed: null, distance: null, altitude: null, moving }
}

describe('rideLoad', () => {
  it('moc: TSS = h × IF² × 100', () => {
    const l = rideLoad({ moving_s: 3600, device_watts: true, np_w: 200, ftp: 250 })!
    expect(l.method).toBe('power')
    expect(l.if).toBe(0.8)
    expect(l.tss).toBe(64)
  })
  it('tętno: czas w strefach, potem RPE, na końcu null', () => {
    const hist: number[] = []
    hist[130] = 3600 // godzina w Z2 przy LTHR 160 (0,81–0,89 → 130–142)
    const hr = rideLoad({ moving_s: 3600, hr_histogram: hist, zones: program.hr_zones_lthr_fraction, lthr: 160 })!
    expect(hr.method).toBe('hr')
    expect(hr.tss).toBe(49)
    expect(hr.if).toBe(0.7)
    const rpe = rideLoad({ moving_s: 3600, rpe: 5 })!
    expect(rpe.method).toBe('rpe')
    expect(rpe.tss).toBe(49)
    expect(rideLoad({ moving_s: 3600 })).toBeNull()
    expect(ifFromRpe(10)).toBe(1)
  })
  it('bez miernika moc szacowana nie liczy się', () => {
    expect(rideLoad({ moving_s: 3600, device_watts: false, avg_watts: 200, ftp: 250, rpe: 6 })!.method).toBe('rpe')
  })
})

describe('matchSteps', () => {
  const ss = resolveWorkout(program.bike_workouts.SS_2x12!, 59, 160, { heatOffsetBpm: 0, ftp: 200, powerZones: program.power_zones_ftp_fraction })
  const workSteps = ss.steps.filter((s) => s.intensity_type === 'tempo' || s.zone === 'SS')
  it('trening zrobiony dokładnie wg planu → wysoka zgodność, przesunięcie 0', () => {
    // moc według kroków (dokładnie środek celu), rozgrzewka w Z2
    let cum = 0
    const plan = ss.steps.map((s) => {
      const from = cum
      cum += s.duration_s
      return { from, to: cum, w: s.watts ? Math.round((s.watts[0] + s.watts[1]) / 2) : 100 }
    })
    const s = samples(cum, (t) => ({ watts: plan.find((p) => t >= p.from && t < p.to)?.w ?? 100, hr: 140 }))
    const m = matchSteps(ss, s, { auto: true, ftp: 200 })
    expect(m.offset_s).toBe(0)
    expect(m.score).toBeGreaterThanOrEqual(90)
    expect(m.steps.filter((st) => st.work).every((st) => st.rating === 'ok')).toBe(true)
    expect(m.steps.length).toBe(ss.steps.length)
    expect(workSteps.length).toBeGreaterThan(0)
  })
  it('nagranie zaczęte 3 min przed treningiem → automatyczne przesunięcie', () => {
    let cum = 0
    const plan = ss.steps.map((s) => {
      const from = cum
      cum += s.duration_s
      return { from, to: cum, w: s.watts ? Math.round((s.watts[0] + s.watts[1]) / 2) : 100 }
    })
    const lead = 180
    const s = samples(cum + lead, (t) => ({ watts: t < lead ? 90 : (plan.find((p) => t - lead >= p.from && t - lead < p.to)?.w ?? 100), hr: 140 }))
    const m = matchSteps(ss, s, { auto: true, ftp: 200 })
    expect(m.offset_s).toBe(lead)
    expect(m.score).toBeGreaterThanOrEqual(90)
  })
  it('interwały pojechane za słabo → miss i status „zmienione”; bez mocy ocena po tętnie', () => {
    let cum = 0
    for (const s of ss.steps) cum += s.duration_s
    const weak = samples(cum, () => ({ watts: 100, hr: 120 }))
    const m = matchSteps(ss, weak, { ftp: 200 })
    expect(m.steps.filter((st) => st.work).every((st) => st.rating === 'miss')).toBe(true)
    expect(statusFromScore(m.score)).toBe('modified')
    expect(statusFromScore(80)).toBe('done')
    const noPower = { ...weak, watts: null }
    const h = matchSteps(ss, noPower)
    expect(h.steps[0]!.target?.kind).toBe('bpm')
    // postoje nie liczą się do czasu kroku
    const withStops = samples(cum + 600, (t) => ({ watts: 100, hr: 120, moving: t % 100 >= 20 }))
    expect(matchSteps(ss, withStops).moving_s).toBeLessThan(cum + 600)
  })
  it('chartSeries daje punkt co 30 s z pasem celu', () => {
    const s = samples(600, () => ({ watts: 150, hr: 130 }))
    const m = matchSteps(ss, s)
    const pts = chartSeries(s, m, 30)
    expect(pts.length).toBe(21)
    expect(pts[0]!.lo).not.toBeNull()
    expect(pts[0]!.watts).toBe(150)
  })
})
