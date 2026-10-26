import { describe, expect, it } from 'vitest'
import { decodeFit, fitToStreams } from '../../../supabase/functions/_shared/fit'
import { resample, rideMetrics } from '../../../supabase/functions/_shared/metrics'

/** Minimalny plik FIT: definicja `record` (20), opcjonalnie pola deweloperskie i skompresowane znaczniki czasu. */
function buildFit(opts: { seconds: number; power: (i: number) => number; dev?: boolean; compressedEvery?: number; bigEndian?: boolean }): Uint8Array {
  const out: number[] = []
  const le = !opts.bigEndian
  const u16 = (v: number) => (le ? [v & 0xff, (v >> 8) & 0xff] : [(v >> 8) & 0xff, v & 0xff])
  const u32 = (v: number) => (le ? [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff] : [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff])
  // definicja: lokalny typ 0; pola: 253 timestamp u32, 7 power u16, 3 hr u8, 4 cadence u8, 6 speed u16, 5 distance u32
  const fields = [
    [253, 4, 0x86],
    [7, 2, 0x84],
    [3, 1, 0x02],
    [4, 1, 0x02],
    [6, 2, 0x84],
    [5, 4, 0x86],
  ]
  out.push(0x40 | (opts.dev ? 0x20 : 0), 0, le ? 0 : 1, ...u16(20), fields.length, ...fields.flat())
  if (opts.dev) out.push(1, 0, 2, 0) // jedno pole deweloperskie, 2 bajty
  // definicja bez znacznika czasu (lokalny typ 1) do skompresowanych nagłówków
  const fieldsC = fields.slice(1)
  out.push(0x40 | 1, 0, le ? 0 : 1, ...u16(20), fieldsC.length, ...fieldsC.flat())
  const t0 = 1_100_000_000 // sekundy od epoki FIT
  for (let i = 0; i < opts.seconds; i++) {
    const p = opts.power(i)
    const speed = Math.round(8.5 * 1000)
    const dist = Math.round(8.5 * i * 100)
    const body = [...u16(p), 140, i % 7 === 0 ? 0xff : 88, ...u16(speed), ...u32(dist)]
    if (opts.compressedEvery && i % opts.compressedEvery !== 0) {
      out.push(0x80 | (1 << 5) | ((t0 + i) & 0x1f), ...body)
    } else {
      out.push(0x00, ...u32(t0 + i), ...body)
      if (opts.dev) out.push(0xaa, 0xbb)
    }
  }
  const header = [14, 0x20, 0x08, 0x08, ...[out.length & 0xff, (out.length >> 8) & 0xff, (out.length >> 16) & 0xff, (out.length >> 24) & 0xff], 0x2e, 0x46, 0x49, 0x54, 0, 0]
  return new Uint8Array([...header, ...out, 0, 0])
}

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
