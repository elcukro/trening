import { describe, expect, it } from 'vitest'
import { completedInRange, dropReason, droppedWorkouts, isOurPlan, needsSummaryFetch, summaryToRow, warsawDate } from '../../../supabase/functions/_shared/wahoo_summary'

const done = {
  id: 498978425,
  name: 'Baza tlenowa Z2',
  starts: '2026-09-20T16:02:10.000Z',
  workout_summary: { duration_active_accum: '3612.0', duration_total_accum: 3900, distance_accum: '24120.5', ascent_accum: 88, heart_rate_avg: '141.2', power_avg: 168, power_bike_np_last: '176', cadence_avg: '82.4', speed_avg: '6.68' },
}

describe('summaryToRow', () => {
  it('przelicza jednostki Wahoo i datę na Europe/Warsaw', () => {
    const r = summaryToRow(done)!
    expect(r.date).toBe('2026-09-20')
    expect(r.minutes_active).toBe(60)
    expect(r.distance_km).toBe(24.1)
    expect(r.avg_hr).toBe(141)
    expect(r.np_w).toBe(176)
    expect(r.avg_cadence).toBe(82)
    expect(r.avg_speed_kmh).toBe(24)
    expect(r.ascent_m).toBe(88)
  })
  it('bez podsumowania (niewykonany) albo poniżej 5 min → null; prędkość z dystansu, gdy brak speed_avg', () => {
    expect(summaryToRow({ id: 1, starts: '2026-09-21T10:00:00Z' })).toBeNull()
    expect(summaryToRow({ id: 2, starts: '2026-09-21T10:00:00Z', workout_summary: { duration_active_accum: 120 } })).toBeNull()
    const r = summaryToRow({ id: 3, starts: '2026-09-21T10:00:00Z', workout_summary: { duration_active_accum: 3600, distance_accum: 25000 } })!
    expect(r.avg_speed_kmh).toBe(25)
    expect(r.avg_hr).toBeNull()
  })
  it('północ w Warszawie: 22:30 UTC to już następny dzień', () => {
    expect(warsawDate('2026-09-21T22:30:00Z')).toBe('2026-09-22')
  })
})

describe('completedInRange', () => {
  it('filtruje po dacie lokalnej', () => {
    const list = [done, { ...done, id: 5, starts: '2026-09-10T08:00:00Z' }, { id: 6, starts: '2026-09-21T08:00:00Z' }]
    expect(completedInRange(list, '2026-09-15', '2026-09-22').map((r) => r.id)).toEqual([498978425])
  })
})

describe('odrzucone treningi z listy Wahoo – diagnostyka MyWhoosh (docs/33 § 7a)', () => {
  const list = [
    { id: 1, starts: '2026-10-23T18:19:00.000Z', name: 'MyWhoosh - Baza_Z2_158W_120min', workout_type_id: 61, workout_summary: null },
    { id: 2, starts: '2026-10-21T20:45:00.000Z', name: 'MyWhoosh - Z2 SweetSpot2x10', workout_summary: { calories_accum: 700, file: { url: 'https://cdn.wahooligan.com/x.fit?signature=abc' } } },
    { id: 3, starts: '2026-10-20T19:00:00.000Z', name: 'Z2', workout_token: '2026-10-20:Z2_60:abc', workout_summary: null },
    { id: 4, starts: '2026-10-19T17:00:00.000Z', name: 'Bolt', workout_summary: { duration_active_accum: 3600 } },
    { id: 5, starts: '2026-10-18T17:00:00.000Z', name: 'Krótka', workout_summary: { duration_active_accum: '120' } },
    { id: 6, starts: '2026-08-01T17:00:00.000Z', name: 'Stara', workout_summary: null },
  ]

  it('powód odrzucenia jak w summaryToRow', () => {
    expect(list.map(dropReason)).toEqual(['brak workout_summary', 'brak czasu w podsumowaniu', 'brak workout_summary', null, 'za krótko (120 s)', 'brak workout_summary'])
    expect(dropReason({ id: 7, workout_summary: { duration_active_accum: 600 } })).toBe('brak starts')
  })

  it('kształt podsumowania bez adresów i tokenów, plany oznaczone, okno dat', () => {
    const d = droppedWorkouts(list, '2026-10-01', '2026-10-27')
    expect(d.map((x) => x.id)).toEqual([1, 2, 3, 5])
    expect(d[0]).toMatchObject({ workout_type_id: 61, summary_keys: null, our_plan: false })
    expect(d[1]!.summary_keys).toEqual(['calories_accum', 'file'])
    expect(d[2]!.our_plan).toBe(true)
    expect(JSON.stringify(d)).not.toMatch(/https?:|signature|abc/)
  })
})

describe('podsumowanie dociągane osobno – jazdy z innych aplikacji (27.10.2026)', () => {
  const now = Date.parse('2026-10-27T10:00:00Z')
  const from = '2026-10-01'
  const to = '2026-10-27'
  // kształt z logu produkcji: jazda z MyWhoosh na liście Wahoo bez podsumowania, typ 12, prawdziwa godzina startu
  const mywhoosh = { id: 509043014, starts: '2026-10-23T18:19:11.000Z', name: 'MyWhoosh - Baza_Z2_158W_120min', workout_type_id: 12, workout_token: null, workout_summary: null }

  it('jazda z MyWhoosh bez podsumowania – dociągnąć', () => {
    expect(needsSummaryFetch(mywhoosh, from, to, now)).toBe(true)
  })

  it('pomija nasze plany, plany innych aplikacji o północy UTC, przyszłość, okno dat i wpisy z podsumowaniem', () => {
    const plan = { ...mywhoosh, workout_token: '2026-10-23:Z2_60:abc', starts: '2026-10-23T04:00:00.000Z' }
    expect(isOurPlan(plan)).toBe(true)
    expect(needsSummaryFetch(plan, from, to, now)).toBe(false)
    expect(needsSummaryFetch({ ...mywhoosh, name: 'The Model', starts: '2026-10-27T00:00:00.000Z' }, from, to, now)).toBe(false)
    expect(needsSummaryFetch({ ...mywhoosh, starts: '2026-10-28T18:00:00.000Z' }, from, '2026-10-31', now)).toBe(false)
    expect(needsSummaryFetch({ ...mywhoosh, starts: '2026-09-20T18:00:00.000Z' }, from, to, now)).toBe(false)
    expect(needsSummaryFetch({ ...mywhoosh, workout_summary: { duration_active_accum: 6000 } }, from, to, now)).toBe(false)
    expect(needsSummaryFetch({ ...mywhoosh, starts: null }, from, to, now)).toBe(false)
  })

  it('po dociągnięciu podsumowania jazda przechodzi przez summaryToRow', () => {
    const filled = { ...mywhoosh, workout_summary: { duration_active_accum: 6007, distance_accum: 47880, power_avg: 153, heart_rate_avg: 130, cadence_avg: 87 } }
    expect(summaryToRow(filled)).toMatchObject({ id: 509043014, date: '2026-10-23', minutes_active: 100, distance_km: 47.9, avg_power: 153, avg_hr: 130 })
  })
})
