import { describe, expect, it } from 'vitest'
import { decodeFit } from '../../../supabase/functions/_shared/fit'
import { ascentM, fitRide, fitRideName, sha256Hex } from '../../../supabase/functions/_shared/fit_ride'
import { fromFit, fromStrava, fromWahoo, mergeRides, rideFromRow, twinOf } from '../../../supabase/functions/_shared/rides'
import { aiSafe, assertAiSafe } from '../../../supabase/functions/_shared/provenance'
import { buildFit } from './fitBuilder'

// 27.10.2026 16:00 UTC = 17:00 w Warszawie; sekundy od epoki FIT (31.12.1989)
const T0 = Date.parse('2026-10-27T16:00:00Z') / 1000 - 631065600

describe('jazda z wgranego pliku FIT (MyWhoosh – docs/33 § 7a)', () => {
  it('liczy wiersz tym samym kodem co plik z Wahoo: czas, dystans, moc, tętno, przewyższenie, data lokalna', () => {
    const d = decodeFit(buildFit({ seconds: 3600, t0: T0, power: (i) => (i < 1200 ? 280 : 180), hr: (i) => (i < 1200 ? 160 : 130), altitude: (i) => 100 + Math.min(i, 600) * 0.5 }))
    const r = fitRide(d, { fileName: 'MyWhoosh_2026-10-27.fit' })!
    expect(r).not.toBeNull()
    expect(r.row.date).toBe('2026-10-27')
    expect(r.row.start_at).toBe('2026-10-27T16:00:00.000Z')
    expect(r.row.name).toBe('MyWhoosh')
    expect(r.row.moving_time_s).toBeGreaterThan(3500)
    expect(r.row.elapsed_time_s).toBe(3599)
    expect(r.row.distance_m).toBeGreaterThan(30000)
    expect(r.row.device_watts).toBe(true)
    expect(r.row.np_w).toBeGreaterThan(r.row.avg_watts!)
    expect(r.row.mmp_w?.['1200']).toBeGreaterThanOrEqual(279)
    expect(r.row.avg_hr).toBeGreaterThan(130)
    expect(r.row.avg_hr).toBeLessThan(160)
    expect(r.row.max_hr).toBe(160)
    expect(r.row.elevation_m).toBeGreaterThanOrEqual(295)
    expect(r.row.elevation_m).toBeLessThanOrEqual(300)
    expect(r.row.hr_histogram?.[160]).toBeGreaterThan(1000)
    expect(r.samples.dt).toBe(5)
    expect(r.samples.n).toBe(720)
  })

  it('plik bez jazdy (krótszy niż 5 min albo bez ruchu) – null', () => {
    expect(fitRide(decodeFit(buildFit({ seconds: 200, t0: T0, power: () => 200 })))).toBeNull()
    expect(fitRide(decodeFit(buildFit({ seconds: 900, t0: T0, power: () => 0, speed: () => 0 })))).toBeNull()
  })

  it('nazwa: zawodnika, z nazwy pliku albo domyślna', () => {
    expect(fitRideName('  Wieczorne  Z2 ', 'x.fit')).toBe('Wieczorne Z2')
    expect(fitRideName(null, 'mywhoosh_ride.fit')).toBe('MyWhoosh')
    expect(fitRideName('', 'activity.fit')).toBe('Jazda z pliku')
  })

  it('przewyższenie z histerezą 2 m – szum nie nabija metrów', () => {
    expect(ascentM([100, 101, 100, 101, 100, 101])).toBe(0)
    expect(ascentM([100, 103, 102, 106, 90, 95])).toBe(12)
    expect(ascentM(null)).toBe(0)
  })

  it('skrót pliku – ten sam plik daje ten sam skrót', async () => {
    const a = buildFit({ seconds: 400, t0: T0, power: () => 200 })
    expect(await sha256Hex(a)).toBe(await sha256Hex(a.slice()))
    expect(await sha256Hex(a)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('jazda z pliku zastępuje bliźniaka ze Stravy (mergeRides)', () => {
  const d = decodeFit(buildFit({ seconds: 3600, t0: T0, power: () => 200 }))
  const fit = fromFit({ id: 7, ...fitRide(d)!.row, note: 'Notatka AI', note_source: 'ai' })
  const strava = fromStrava({ id: 99, date: '2026-10-27', start_at: '2026-10-27T16:00:20Z', name: 'MyWhoosh', moving_time_s: 3590, distance_m: 30500, is_ride: true })
  const wahoo = fromWahoo({ id: 1, date: '2026-10-27', starts: '2026-10-27T07:00:00Z', name: 'Z2', minutes_active: 60 })

  it('kopia z pliku wygrywa ze Stravą, inne jazdy dnia zostają', () => {
    const m = mergeRides([wahoo], [strava], [fit])
    expect(m.map((r) => r.key)).toEqual(['wahoo:1', 'fit:7'])
    expect(twinOf(fit, [strava, wahoo])?.key).toBe('strava:99')
    expect(aiSafe(m)).toHaveLength(2)
    expect(() => assertAiSafe({ rides: aiSafe(m) })).not.toThrow()
  })

  it('plik z Bolta wgrany ręcznie – kopia z Wahoo wygrywa, jazda liczy się raz', () => {
    const boltFile = fromFit({ ...fit, id: 8, start_at: '2026-10-27T07:01:00Z', moving_time_s: 3600 })
    expect(mergeRides([wahoo], [], [boltFile]).map((r) => r.key)).toEqual(['wahoo:1'])
  })

  it('bez pliku Strava zostaje (stare wywołania bez trzeciego argumentu)', () => {
    expect(mergeRides([wahoo], [strava]).map((r) => r.key)).toEqual(['wahoo:1', 'strava:99'])
  })

  it('rideFromRow wybiera konwerter po źródle', () => {
    expect(rideFromRow('fit', { id: 3, date: '2026-10-27', moving_time_s: 60 }).key).toBe('fit:3')
    expect(rideFromRow('strava', { id: 3, date: '2026-10-27', moving_time_s: 60 }).source).toBe('strava')
  })
})
