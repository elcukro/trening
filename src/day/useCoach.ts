/**
 * Dane do rozmowy z trenerem (docs/23): kontekst z bazy lokalnej i silnika oraz zależności narzędzi.
 * Sam czat (historia, pętla narzędzi) jest w `components/CoachSheet.tsx`.
 */
import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Checkin, type PlanOverrideRow, type SessionLog, type WahooPushRow } from '@/db'
import { fromWahoo, type RideRow } from '../../supabase/functions/_shared/rides'
import { addOverride, upsertCheckin, upsertSessionLog } from '@/db/repo'
import { rideLoad } from '@/engine/analysis'
import { addDays, type ISODate } from '@/engine/dates'
import { pushPayloadFor, wahoo } from '@/sync/wahoo'
import { supabase } from '@/sync/supabase'
import { todayISO } from '@/lib/dates'
import { buildCoachContext, type CoachContext } from './coachContext'
import type { CoachToolDeps } from './coachTools'
import type { IosDay } from './useIos'

export function useCoach(d: IosDay, date: ISODate): { context: () => CoachContext; deps: CoachToolDeps } {
  const today = todayISO()
  const from = addDays(today, -21)
  const to = addDays(today, 8)
  const checkins = useLiveQuery(async () => (await db.checkins.where('date').between(from, to, true, true).toArray()).filter((c) => !c.deleted_at), [from, to], [] as Checkin[])
  const logs = useLiveQuery(async () => (await db.session_logs.where('date').between(from, to, true, true).toArray()).filter((l) => !l.deleted_at), [from, to], [] as SessionLog[])
  // tylko Wahoo – dane Stravy nie trafiają do AI (docs/33)
  const rides = useLiveQuery(async () => (await db.wahoo_workouts.where('date').between(from, to, true, true).toArray()).filter((w) => !w.deleted_at).map((w) => fromWahoo(w as unknown as Record<string, unknown>)), [from, to], [] as RideRow[])
  const overrides = useLiveQuery(async () => (await db.plan_overrides.where('date').between(from, to, true, true).toArray()).filter((o) => !o.deleted_at), [from, to], [] as PlanOverrideRow[])
  const pushes = useLiveQuery(async () => (await db.wahoo_pushes.where('date').between(today, to, true, true).toArray()).filter((p) => !p.deleted_at && (p.status === 'created' || p.status === 'updated')), [today, to], [] as WahooPushRow[])

  const { ctx, weeks } = d.view.engine
  const { settings, program } = ctx

  const context = useCallback((): CoachContext => {
    const rpeOf = (a: RideRow) => logs.find((l) => l.date === a.date && l.kind === 'bike')?.rpe ?? undefined
    return buildCoachContext({
      today,
      date,
      window: d.view.window,
      checkins,
      logs,
      rides,
      overrides,
      boltDates: pushes.map((p) => p.date),
      athlete: { ftp: d.ftp, lthr: d.lthr, goal: program.goal.label, coach_notes: program.coach_notes ?? [], weight_goal_kg: settings.body_weight_target_kg ?? null },
      loadOf: (a) => rideLoad({ moving_s: a.moving_time_s, device_watts: a.device_watts, np_w: a.np_w, avg_watts: a.avg_watts, ftp: d.ftp, hr_histogram: a.hr_histogram, zones: program.hr_zones_lthr_fraction, lthr: d.lthr, rpe: rpeOf(a) }),
    })
  }, [today, date, d.view.window, d.ftp, d.lthr, checkins, logs, rides, overrides, pushes, program, settings.body_weight_target_kg])

  const deps = useMemo<CoachToolDeps>(
    () => ({
      today,
      window: d.view.window,
      upsertCheckin,
      upsertSessionLog,
      addOverride: (dt, kind, payload) => addOverride(dt, kind, payload),
      pushWahoo: async () => {
        if (!supabase) throw new Error('Aplikacja działa lokalnie – wysyłka wymaga konta.')
        const { items, remove } = await pushPayloadFor(today, 7, ctx, weeks)
        const res = await wahoo.push(items, 'update', remove)
        const errors = res.results.filter((r) => r.status === 'error').map((r) => `${r.date}: ${r.error === 'not_connected' ? 'Wahoo nie jest połączone (Ustawienia → Integracje)' : (r.error ?? 'błąd')}`)
        return { pushed: res.pushed, errors: [...new Set(errors)] }
      },
    }),
    [today, d.view.window, ctx, weeks],
  )

  return { context, deps }
}
