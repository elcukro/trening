import { describe, expect, it, vi } from 'vitest'
import type { CalendarDay } from '@/engine/types'
import { runCoachTool, type CoachToolDeps } from '../coachTools'

const nutrition = { energy: 'maintenance', label: '', protein_g_per_kg: 2, on_bike_carbs_g_per_h: [0, 0] } as unknown as CalendarDay['nutrition']
const day = (date: string, o: Partial<CalendarDay> = {}): CalendarDay => ({ date, weekday: 'mon', week: 5, phase: 'I', week_type: 'build', day_type: 'rest', bike: null, nutrition, flags: [], ...o })
const bike = (name: string, workout_id = 'Z2_90') => ({ workout_id, name, duration_min: 90, bike: 'gravel', fallback_workout_id: null })

function deps(window: CalendarDay[]): CoachToolDeps & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = { upsertCheckin: [], upsertSessionLog: [], addOverride: [], pushWahoo: [] }
  return {
    today: '2026-10-18',
    window,
    calls,
    upsertCheckin: vi.fn(async (...a: unknown[]) => void calls.upsertCheckin!.push(a)),
    upsertSessionLog: vi.fn(async (...a: unknown[]) => void calls.upsertSessionLog!.push(a)),
    addOverride: vi.fn(async (...a: unknown[]) => void calls.addOverride!.push(a)),
    pushWahoo: vi.fn(async () => ({ pushed: 5, errors: [] })),
  }
}

describe('narzędzia trenera', () => {
  it('save_checkin: pilnuje zakresów, domyślna data dziś, przecinek dziesiętny', async () => {
    const d = deps([])
    const r = await runCoachTool('save_checkin', { weight_kg: '104,8', resting_hr: 52, legs: 3, sleep: 9, sick: false, notes: ' ból kolana ' }, d)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('Zapisano check-in 2026-10-18: waga 104,8 kg, tętno 52, nogi 3, choroba: nie, uwagi: „ból kolana”.')
    expect(d.calls.upsertCheckin![0]).toEqual(['2026-10-18', { weight_kg: 104.8, resting_hr: 52, legs: 3, sick: false, notes: 'ból kolana' }])
    expect((await runCoachTool('save_checkin', { weight_kg: 12 }, d)).ok).toBe(false)
    expect((await runCoachTool('save_checkin', { date: '18.10.2026', legs: 3 }, d)).ok).toBe(false)
  })
  it('set_rpe: zapis do logu jazdy', async () => {
    const d = deps([day('2026-10-17', { bike: bike('Z2 90 min'), day_type: 'easy' })])
    const r = await runCoachTool('set_rpe', { date: '2026-10-17', rpe: 7.4 }, d)
    expect(r).toEqual({ ok: true, text: 'Zapisano RPE 7 dla 2026-10-17.', changed: 'log' })
    expect(d.calls.upsertSessionLog![0]).toEqual(['2026-10-17', 'bike', { rpe: 7 }])
    expect((await runCoachTool('set_rpe', { rpe: 11 }, d)).ok).toBe(false)
  })
  it('mark_skipped: log + nadpisanie skip; dzień wolny odmawia', async () => {
    const d = deps([day('2026-10-19', { bike: bike('Z2 90 min'), day_type: 'easy' }), day('2026-10-20')])
    const r = await runCoachTool('mark_skipped', { date: '2026-10-19', reason: 'praca' }, d)
    expect(r.ok).toBe(true)
    expect(d.calls.upsertSessionLog![0]).toEqual(['2026-10-19', 'bike', { planned_workout_id: 'Z2_90', status: 'skipped', rpe: null, notes: 'praca' }])
    expect(d.calls.addOverride![0]).toEqual(['2026-10-19', 'skip', { what: 'bike' }])
    expect((await runCoachTool('mark_skipped', { date: '2026-10-20' }, d)).text).toMatch(/dzień wolny/)
    expect((await runCoachTool('mark_skipped', { date: '2026-11-20' }, d)).ok).toBe(false)
  })
  it('move_ride: walidacja silnikiem (tylko dzień wolny, nie w przeszłość)', async () => {
    const d = deps([day('2026-10-17', { bike: bike('Długa'), day_type: 'long' }), day('2026-10-19', { bike: bike('Z2'), day_type: 'easy' }), day('2026-10-20'), day('2026-10-21', { bike: bike('Akcent', 'SS_2x12'), day_type: 'key' })])
    expect((await runCoachTool('move_ride', { from: '2026-10-19', to: '2026-10-21' }, d)).text).toMatch(/dzień wolny/)
    expect((await runCoachTool('move_ride', { from: '2026-10-20', to: '2026-10-21' }, d)).text).toMatch(/nie ma jazdy/)
    const ok = await runCoachTool('move_ride', { from: '2026-10-19', to: '2026-10-20' }, d)
    expect(ok.ok).toBe(true)
    expect(ok.text).toMatch(/Przeniesiono „Z2” z 2026-10-19 na 2026-10-20/)
    expect(d.calls.addOverride![0]).toEqual(['2026-10-19', 'move', { to: '2026-10-20', what: 'bike' }])
    expect((await runCoachTool('move_ride', { from: '2026-10-19' }, d)).ok).toBe(false)
  })
  it('push_wahoo: błędy z wysyłki wracają do modelu; wyjątek nie wywraca rozmowy', async () => {
    const d = deps([])
    expect(await runCoachTool('push_wahoo', {}, d)).toEqual({ ok: true, text: 'Wysłano plan na Bolta (5 dni).', changed: 'bolt' })
    d.pushWahoo = async () => {
      throw new Error('Wahoo nie jest połączone')
    }
    expect(await runCoachTool('push_wahoo', {}, d)).toEqual({ ok: false, text: 'Wahoo nie jest połączone' })
    expect((await runCoachTool('fly', {}, d)).ok).toBe(false)
  })
})
