import { describe, expect, it } from 'vitest'
import { aiSafe, assertAiSafe, isAiSource, redact } from '../../../supabase/functions/_shared/provenance'
import { fitStart, fitUrl, isFitHost, isTransientFitError } from '../../../supabase/functions/_shared/wahoo_summary'
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

  it('jazda z MyWhoosh przypięta w Wahoo do planu: godzina planu, ten sam czas jazdy (10.10.2026)', () => {
    const plan = fromWahoo({ id: 5, date: '2026-10-10', starts: '2026-10-10T19:00:00Z', name: 'Korba vs Kickr', minutes_active: 96, moving_time_s: 5760 })
    const mw = fromStrava({ id: 77, date: '2026-10-10', start_at: '2026-10-10T18:08:40Z', name: 'MyWhoosh - Korba_vs_Kickr', moving_time_s: 5740, is_ride: true })
    expect(sameRide(plan, mw)).toBe(true)
    expect(mergeRides([plan], [mw]).map((r) => r.key)).toEqual(['wahoo:5'])
    // inna jazda tego samego dnia: czas różny o > 2 % albo start > 3 h dalej
    expect(sameRide(plan, fromStrava({ ...mw, moving_time_s: 5400 }))).toBe(false)
    expect(sameRide(plan, fromStrava({ ...mw, start_at: '2026-10-10T08:00:00Z' }))).toBe(false)
    // krótkie jazdy (< 10 min) tylko po starcie
    expect(sameRide({ date: '2026-10-10', start_at: '2026-10-10T08:00:00Z', moving_time_s: 400 }, { date: '2026-10-10', start_at: '2026-10-10T09:00:00Z', moving_time_s: 400 })).toBe(false)
  })

  it('start i data z pliku FIT zamiast godziny planu', () => {
    expect(fitStart({ start: '2026-10-09T22:30:00.000Z' })).toEqual({ starts: '2026-10-09T22:30:00.000Z', date: '2026-10-10' })
    expect(fitStart({ start: null })).toEqual({})
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

describe('plik FIT i dziennik: bezpieczne adresy', () => {
  it('pobieramy tylko z hostów Wahoo/CDN przez https', () => {
    expect(isFitHost('https://cdn.wahooligan.com/wahoo-cloud/production/uploads/workout_file/file/abc.fit')).toBe(true)
    expect(isFitHost('https://wahoo-cloud.s3.amazonaws.com/x.fit?X-Amz-Signature=1')).toBe(true)
    for (const bad of ['http://cdn.wahooligan.com/a.fit', 'https://169.254.169.254/latest', 'https://evil.com/a.fit', 'https://wahooligan.com.evil.com/a', 'https://u:p@cdn.wahooligan.com/a', 'https://cdn.wahooligan.com:8443/a', 'notaurl']) expect(isFitHost(bad), bad).toBe(false)
    expect(fitUrl({ file: { url: 'https://evil.com/a.fit' } })).toBeNull()
  })

  it('przekroczony czas i sieć – ponowić; uszkodzony plik i 403 – nie', () => {
    const abort = new Error('The signal has been aborted')
    expect(isTransientFitError(abort)).toBe(true)
    expect(isTransientFitError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isTransientFitError(new Error('fit sieć: TypeError'))).toBe(true)
    expect(isTransientFitError(new Error('fit 503'))).toBe(true)
    expect(isTransientFitError(new Error('fit 403'))).toBe(false)
    expect(isTransientFitError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false)
    expect(isTransientFitError(new Error('plik bez próbek'))).toBe(false)
  })

  it('redact: bez adresów i tokenów w dzienniku', () => {
    const r = redact(new Error('fit 403 https://s3.amazonaws.com/a.fit?X-Amz-Signature=abc access_token=sekret'))
    expect(r).not.toMatch(/amazonaws|sekret|abc/)
    expect(r).toMatch(/fit 403 <url> access_token=<…>/)
  })
})
