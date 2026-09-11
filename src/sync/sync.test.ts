import { describe, expect, it, vi } from 'vitest'

vi.mock('@/db', () => ({ db: {}, SYNC_TABLES: [] }))
vi.mock('./supabase', () => ({ supabase: null }))

const { normalize, shouldApplyRemote } = await import('./sync')

describe('sync – scalanie', () => {
  it('numeric ze stringa → liczba, ale nie daty/id/tekst', () => {
    expect(normalize({ weight_kg: '104.5', date: '2026-09-14', id: '1234', reps: '8', notes: '12', updated_at: '2026' })).toEqual({ weight_kg: 104.5, date: '2026-09-14', id: '1234', reps: 8, notes: '12', updated_at: '2026' })
  })
  it('ostatni zapis wygrywa; lokalny z oczekującą zmianą nie jest nadpisywany starszym', () => {
    const remote = { id: 'a', updated_at: '2026-09-14T08:00:00Z' }
    expect(shouldApplyRemote(undefined, remote, false)).toBe(true)
    expect(shouldApplyRemote({ id: 'a', updated_at: '2026-09-14T07:00:00Z' }, remote, false)).toBe(true)
    expect(shouldApplyRemote({ id: 'a', updated_at: '2026-09-14T09:00:00Z' }, remote, false)).toBe(false)
    expect(shouldApplyRemote({ id: 'a', updated_at: '2026-09-14T09:00:00Z' }, remote, true)).toBe(false)
    expect(shouldApplyRemote({ id: 'a', updated_at: '2026-09-14T07:00:00Z' }, remote, true)).toBe(true)
  })
})
