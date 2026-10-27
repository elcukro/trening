import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ session: null as unknown, invoke: vi.fn() }))
vi.mock('@/db', () => ({ db: {} }))
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: h.session } }) }, functions: { invoke: h.invoke } },
  langHeaders: () => ({}),
}))

import { t } from '@/i18n'
import { askCoach } from './coachChat'

describe('askCoach', () => {
  beforeEach(() => {
    h.invoke.mockReset()
  })

  it('bez konta nie woła funkcji i mówi, że trener wymaga konta (nie „sesja wygasła”)', async () => {
    h.session = null
    await expect(askCoach([{ role: 'user', content: 'hej' }], {})).rejects.toThrow(t().sync.coach.noAccount)
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('z sesją 401 z serwera to wygasła sesja', async () => {
    h.session = { access_token: 'x' }
    h.invoke.mockResolvedValue({ data: null, error: { context: new Response('{}', { status: 401 }) } })
    await expect(askCoach([{ role: 'user', content: 'hej' }], {})).rejects.toThrow(t().sync.coach.sessionExpired)
    expect(h.invoke).toHaveBeenCalledOnce()
  })
})
