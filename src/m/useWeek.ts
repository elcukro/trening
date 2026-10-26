import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SessionLog, type WahooPushRow } from '@/db'
import { ridesBetween, useRides, type RideRow } from '@/app/useRides'
import { addDays, mondayOf, type ISODate } from '@/engine/dates'
import type { CalendarDay } from '@/engine/types'
import { weekState, type WeekState } from '@/day/weekState'

/** Stan tygodnia (plan vs wykonanie, statusy dni) z bazy lokalnej – dla paska tygodnia na Dziś i listy w Planie. */
export function useWeekState(anyDate: ISODate, window: CalendarDay[], today: ISODate): WeekState & { monday: ISODate; pushes: WahooPushRow[] } {
  const monday = mondayOf(anyDate)
  const sunday = addDays(monday, 6)
  const logs = useLiveQuery(async () => (await db.session_logs.where('date').between(monday, sunday, true, true).toArray()).filter((l) => !l.deleted_at), [monday, sunday], [] as SessionLog[])
  const acts = useRides(monday, sunday)
  const pushes = useLiveQuery(async () => (await db.wahoo_pushes.where('date').between(monday, sunday, true, true).toArray()).filter((p) => !p.deleted_at && (p.status === 'created' || p.status === 'updated')), [monday, sunday], [] as WahooPushRow[])
  const days = useMemo(() => window.filter((d) => d.date >= monday && d.date <= sunday), [window, monday, sunday])
  const state = useMemo(() => weekState({ days, today, logs, activities: acts, boltDates: pushes.map((p) => p.date) }), [days, today, logs, acts, pushes])
  return { ...state, monday, pushes }
}

/** Ostatnia jazda (Wahoo albo Strava) do danego dnia włącznie – kontekst na Dziś („jak było ostatnio”). */
export function useLastRide(upTo: ISODate): RideRow | null {
  return useLiveQuery(async () => (await ridesBetween(addDays(upTo, -30), upTo)).at(-1) ?? null, [upTo], null as RideRow | null) ?? null
}
