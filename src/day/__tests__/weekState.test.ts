import { describe, expect, it } from 'vitest'
import type { CalendarDay } from '@/engine/types'
import { weekState } from '../weekState'

const nutrition = { energy: 'maintenance', label: '', protein_g_per_kg: 2, on_bike_carbs_g_per_h: [0, 0] } as unknown as CalendarDay['nutrition']
const day = (date: string, weekday: CalendarDay['weekday'], o: Partial<CalendarDay> = {}): CalendarDay => ({ date, weekday, week: 5, phase: 'I', week_type: 'build', day_type: 'rest', bike: null, nutrition, flags: [], ...o })
const bike = (name: string, min: number) => ({ workout_id: 'X', name, duration_min: min, bike: 'gravel', fallback_workout_id: null })

describe('weekState', () => {
  it('klasyfikuje dni i sumuje plan vs wykonanie', () => {
    const days = [
      day('2026-10-12', 'mon', { bike: bike('Z2', 75), day_type: 'easy' }),
      day('2026-10-13', 'tue'),
      day('2026-10-14', 'wed', { bike: bike('SS', 65), day_type: 'key' }),
      day('2026-10-15', 'thu'),
      day('2026-10-16', 'fri', { bike: bike('Z2', 60), day_type: 'easy' }),
      day('2026-10-17', 'sat', { bike: bike('Długa', 150), day_type: 'long' }),
      day('2026-10-18', 'sun', { bike: bike('Z2', 90), day_type: 'easy' }),
    ]
    const w = weekState({
      days,
      today: '2026-10-16',
      logs: [{ date: '2026-10-14', kind: 'bike', status: 'skipped' }],
      activities: [
        { date: '2026-10-12', moving_time_s: 4500 },
        { date: '2026-10-13', moving_time_s: 1800 },
      ],
      boltDates: ['2026-10-17'],
    })
    expect(w.days.map((d) => d.outcome)).toEqual(['done', 'extra', 'skipped', 'free', 'today', 'planned', 'planned'])
    expect(w.days[2]!.key).toBe(true)
    expect(w.days[5]!.on_bolt).toBe(true)
    expect(w.planned_min).toBe(440)
    expect(w.done_min).toBe(105)
    expect(w.rides_planned).toBe(5)
    expect(w.rides_done).toBe(1)
    expect(w.rides_extra).toBe(1)
  })
  it('przeszły dzień z planem bez jazdy to missed; log done bez Stravy też liczy się jako done', () => {
    const w = weekState({ days: [day('2026-10-12', 'mon', { bike: bike('Z2', 60) }), day('2026-10-13', 'tue', { bike: bike('Z2', 60) })], today: '2026-10-15', logs: [{ date: '2026-10-13', kind: 'bike', status: 'done' }], activities: [] })
    expect(w.days.map((d) => d.outcome)).toEqual(['missed', 'done'])
  })
  it('zgodność < 70 % to „inaczej niż plan” mimo logu done z serwera; bez wyniku decyduje log (docs/35 S1)', () => {
    const days = [day('2026-10-12', 'mon', { bike: bike('Z2', 60) }), day('2026-10-13', 'tue', { bike: bike('SS', 60) }), day('2026-10-14', 'wed', { bike: bike('Z2', 60) })]
    const w = weekState({
      days,
      today: '2026-10-15',
      logs: days.map((d) => ({ date: d.date, kind: 'bike', status: 'done' })),
      activities: days.map((d) => ({ date: d.date, moving_time_s: 3600 })),
      scores: { '2026-10-12': 69, '2026-10-13': 70 },
    })
    expect(w.days.map((d) => d.outcome)).toEqual(['modified', 'done', 'done'])
    expect(w.rides_done).toBe(3)
  })
})
