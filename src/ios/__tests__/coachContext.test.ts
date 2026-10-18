import { describe, expect, it } from 'vitest'
import type { CalendarDay } from '@/engine/types'
import type { Checkin, SessionLog, StravaActivity } from '@/db'
import { buildCoachContext } from '../coachContext'

const nutrition = { energy: 'maintenance', label: '', protein_g_per_kg: 2, on_bike_carbs_g_per_h: [0, 0] } as unknown as CalendarDay['nutrition']
const day = (date: string, o: Partial<CalendarDay> = {}): CalendarDay => ({ date, weekday: 'sat', week: 5, phase: 'I', week_type: 'build', day_type: 'rest', bike: null, gym: null, nutrition, flags: [], ...o })
const bike = (name: string) => ({ workout_id: 'Z2_90', name, duration_min: 90, bike: 'gravel', fallback_workout_id: null })
const ci = (date: string, o: Partial<Checkin>): Checkin => ({ id: date, date, weight_kg: null, resting_hr: null, sleep: null, legs: null, motivation: null, sick: false, updated_at: '', ...o })
const act = (date: string, o: Partial<StravaActivity> = {}): StravaActivity => ({ id: date, date, start_at: `${date}T10:00:00Z`, name: 'Jazda', sport_type: 'Ride', moving_time_s: 5400, is_ride: true, updated_at: '', distance_m: 45_250, elevation_m: 120, avg_hr: 131, avg_watts: 180, np_w: 185, device_watts: true, decoupling_pct: 4.26, note: 'Dobra jazda.', ...o })
const athlete = { ftp: 250, lthr: 160, goal: '30 km/h', coach_notes: ['kadencja 80'], weight_goal_kg: 82 }

describe('kontekst rozmowy z trenerem', () => {
  it('dni dostają wynik: done/missed/skipped/extra/free/pending, przyszłe – stan Bolta', () => {
    const window = [day('2026-10-14', { bike: bike('Z2') }), day('2026-10-15', { bike: bike('Akcent'), day_type: 'key' }), day('2026-10-16'), day('2026-10-17'), day('2026-10-18', { bike: bike('Długa') }), day('2026-10-19', { bike: bike('Z2') }), day('2026-10-20')]
    const logs: SessionLog[] = [{ id: '1', date: '2026-10-15', kind: 'bike', planned_workout_id: null, status: 'skipped', updated_at: '' }]
    const c = buildCoachContext({ today: '2026-10-18', date: '2026-10-18', window, checkins: [], logs, activities: [act('2026-10-14'), act('2026-10-16')], overrides: [], athlete, boltDates: ['2026-10-19'] })
    expect(c.days.map((d) => [d.date, d.outcome ?? d.on_bolt ?? '-'])).toEqual([
      ['2026-10-14', 'done'],
      ['2026-10-15', 'skipped'],
      ['2026-10-16', 'extra'],
      ['2026-10-17', 'free'],
      ['2026-10-18', 'pending'],
      ['2026-10-19', true],
      ['2026-10-20', '-'],
    ])
    expect(c.days[0]!.weekday).toBe('sobota')
    expect(c.rides[0]).toMatchObject({ date: '2026-10-14', minutes: 90, km: 45.3, avg_w: 180, np_w: 185, avg_hr: 131, decoupling_pct: 4.3, note: 'Dobra jazda.' })
    expect(c.flags).toEqual([])
  })
  it('moc tylko z miernika; TSS z loadOf; sygnały luzowania z check-inów', () => {
    const checkins = [...Array.from({ length: 6 }, (_, i) => ci(`2026-10-1${i}`, { resting_hr: 50 })), ci('2026-10-17', { resting_hr: 60, legs: 2, sleep: 2, motivation: 2, weight_kg: 105 }), ci('2026-10-18', { resting_hr: 60, legs: 1, sleep: 2, motivation: 2 })]
    const c = buildCoachContext({ today: '2026-10-18', date: '2026-10-18', window: [], checkins, logs: [], activities: [act('2026-10-17', { device_watts: false })], overrides: [], athlete, loadOf: () => ({ tss: 61.4, if: 0.713 }) })
    expect(c.rides[0]).toMatchObject({ avg_w: null, np_w: null, tss: 61, if: 0.71 })
    expect(c.athlete).toMatchObject({ weight_kg: 105, weight_date: '2026-10-17', coach_notes: ['kadencja 80'] })
    expect(c.flags).toEqual(['tętno spoczynkowe > średnia 7 dni + 7 bpm dwa dni z rzędu', 'nogi ocenione na 1–2 dwa dni z rzędu', 'suma ocen check-inu ≤ 6 dwa dni z rzędu'])
    expect(c.checkins).toHaveLength(8)
  })
})
