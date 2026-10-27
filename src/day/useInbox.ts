import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useEngine } from '@/app/useSettings'
import { useRides } from '@/app/useRides'
import { useRangeView } from '@/app/usePlan'
import { addDays } from '@/engine/dates'
import { nowHour, todayISO } from '@/lib/dates'
import { getLocation } from '@/sync/weather'
import { t } from '@/i18n'
import { NO_ACCOUNT, useFtpSuggestion, useIosDay, useSyncStatus } from './useIos'
import { useBriefing } from './useBriefing'
import { buildInbox, RIDE_DAYS, type Inbox, type InboxDay, type InboxWeather } from './inbox'

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

  // zapowiedzi: plan po nadpisaniach na tydzień w przód i prognoza na jutrzejszą jazdę (ta sama co w odprawie, z bufora 3 h)
  const ahead = useRangeView(addDays(today, 1), addDays(today, 7))
  const upcoming = useMemo<InboxDay[]>(
    () =>
      ahead.days.map((x) => ({
        date: x.date,
        weekday: x.weekday,
        ride: x.bike && x.bike.duration_min > 0 ? { name: x.bike.name, minutes: x.bike.duration_min } : null,
        test: x.flags.includes('test'),
        deload: x.week_type === 'deload',
      })),
    [ahead.days],
  )
  const tomorrowDay = ahead.days.find((x) => x.date === addDays(today, 1)) ?? null
  const brief = useBriefing(tomorrowDay)
  // `useBriefing` zwraca nowy obiekt przy każdym renderze – zapamiętujemy liczby, nie obiekt
  const label = brief?.label ?? null
  const start = brief?.startLabel ?? ''
  const lo = brief?.summary?.temp_min_c
  const hi = brief?.summary?.temp_max_c
  const rain = brief?.summary?.precip_prob
  const wind = brief?.summary?.wind_kmh
  const tomorrowWeather = useMemo<InboxWeather | null>(
    () => (label && lo != null && hi != null && rain != null && wind != null ? { label, temp_min_c: lo, temp_max_c: hi, precip_prob: rain, wind_kmh: wind, start } : null),
    [label, lo, hi, rain, wind, start],
  )

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
        upcoming,
        todayDeload: d.day?.week_type === 'deload',
        tomorrowWeather,
        deloadNote: engine.ctx.program.rules.deload_note || null,
      }),
    [today, sync.state, sync.error, noAccount, d.flow, d.weighDue, d.bolt, d.day?.week_type, rides, ratedDates, ftpSuggestion, hasLocation, engine.ctx.tests, engine.ctx.program.rules.deload_note, seen, upcoming, tomorrowWeather],
  )

  const markSeen = useCallback(async (id: string) => {
    const now = ((await db.kv.get(SEEN_KEY))?.value as string[] | undefined) ?? []
    if (now.includes(id)) return
    await db.kv.put({ key: SEEN_KEY, value: [...now, id].slice(-SEEN_MAX), updated_at: new Date().toISOString() })
  }, [])

  return { ...inbox, markSeen }
}
