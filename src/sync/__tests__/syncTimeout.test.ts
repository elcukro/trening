import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/db', () => ({
  db: { outbox: { count: async () => 0 }, kv: { put: async () => undefined } },
  SYNC_TABLES: [],
  UPDATE_ONLY_TABLES: [],
  USER_SCOPED_ID_TABLES: [],
}))
vi.mock('../supabase', () => ({ supabase: { auth: { getSession: h.getSession } } }))
vi.mock('../strava', () => ({ purgeLocalStrava: async () => undefined }))

import { t } from '@/i18n'
import { onSyncStatus, runSync, SYNC_TIMEOUT_MS, type SyncStatus } from '../sync'

describe('runSync – zawieszone żądanie (docs/35 N4)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('po limicie czasu stan „error” z czytelnym zdaniem, a następna próba startuje od nowa', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { onLine: true, languages: ['pl-PL'] })
    h.getSession.mockReturnValue(new Promise(() => {}))
    let last: SyncStatus | null = null
    const off = onSyncStatus((s) => (last = s))

    const first = runSync({ programVersion: 'x' })
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS)
    await first
    expect(last).toMatchObject({ state: 'error', error: t().sync.timeout(SYNC_TIMEOUT_MS / 1000) })

    h.getSession.mockResolvedValue({ data: { session: null } })
    await runSync({ programVersion: 'x' })
    expect(h.getSession).toHaveBeenCalledTimes(2)
    expect(last).toMatchObject({ state: 'unauthenticated' })
    off()
  })
})
