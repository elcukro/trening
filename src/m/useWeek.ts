import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SessionLog, type StravaActivity, type WahooPushRow } from '@/db'
import { addDays, mondayOf, type ISODate } from '@/engine/dates'
import type { CalendarDay } from '@/engine/types'
import { weekState, type WeekState } from '@/day/weekState'

/** Stan tygodnia (plan vs wykonanie, statusy dni) z bazy lokalnej – dla paska tygodnia na Dziś i listy w Planie. */
export function useWeekState(anyDate: ISODate, window: CalendarDay[], today: ISODate): WeekState & { monday: ISODate; pushes: WahooPushRow[] } {
  const monday = mondayOf(anyDate)
  const sunday = addDays(monday, 6)
  const logs = useLiveQuery(async () => (await db.session_logs.where('date').between(monday, sunday, true, true).toArray()).filter((l) => !l.deleted_at), [monday, sunday], [] as SessionLog[])
  const acts = useLiveQuery(async () => (await db.strava_activities.where('date').between(monday, sunday, true, true).toArray()).filter((a) => !a.deleted_at && a.is_ride), [monday, sunday], [] as StravaActivity[])
  const pushes = useLiveQuery(async () => (await db.wahoo_pushes.where('date').between(monday, sunday, true, true).toArray()).filter((p) => !p.deleted_at && (p.status === 'created' || p.status === 'updated')), [monday, sunday], [] as WahooPushRow[])
  const days = useMemo(() => window.filter((d) => d.date >= monday && d.date <= sunday), [window, monday, sunday])
  const state = useMemo(() => weekState({ days, today, logs, activities: acts, boltDates: pushes.map((p) => p.date) }), [days, today, logs, acts, pushes])
  return { ...state, monday, pushes }
}

/** Ostatnia jazda ze Stravy do danego dnia włącznie – kontekst na Dziś („jak było ostatnio”). */
export function useLastRide(upTo: ISODate): StravaActivity | null {
  return (
    useLiveQuery(
      async () => {
        const rows = (await db.strava_activities.where('date').between(addDays(upTo, -30), upTo, true, true).toArray()).filter((a) => !a.deleted_at && a.is_ride)
        return rows.toSorted((a, b) => (a.start_at < b.start_at ? 1 : -1))[0] ?? null
      },
      [upTo],
      null as StravaActivity | null,
    ) ?? null
  )
}
