import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useEngine } from '@/app/useSettings'
import { useRides } from '@/app/useRides'
import { addDays } from '@/engine/dates'
import { nowHour, todayISO } from '@/lib/dates'
import { getLocation } from '@/sync/weather'
import { t } from '@/i18n'
import { NO_ACCOUNT, useFtpSuggestion, useIosDay, useSyncStatus } from './useIos'
import { buildInbox, RIDE_DAYS, type Inbox } from './inbox'

const SEEN_KEY = 'inbox_seen'
const SEEN_MAX = 200

/** Dane skrzynki dla dzwonka (Dziś, Plan) – wszystko z lokalnej bazy, więc działa offline. */
export function useInbox(): Inbox & { markSeen: (id: string) => Promise<void> } {
  const today = todayISO()
  const from = addDays(today, -(RIDE_DAYS - 1))
  const engine = useEngine()
  const d = useIosDay(today)
  const sync = useSyncStatus()
  const rides = useRides(from, today)
  const ftpSuggestion = useFtpSuggestion()
  const ratedDates = useLiveQuery(
    async () => new Set((await db.session_logs.where('date').between(from, today, true, true).toArray()).filter((l) => !l.deleted_at && l.kind === 'bike' && (l.rpe != null || l.status === 'skipped')).map((l) => l.date)),
    [from, today],
    new Set<string>(),
  )
  const hasLocation = useLiveQuery(async () => (await getLocation()) != null, [])
  const seen = useLiveQuery(async () => new Set(((await db.kv.get(SEEN_KEY))?.value as string[] | undefined) ?? []), [], new Set<string>())

  const noAccount = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem(NO_ACCOUNT)
  const inbox = useMemo(
    () =>
      buildInbox({
        today,
        hour: nowHour(),
        sessionExpired: sync.state === 'unauthenticated' && !noAccount,
        syncError: sync.state === 'error' ? (sync.error ?? t().day.inbox.syncTitle) : null,
        checkedIn: d.flow.steps.find((s) => s.key === 'checkin')?.done ?? true,
        weighDue: d.weighDue,
        bolt: d.bolt.kind === 'error' ? { kind: 'error', error: d.bolt.error } : { kind: d.bolt.kind },
        rides,
        ratedDates,
        ftpSuggestion,
        hasLocation,
        tests: (engine.ctx.tests ?? []).map((x) => ({ id: `${x.date}:${x.ftp_w ?? ''}:${x.lthr_bpm ?? ''}`, date: x.date, ftp_w: x.ftp_w, lthr_bpm: x.lthr_bpm })),
        seen,
      }),
    [today, sync.state, sync.error, noAccount, d.flow, d.weighDue, d.bolt, rides, ratedDates, ftpSuggestion, hasLocation, engine.ctx.tests, seen],
  )

  const markSeen = useCallback(async (id: string) => {
    const now = ((await db.kv.get(SEEN_KEY))?.value as string[] | undefined) ?? []
    if (now.includes(id)) return
    await db.kv.put({ key: SEEN_KEY, value: [...now, id].slice(-SEEN_MAX), updated_at: new Date().toISOString() })
  }, [])

  return { ...inbox, markSeen }
}
