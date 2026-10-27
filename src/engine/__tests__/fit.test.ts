import { describe, expect, it } from 'vitest'
import { decodeFit, fitToStreams } from '../../../supabase/functions/_shared/fit'
import { resample, rideMetrics } from '../../../supabase/functions/_shared/metrics'
import { buildFit } from './fitBuilder'

describe('dekoder FIT (Wahoo ELEMNT – źródło dla AI, docs/33 § 7)', () => {
  it('czyta próbki record: czas, moc, tętno, kadencja, prędkość, dystans; 0xFF = brak', () => {
    const d = decodeFit(buildFit({ seconds: 10, power: (i) => 200 + i }))
    expect(d.records).toHaveLength(10)
    expect(d.records[3]).toMatchObject({ power: 203, hr: 140, cadence: 88, speed: 8.5 })
    expect(d.records[7]!.cadence).toBeNull()
    expect(d.records[2]!.distance).toBeCloseTo(17, 5)
    expect(d.start).toBe(new Date((1_100_000_000 + 631065600) * 1000).toISOString())
  })

  it('skompresowane znaczniki czasu, pola deweloperskie i big-endian', () => {
    for (const opts of [{ compressedEvery: 16 }, { dev: true }, { bigEndian: true, compressedEvery: 5 }]) {
      const d = decodeFit(buildFit({ seconds: 70, power: () => 250, ...opts }))
      expect(d.records).toHaveLength(70)
      expect(d.records.map((r) => r.t - d.records[0]!.t)).toEqual(Array.from({ length: 70 }, (_, i) => i))
      expect(d.records.every((r) => r.power === 250)).toBe(true)
    }
  })

  it('strumienie w formacie Stravy → te same metryki (NP, MMP) co dla Stravy', () => {
    const d = decodeFit(buildFit({ seconds: 3600, power: (i) => (i < 1200 ? 280 : 180) }))
    const streams = fitToStreams(d)!
    expect(Object.keys(streams).sort()).toEqual(['cadence', 'distance', 'heartrate', 'moving', 'time', 'velocity_smooth', 'watts'])
    const s = resample(streams, 5)!
    const m = rideMetrics(s, true)
    expect(m.mmp_w?.['1200']).toBe(280)
    expect(m.np_w).toBeGreaterThan(210)
  })

  it('zły plik: rzuca; ucięty: oddaje to, co da się przeczytać', () => {
    expect(() => decodeFit(new Uint8Array([1, 2, 3]))).toThrow()
    const full = buildFit({ seconds: 20, power: () => 100 })
    expect(decodeFit(full.slice(0, full.length - 60)).records.length).toBeGreaterThan(10)
  })
})
