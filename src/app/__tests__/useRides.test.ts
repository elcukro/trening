import { describe, expect, it } from 'vitest'
import { rideSourceLabel, ridesFromRows } from '../useRides'
import type { FitRide, StravaActivity, WahooWorkout } from '@/db'

const upd = '2026-10-25T12:00:00Z'
const strava = (id: string, o: Partial<StravaActivity> = {}): StravaActivity => ({ id, date: '2026-10-25', start_at: '2026-10-25T08:01:00Z', name: 'Morning Ride', sport_type: 'Ride', moving_time_s: 5400, is_ride: true, updated_at: upd, ...o })
const fit = (id: string, o: Partial<FitRide> = {}): FitRide => ({ id, date: '2026-10-26', start_at: '2026-10-26T16:00:30Z', name: 'MyWhoosh', moving_time_s: 5300, elapsed_time_s: 5400, distance_m: 45000, elevation_m: 300, updated_at: upd, ...o })
const wahoo = (id: string, o: Partial<WahooWorkout> = {}): WahooWorkout => ({ id, date: '2026-10-25', starts: '2026-10-25T08:00:00Z', name: 'Z2 90 min', minutes_active: 90, updated_at: upd, ...o })

describe('ridesFromRows', () => {
  it('Wahoo wygrywa z bliźniakiem ze Stravy; zostaje Strava bez bliźniaka; bez usuniętych i nie-jazd', () => {
    const rides = ridesFromRows(
      [wahoo('1'), wahoo('2', { deleted_at: upd })],
      [
        strava('10'),
        strava('11', { date: '2026-10-26', start_at: '2026-10-26T16:00:00Z' }),
        strava('12', { is_ride: false, date: '2026-10-24', start_at: '2026-10-24T08:00:00Z' }),
        strava('13', { deleted_at: upd, date: '2026-10-23', start_at: '2026-10-23T08:00:00Z' }),
      ],
    )
    expect(rides.map((r) => r.key)).toEqual(['wahoo:1', 'strava:11'])
    expect(rides[0]!.moving_time_s).toBe(5400)
  })

  it('wgrany plik (MyWhoosh) zastępuje bliźniaka ze Stravy i ma własną etykietę', () => {
    const rides = ridesFromRows([wahoo('1')], [strava('10'), strava('11', { date: '2026-10-26', start_at: '2026-10-26T16:00:00Z' })], [fit('7'), fit('8', { deleted_at: upd, date: '2026-10-22' })])
    expect(rides.map((r) => r.key)).toEqual(['wahoo:1', 'fit:7'])
    expect(rideSourceLabel(rides[1]!)).toBe('Plik FIT')
  })
})
