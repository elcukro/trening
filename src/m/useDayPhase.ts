import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import type { ISODate } from '@/engine/dates'
import { dayPhase, type DayPhase } from '@/day/dayState'
import type { IosDay } from '@/day/useIos'
import { nowHour, todayISO } from '@/lib/dates'
import { DEFAULT_RIDE_HOURS, type RideHours } from '@/sync/weather'
import { isCheckedIn } from '@/day/health'

const stateOf = (log: { status: string } | undefined) => (log ? (log.status as 'planned' | 'in_progress' | 'done' | 'modified' | 'skipped') : 'none')

/** Stan dnia dla karty na Dziś i podpowiedzi w rozmowie z trenerem – jedno źródło (docs/24 § 4). */
export function useDayPhase(d: IosDay, date: ISODate): DayPhase {
  const today = todayISO()
  const day = d.day
  const hours = useLiveQuery(async () => ((await db.kv.get('ride_hours'))?.value as RideHours | undefined) ?? DEFAULT_RIDE_HOURS, [], DEFAULT_RIDE_HOURS)
  const weekend = day?.weekday === 'sat' || day?.weekday === 'sun'
  return useMemo(
    () =>
      dayPhase({
        date,
        today,
        ride: day?.bike ? { name: day.bike.name, minutes: day.bike.duration_min, pushable: d.bolt.kind !== 'na' } : null,
        checkedIn: isCheckedIn(d.checkin),
        boltReady: d.bolt.kind === 'ok',
        rideLog: stateOf(d.rideLog),
        hasActivity: d.activities.length > 0,
        hour: nowHour(),
        startHour: weekend ? hours.weekend : hours.weekday,
        hasRpe: d.rideLog?.rpe != null,
      }),
    [date, today, day, d.bolt.kind, d.checkin, d.rideLog, d.activities.length, hours, weekend],
  )
}
