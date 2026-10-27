import { useLiveQuery } from 'dexie-react-hooks'
import { t } from '@/i18n'
import { db, type FitRide, type StravaActivity, type WahooWorkout } from '@/db'
import type { ISODate } from '@/engine/dates'
import { fromFit, fromStrava, fromWahoo, mergeRides, type RideRow } from '../../supabase/functions/_shared/rides'

export type { RideRow }

/**
 * Jazdy ze wszystkich źródeł (docs/33 § 4): kopia z Wahoo wygrywa, potem wgrany plik FIT (MyWhoosh, § 7a), jazda ze
 * Stravy tylko bez bliźniaka w żadnej z nich.
 * Wiersze Stravy znikają po 7 dniach (polityka API), więc żaden widok nie czyta `strava_activities` wprost.
 */
export function ridesFromRows(wahoo: readonly WahooWorkout[], strava: readonly StravaActivity[], fit: readonly FitRide[] = []): RideRow[] {
  const w = wahoo.filter((r) => !r.deleted_at).map((r) => fromWahoo(r as unknown as Record<string, unknown>))
  const s = strava.filter((r) => !r.deleted_at && r.is_ride).map((r) => fromStrava(r as unknown as Record<string, unknown>))
  const f = fit.filter((r) => !r.deleted_at).map((r) => fromFit(r as unknown as Record<string, unknown>))
  return mergeRides(w, s, f)
}

/** Jazdy z zakresu dat (włącznie) – dla wywołań asynchronicznych. */
export async function ridesBetween(from: ISODate, to: ISODate): Promise<RideRow[]> {
  const [w, s, f] = await Promise.all([
    db.wahoo_workouts.where('date').between(from, to, true, true).toArray(),
    db.strava_activities.where('date').between(from, to, true, true).toArray(),
    db.fit_rides.where('date').between(from, to, true, true).toArray(),
  ])
  return ridesFromRows(w, s, f)
}

/** Skąd jazda – jazdy ze Stravy znikają po 7 dniach (polityka API, docs/33). */
export function rideSourceLabel(a: Pick<RideRow, 'source' | 'time_only' | 'app'>): string {
  if (a.time_only) return t().classic.rideSource.timeOnly(a.app)
  return a.source === 'wahoo' ? 'Wahoo' : a.source === 'fit' ? t().classic.rideSource.fit : t().classic.rideSource.stravaExpires
}

const NONE: RideRow[] = []

/** Hook: jazdy z zakresu dat (włącznie), na żywo z Dexie. */
export function useRides(from: ISODate, to: ISODate): RideRow[] {
  return useLiveQuery(() => ridesBetween(from, to), [from, to], NONE)
}
