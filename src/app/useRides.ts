import { useLiveQuery } from 'dexie-react-hooks'
import { t } from '@/i18n'
import { db, type StravaActivity, type WahooWorkout } from '@/db'
import type { ISODate } from '@/engine/dates'
import { fromStrava, fromWahoo, mergeRides, type RideRow } from '../../supabase/functions/_shared/rides'

export type { RideRow }

/**
 * Jazdy z obu źródeł (docs/33 § 4): kopia z Wahoo wygrywa, jazda ze Stravy tylko bez bliźniaka z Wahoo.
 * Wiersze Stravy znikają po 7 dniach (polityka API), więc żaden widok nie czyta `strava_activities` wprost.
 */
export function ridesFromRows(wahoo: readonly WahooWorkout[], strava: readonly StravaActivity[]): RideRow[] {
  const w = wahoo.filter((r) => !r.deleted_at).map((r) => fromWahoo(r as unknown as Record<string, unknown>))
  const s = strava.filter((r) => !r.deleted_at && r.is_ride).map((r) => fromStrava(r as unknown as Record<string, unknown>))
  return mergeRides(w, s)
}

/** Jazdy z zakresu dat (włącznie) – dla wywołań asynchronicznych. */
export async function ridesBetween(from: ISODate, to: ISODate): Promise<RideRow[]> {
  const [w, s] = await Promise.all([db.wahoo_workouts.where('date').between(from, to, true, true).toArray(), db.strava_activities.where('date').between(from, to, true, true).toArray()])
  return ridesFromRows(w, s)
}

/** Skąd jazda – jazdy ze Stravy znikają po 7 dniach (polityka API, docs/33). */
export function rideSourceLabel(a: Pick<RideRow, 'source'>): string {
  return a.source === 'wahoo' ? 'Wahoo' : t().classic.rideSource.stravaExpires
}

const NONE: RideRow[] = []

/** Hook: jazdy z zakresu dat (włącznie), na żywo z Dexie. */
export function useRides(from: ISODate, to: ISODate): RideRow[] {
  return useLiveQuery(() => ridesBetween(from, to), [from, to], NONE)
}
