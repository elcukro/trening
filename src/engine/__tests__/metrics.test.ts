import { describe, expect, it } from 'vitest'
import { bestAverages, bestSpeeds, decoupling, normalizedPower, resample, rideMetrics, type RawStreams } from '../../../supabase/functions/_shared/metrics'

function streams(seconds: number, f: (t: number) => { hr?: number; watts?: number; cad?: number; v?: number }): RawStreams {
  const time: number[] = []
  const heartrate: number[] = []
  const watts: number[] = []
  const cadence: number[] = []
  const velocity_smooth: number[] = []
  const distance: number[] = []
  const moving: boolean[] = []
  let d = 0
  for (let t = 0; t <= seconds; t++) {
    const x = f(t)
    time.push(t)
    heartrate.push(x.hr ?? 0)
    watts.push(x.watts ?? 0)
    cadence.push(x.cad ?? 0)
    velocity_smooth.push(x.v ?? 0)
    d += x.v ?? 0
    distance.push(d)
    moving.push((x.v ?? 0) > 0.5)
  }
  return { time: { data: time }, heartrate: { data: heartrate }, watts: { data: watts }, cadence: { data: cadence }, velocity_smooth: { data: velocity_smooth }, distance: { data: distance }, moving: { data: moving } }
}

describe('resample', () => {
  it('kubełkuje do 5 s, uśrednia wartości i bierze ostatni dystans', () => {
    const raw = streams(59, (t) => ({ watts: t < 30 ? 100 : 200, hr: 140, v: 8, cad: 90 }))
    const s = resample(raw, 5)!
    expect(s.n).toBe(12)
    expect(s.watts![0]).toBe(100)
    expect(s.watts![11]).toBe(200)
    expect(s.hr![3]).toBe(140)
    expect(s.distance![11]).toBe(60 * 8)
    expect(s.moving![0]).toBe(1)
  })
  it('zwraca null bez strumienia czasu i pomija strumienie o innej długości', () => {
    expect(resample(null)).toBeNull()
    const s = resample({ time: { data: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, watts: { data: [1, 2] } }, 5)!
    expect(s.watts).toBeNull()
    expect(s.n).toBe(3)
  })
})

describe('normalizedPower', () => {
  it('równa moc → NP = moc; interwały → NP > średnia', () => {
    const flat = resample(streams(1200, () => ({ watts: 200 })), 5)!
    expect(normalizedPower(flat.watts, 5)).toBe(200)
    const ints = resample(streams(1200, (t) => ({ watts: Math.floor(t / 60) % 2 === 0 ? 300 : 100 })), 5)!
    const np = normalizedPower(ints.watts, 5)!
    expect(np).toBeGreaterThan(200)
    expect(np).toBeLessThan(300)
  })
  it('null przy jeździe krótszej niż 5 min', () => {
    expect(normalizedPower([100, 100, 100], 5)).toBeNull()
  })
})

describe('bestAverages / bestSpeeds', () => {
  it('znajduje najlepsze okno i null dla okien dłuższych niż jazda', () => {
    const s = resample(streams(1800, (t) => ({ watts: t >= 600 && t < 1200 ? 250 : 150, v: t >= 600 && t < 1200 ? 9 : 6 })), 5)!
    const mmp = bestAverages(s.watts, 5, [60, 600, 3600])
    expect(mmp['60']).toBe(250)
    expect(mmp['600']).toBe(250)
    expect(mmp['3600']).toBeNull()
    const sp = bestSpeeds(s.distance, 5, [300, 600, 7200])
    expect(sp['600']).toBeCloseTo(9 * 3.6, 0)
    expect(sp['7200']).toBeNull()
  })
})

describe('decoupling', () => {
  it('stały stosunek P/HR → 0 %, dryf tętna → dodatnie', () => {
    const steady = resample(streams(3600, () => ({ watts: 200, hr: 140, v: 8 })), 5)!
    expect(decoupling(steady)).toBe(0)
    const drift = resample(streams(3600, (t) => ({ watts: 200, hr: 130 + Math.floor(t / 360), v: 8 })), 5)!
    expect(decoupling(drift)!).toBeGreaterThanOrEqual(2.5)
  })
  it('null bez mocy lub przy krótkiej jeździe', () => {
    const short = resample(streams(600, () => ({ watts: 200, hr: 140, v: 8 })), 5)!
    expect(decoupling(short)).toBeNull()
    const noPower = resample(streams(3600, () => ({ hr: 140, v: 8 })), 5)!
    noPower.watts = null
    expect(decoupling(noPower)).toBeNull()
  })
})

describe('rideMetrics', () => {
  it('bez miernika: brak NP/MMP/rozprzężenia, są prędkości i kadencja w ruchu', () => {
    const s = resample(streams(1800, (t) => ({ watts: 150, hr: 140, v: 8, cad: t % 100 < 50 ? 90 : 0 })), 5)!
    const m = rideMetrics(s, false)
    expect(m.np_w).toBeNull()
    expect(m.mmp_w).toBeNull()
    expect(m.best_speed_kmh!['300']).toBeCloseTo(28.8, 0)
    expect(m.avg_cadence_moving).toBe(90)
    expect(rideMetrics(s, true).np_w).toBe(150)
    expect(rideMetrics(null, true).np_w).toBeNull()
  })
})
