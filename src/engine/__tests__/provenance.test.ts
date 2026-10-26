import { describe, expect, it } from 'vitest'
import { aiSafe, assertAiSafe, isAiSource } from '../../../supabase/functions/_shared/provenance'
import { fromStrava, fromWahoo, mergeRides, sameRide, twinOf } from '../../../supabase/functions/_shared/rides'

const wahoo = (o: Record<string, unknown> = {}) => fromWahoo({ id: 1, date: '2026-10-25', starts: '2026-10-25T08:00:00Z', name: 'Z2', minutes_active: 90, moving_time_s: 5400, distance_km: 45.2, ascent_m: 300, avg_power: 180, ...o })
const strava = (o: Record<string, unknown> = {}) => fromStrava({ id: 99, date: '2026-10-25', start_at: '2026-10-25T08:01:30Z', name: 'Morning Ride', moving_time_s: 5350, distance_m: 45_100, is_ride: true, ...o })

describe('proweniencja: AI tylko na danych spoza Stravy (docs/33 § 4)', () => {
  it('źródła dozwolone dla AI', () => {
    expect(['wahoo', 'fit', 'manual', 'health'].every(isAiSource)).toBe(true)
    expect(isAiSource('strava')).toBe(false)
    expect(isAiSource(null)).toBe(false)
    expect(aiSafe([wahoo(), strava(), { source: null }])).toHaveLength(1)
  })

  it('assertAiSafe znajduje dane Stravy w zagnieżdżonym obiekcie', () => {
    expect(() => assertAiSafe({ rides: [wahoo()], logs: [{ source: 'manual', rpe: 6 }] })).not.toThrow()
    expect(() => assertAiSafe({ rides: [wahoo(), strava()] })).toThrow(/rides\[1\]\.source/)
    expect(() => assertAiSafe({ logs: [{ strava_activity_id: 123 }] })).toThrow(/strava_activity_id/)
    expect(() => assertAiSafe({ logs: [{ strava_activity_id: null, notes: 'Wahoo: Z2' }] })).not.toThrow()
    expect(() => assertAiSafe({ logs: [{ notes: 'Strava: Morning Ride' }] })).toThrow(/notes/)
  })
})

describe('jedna jazda z dwóch źródeł: kopia z Wahoo wygrywa', () => {
  it('rozpoznaje tę samą jazdę po starcie i czasie', () => {
    expect(sameRide(wahoo(), strava())).toBe(true)
    expect(sameRide(wahoo(), strava({ start_at: '2026-10-25T15:00:00Z' }))).toBe(false)
    expect(sameRide(wahoo(), strava({ moving_time_s: 1800 }))).toBe(false)
  })

  it('mergeRides: Wahoo zamiast Stravy, jazda tylko ze Stravy zostaje', () => {
    const extra = strava({ id: 100, start_at: '2026-10-25T17:00:00Z', moving_time_s: 1500 })
    const m = mergeRides([wahoo()], [strava(), extra])
    expect(m.map((r) => r.key)).toEqual(['wahoo:1', 'strava:100'])
    expect(twinOf(strava(), [wahoo()])?.key).toBe('wahoo:1')
  })

  it('wiersz Wahoo bez pliku FIT: czas z minut, moc tylko z miernika', () => {
    const r = wahoo({ moving_time_s: null, avg_power: 0, np_w: 0 })
    expect(r).toMatchObject({ source: 'wahoo', moving_time_s: 5400, distance_m: 45_200, elevation_m: 300, avg_watts: null, np_w: null })
  })
})
