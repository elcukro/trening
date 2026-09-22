import { describe, expect, it } from 'vitest'
import { planWindow } from '../plan'
import { loadProgram } from '@/data/program'
import type { PlanOverride } from '../types'

const program = loadProgram()
const ctx = { program, settings: program.default_settings }

describe('planWindow', () => {
  it('bez nadpisań zwraca czysty plan okna', () => {
    const w = planWindow('2026-09-22', 7, ctx)
    expect(w.map((d) => d.bike?.workout_id ?? null)).toEqual(['Z2', 'Z2', null, 'Z2', 'FTP_TEST', null, null])
  })
  it('przeniesienie jazdy przenosi ją w oknie wysyłki (piątek → czwartek)', () => {
    const ov: PlanOverride[] = [{ id: '1', date: '2026-09-25', kind: 'move', payload: { to: '2026-09-24', what: 'bike' } }]
    const w = planWindow('2026-09-22', 7, ctx, undefined, ov)
    expect(w.find((d) => d.date === '2026-09-24')?.bike?.workout_id).toBe('Z2')
    expect(w.find((d) => d.date === '2026-09-25')?.bike).toBeNull()
  })
  it('widzi drugi koniec przeniesienia spoza okna (margines 40 dni)', () => {
    // akcent ze środy 30.09 przeniesiony na 26.10 – okno zaczyna się dopiero 20.10
    const ov: PlanOverride[] = [{ id: '1', date: '2026-09-30', kind: 'move', payload: { to: '2026-10-26', what: 'bike' } }]
    const w = planWindow('2026-10-20', 7, ctx, undefined, ov)
    expect(w.find((d) => d.date === '2026-10-26')?.bike?.workout_id).toMatch(/^SS_/)
  })
})
