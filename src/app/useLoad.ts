import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SessionLog } from '@/db'
import { useEngine } from './useSettings'
import { useRides } from './useRides'
import { rideLoad } from '@/engine/analysis'
import { plannedTss } from '@/engine/pmc'
import { buildCalendar } from '@/engine/calendar'
import { effectiveFtp, effectiveLthr } from '@/engine/progress'
import { addDays, type ISODate } from '@/engine/dates'
import { todayISO } from '@/lib/dates'

/**
 * Faktyczny TSS per dzień (pkt 4, docs/14): suma jazd (Wahoo, Strava bez bliźniaka; moc → tętno → RPE z logu dnia);
 * dzień oznaczony jako wykonany bez zapisanej jazdy liczy się jako TSS planowany (RPE × czas, gdy jest RPE).
 */
export function useDailyLoad(daysBack = 120): { actual: Map<ISODate, number>; today: ISODate } {
  const engine = useEngine()
  const today = todayISO()
  const from = addDays(today, -daysBack)
  const acts = useRides(from, today)
  const logs = useLiveQuery(() => db.session_logs.where('date').between(from, today, true, true).toArray(), [from, today], [] as SessionLog[])
  const actual = useMemo(() => {
    const { program, settings } = engine.ctx
    const tests = engine.ctx.tests ?? []
    const map = new Map<ISODate, number>()
    const withRide = new Set<ISODate>()
    const rpeByDate = new Map(logs.filter((l) => l.kind === 'bike' && !l.deleted_at && l.rpe).map((l) => [l.date, l.rpe as number]))
    for (const a of acts) {
      const ftp = effectiveFtp(a.date, settings.ftp_w_estimate, tests).ftp
      const lthr = effectiveLthr(a.date, settings.lthr_bpm, tests.filter((t): t is { date: string; lthr_bpm: number } => !!t.lthr_bpm)).lthr
      const load = rideLoad({ moving_s: a.moving_time_s, device_watts: a.device_watts, np_w: a.np_w, avg_watts: a.avg_watts, ftp, hr_histogram: a.hr_histogram, zones: program.hr_zones_lthr_fraction, lthr, rpe: rpeByDate.get(a.date) })
      withRide.add(a.date)
      if (load) map.set(a.date, (map.get(a.date) ?? 0) + load.tss)
    }
    // dni „wykonane” bez jazdy: RPE × czas, a bez RPE – TSS planowany
    const calendar = buildCalendar(engine.ctx)
    for (const l of logs) {
      if (l.deleted_at || l.kind !== 'bike' || withRide.has(l.date) || (l.status !== 'done' && l.status !== 'modified')) continue
      const day = calendar.find((d) => d.date === l.date)
      if (l.rpe && l.duration_min) {
        const load = rideLoad({ moving_s: l.duration_min * 60, rpe: l.rpe })
        if (load) map.set(l.date, load.tss)
      } else if (day) map.set(l.date, plannedTss(day, program))
    }
    return map
  }, [acts, logs, engine.ctx])
  return { actual, today }
}
