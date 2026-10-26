import { describe, expect, it } from 'vitest'
import { ruleLetter, weekFacts, weekLabel, type WeekInput } from '../../../supabase/functions/_shared/week_facts'
import { numbersOk } from '../../../supabase/functions/_shared/ride_facts'
import type { DaySnapshot, RideLite } from '../../../supabase/functions/_shared/email_views'

const ZONES = [{ id: 'Z2', name: 'Wytrzymałość', low_bpm: 130, high_bpm: 143 }]
const snap = (date: string, planned: DaySnapshot['planned'], week_type = 'build'): DaySnapshot => ({
  date,
  dateLabel: date,
  planned,
  context: planned ? { workout_id: 'Z2', category: 'endurance', description: '', work: [], phase: 'Faza I', phase_goal: 'Baza', week_type, flags: [], goal: '30 km/h', coach_notes: ['kadencja 80'] } : null,
  ftp: 235,
  lthr: 160,
  zones: ZONES,
  cadence_floor: 75,
  week_planned_min: 600,
  next: null,
  morning: null,
})
const ride = (date: string, min: number, w: number, hr: number, name = 'Jazda'): RideLite => ({ date, name, moving_time_s: min * 60, distance_m: min * 450, elevation_m: 100, avg_hr: hr, avg_cadence: 85, avg_watts: w, np_w: w + 5, device_watts: true, decoupling_pct: 4, hr_histogram: null })

const input: WeekInput = {
  monday: '2026-10-12',
  snapshots: {
    '2026-10-13': snap('2026-10-13', { name: 'Baza tlenowa Z2', minutes: 90, day_type: 'easy' }),
    '2026-10-14': snap('2026-10-14', { name: 'Sweet spot 2×15', minutes: 75, day_type: 'key' }),
    '2026-10-16': snap('2026-10-16', { name: 'Baza tlenowa Z2', minutes: 90, day_type: 'easy' }),
    '2026-10-17': snap('2026-10-17', { name: 'Długa jazda', minutes: 180, day_type: 'long' }),
    '2026-10-18': snap('2026-10-18', { name: 'Baza tlenowa Z2', minutes: 60, day_type: 'easy' }),
    '2026-10-20': snap('2026-10-20', { name: 'Baza tlenowa Z2', minutes: 90, day_type: 'easy' }, 'deload'),
    '2026-10-24': snap('2026-10-24', { name: 'Test FTP 20 min', minutes: 70, day_type: 'test' }, 'deload'),
  },
  rides: [ride('2026-10-13', 92, 170, 131), ride('2026-10-14', 74, 205, 148, 'SS'), ride('2026-10-15', 45, 208, 150, 'Extra'), ride('2026-10-17', 320, 166, 141, 'Długa')],
  prevRides: [ride('2026-10-06', 90, 165, 132), ride('2026-10-08', 70, 200, 147), ride('2026-10-10', 150, 190, 148)],
  logs: [{ date: '2026-10-18', status: 'skipped', rpe: null }, { date: '2026-10-17', status: 'done', rpe: 5 }],
  checkins: [
    { date: '2026-10-13', weight_kg: 105.1, resting_hr: 54, sleep: 3, legs: 3, motivation: 4, sick: false },
    { date: '2026-10-15', weight_kg: 104.8, resting_hr: 52, sleep: 4, legs: 4, motivation: 5, sick: false },
  ],
  prevCheckins: [{ date: '2026-10-08', weight_kg: 104.6, resting_hr: 55, sleep: 3, legs: 3, motivation: 3, sick: false }],
}

describe('fakty tygodnia', () => {
  it('wyniki dni, sumy, porównanie, ciało, następny tydzień', () => {
    const f = weekFacts(input)
    expect(weekLabel('2026-10-12')).toBe('12–18.10')
    expect(f.days.map((d) => d.outcome)).toEqual(['free', 'done', 'done', 'extra', 'missed', 'done', 'skipped'])
    expect(f.totals.planned_min).toBe(495)
    expect(f.totals.done_min).toBe(531)
    expect(f.totals.key_done).toBe(1)
    expect(f.totals.rides).toBe(4)
    expect(f.previous_week?.done_min).toBe(310)
    expect(f.derived.minutes_change_pct).toBe(71)
    expect(f.derived.weight_change_kg).toBe(0.2)
    expect(f.body.rhr_avg).toBe(53)
    expect(f.flags).toContain('objętość skoczyła o ponad 30 % względem poprzedniego tygodnia')
    expect(f.next_week?.days.length).toBe(2)
    expect(f.next_week?.has_test).toBe(true)
    expect(f.next_week?.week_type).toBe('deload')
    expect(f.athlete.coach_notes).toEqual(['kadencja 80'])
  })
  it('list z reguł używa tylko liczb z faktów', () => {
    const f = weekFacts(input)
    const letter = ruleLetter(f)
    expect(letter).toMatch(/8 h 51 min z 8 h 15 min/)
    expect(letter).toMatch(/test – ostatnie dni/)
    expect(numbersOk(letter, f).ok).toBe(true)
    // list z reguł w języku zawodnika (docs/34 § 6): te same liczby, angielskie zdania
    const en = ruleLetter(f, 'en')
    expect(en).toMatch(/8 h 51 min of the 8 h 15 min planned/)
    expect(en).toMatch(/test in the plan/)
    expect(numbersOk(en, f).ok).toBe(true)
  })
})
