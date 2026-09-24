import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BaselineEntry, type Checkin, type KeyValueRow, type SessionLog, type StravaActivity, type WahooPushRow, type WahooWorkout } from '@/db'
import { upsertCheckin, upsertSessionLog, findSessionLog } from '@/db/repo'
import { useDayView } from '@/app/usePlan'
import { useDailyLoad } from '@/app/useLoad'
import { useEngine } from '@/app/useSettings'
import { buildCalendar } from '@/engine/calendar'
import { addDays, type ISODate } from '@/engine/dates'
import type { DayPlan } from '@/engine/plan'
import { isPushable } from '@/engine/wahoo'
import { pushItemForDay, wahoo } from '@/sync/wahoo'
import { supabase } from '@/sync/supabase'
import { loadStreams } from '@/sync/strava'
import { matchSteps, rideLoad, statusFromScore, type RideLoad } from '@/engine/analysis'
import { pmcSeries, weekTss } from '@/engine/pmc'
import { effectiveFtp, effectiveLthr, weightTrend } from '@/engine/progress'
import { cdaFromRide, goalPower } from '@/engine/baseline'
import { suggestFtp, type FtpSuggestion } from '@/engine/power'
import { onSyncStatus, type SyncStatus } from '@/sync/sync'
import { todayISO } from '@/lib/dates'
import { dayFlow, weighDue, type DayFlow, type LogState } from './dayState'
import type { BoltState } from '@/features/today/WahooStatus'

/* ------------------------------------------------------------------ tryb interfejsu */

export type UiMode = 'classic' | 'ios'
const UI_MODE_KEY = 'ui_mode'
/** Ucieczka do pełnej aplikacji na czas sesji – żeby przekierowanie nie odsyłało z powrotem. */
export const FULL_ESCAPE = 'trening:full-ui'
/** „Zobacz tylko plan, bez konta” – na czas sesji pomija ekran logowania. */
export const NO_ACCOUNT = 'trening:no-account'
/** Ten sam próg co `lg:` w pełnej aplikacji – powyżej jest boczna nawigacja i układ na komputer. */
const PHONE_MAX_PX = 1024

/**
 * Domyślnie: telefon i tablet otwierają uproszczony interfejs, komputer – pełną aplikację.
 * Szerokość czytamy raz przy wczytaniu modułu, żeby obracanie ekranu nie przerzucało widoku w trakcie pracy.
 */
const DEFAULT_MODE: UiMode = typeof window !== 'undefined' && window.innerWidth < PHONE_MAX_PX ? 'ios' : 'classic'

export function useUiMode(): { mode: UiMode; loaded: boolean; explicit: boolean; set: (m: UiMode) => Promise<void> } {
  // `?? null` jest konieczne: brak wiersza też zwraca `undefined`, a po tym rozpoznajemy „jeszcze nie wczytane”
  const row = useLiveQuery(async () => (await db.kv.get(UI_MODE_KEY)) ?? null, [], undefined)
  const set = useCallback(async (m: UiMode) => {
    await db.kv.put({ key: UI_MODE_KEY, value: m, updated_at: new Date().toISOString() })
    try {
      if (m === 'ios') sessionStorage.removeItem(FULL_ESCAPE)
    } catch {
      /* prywatne okno */
    }
  }, [])
  const saved = row?.value === 'ios' || row?.value === 'classic' ? (row.value as UiMode) : null
  return { mode: saved ?? DEFAULT_MODE, loaded: row !== undefined, explicit: saved !== null, set }
}

/** Stan synchronizacji z Supabase – do pokazania w „Więcej”. */
export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>({ state: 'idle', last_sync: null, pending: 0 })
  useEffect(() => onSyncStatus(setS), [])
  return s
}

/** Przejście do pełnej aplikacji – zaznacza, że przekierowanie na uproszczony widok ma odpuścić do końca sesji. */
export function useOpenFull(): (path: string) => void {
  const navigate = useNavigate()
  return useCallback(
    (path: string) => {
      try {
        sessionStorage.setItem(FULL_ESCAPE, '1')
      } catch {
        /* prywatne okno */
      }
      navigate(path + (typeof window === 'undefined' ? '' : window.location.search))
    },
    [navigate],
  )
}

/* ------------------------------------------------------------------ stan Bolta (bez zależności od DayPlan ≠ null) */

function useBolt(day: DayPlan | null): BoltState {
  const engine = useEngine()
  const row = useLiveQuery(
    async () => (day ? ((await db.wahoo_pushes.where('date').equals(day.date).toArray()).find((r) => !r.deleted_at) ?? null) : null),
    [day?.date],
    null as WahooPushRow | null,
  )
  if (!day?.bike || !isPushable(day.bike.workout_id)) return { kind: 'na' }
  if (!row) return { kind: 'missing' }
  if (row.status === 'error') return { kind: 'error', error: row.error ?? 'błąd wysyłki' }
  const current = pushItemForDay(day, engine.ctx)
  if (current && row.external_id && row.external_id !== current.external_id) return { kind: 'stale', when: row.updated_at }
  return { kind: 'ok', when: row.updated_at }
}

/* ------------------------------------------------------------------ dzień */

function stateOf(log: SessionLog | undefined): LogState {
  return (log?.status as LogState | undefined) ?? 'none'
}

export interface IosDay {
  view: ReturnType<typeof useDayView>
  day: DayPlan | null
  flow: DayFlow
  checkin: Checkin | undefined
  weighDue: boolean
  /** ostatnie ważenie przed tym dniem */
  lastWeight: { date: ISODate; kg: number } | null
  rideLog: SessionLog | undefined
  gymLog: SessionLog | undefined
  activities: StravaActivity[]
  bolt: BoltState
  ftp: number | null
  lthr: number | null
  loadOf: (a: StravaActivity) => RideLoad | null
  /** trening zapisany przez Bolta – pokazujemy, gdy tego dnia nie ma jazdy ze Stravy */
  boltWorkouts: WahooWorkout[]
  saveCheckin: (patch: Partial<Checkin>) => Promise<void>
  logRide: (status: 'done' | 'modified' | 'skipped', extra?: { rpe?: number | null; notes?: string | null }) => Promise<void>
  sendToBolt: () => Promise<'created' | 'updated'>
}

export function useIosDay(date: ISODate): IosDay {
  const view = useDayView(date)
  const day = view.day
  const engine = view.engine
  const checkin = useLiveQuery(async () => (await db.checkins.where('date').equals(date).toArray()).find((c) => !c.deleted_at), [date])
  const rideLog = useLiveQuery(async () => (await db.session_logs.where('[date+kind]').equals([date, 'bike']).toArray()).find((r) => !r.deleted_at), [date])
  const gymLog = useLiveQuery(async () => (await db.session_logs.where('[date+kind]').equals([date, 'gym']).toArray()).find((r) => !r.deleted_at), [date])
  const activities = useLiveQuery(async () => (await db.strava_activities.where('date').equals(date).toArray()).filter((a) => !a.deleted_at && a.is_ride), [date], [] as StravaActivity[])
  /** Ostatnie ważenie do tego dnia – podpowiada format (dziesiątki!) i datę w check-inie. */
  const lastWeight = useLiveQuery(
    async () => {
      const rows = (await db.checkins.where('date').below(date).toArray()).filter((c) => !c.deleted_at && c.weight_kg != null)
      const prev = rows.toSorted((a, b) => (a.date < b.date ? 1 : -1))[0]
      return prev ? { date: prev.date, kg: prev.weight_kg as number } : null
    },
    [date],
    null as { date: ISODate; kg: number } | null,
  )
  const boltWorkouts = useLiveQuery(async () => (await db.wahoo_workouts.where('date').equals(date).toArray()).filter((w) => !w.deleted_at), [date], [] as WahooWorkout[])
  const bolt = useBolt(day)

  const { settings, tests } = engine.ctx
  const ftp = settings.power_meter ? effectiveFtp(date, settings.ftp_w_estimate, tests ?? []).ftp : null
  const lthr = effectiveLthr(date, settings.lthr_bpm, (tests ?? []).filter((t): t is { date: string; lthr_bpm: number } => !!t.lthr_bpm)).lthr

  /** Obciążenie pojedynczej jazdy (moc → tętno → RPE). Dwie jazdy w jednym dniu liczą się osobno. */
  const loadOf = useCallback(
    (a: StravaActivity): RideLoad | null =>
      rideLoad({
        moving_s: a.moving_time_s,
        device_watts: a.device_watts,
        np_w: a.np_w,
        avg_watts: a.avg_watts,
        ftp,
        hr_histogram: a.hr_histogram,
        zones: engine.ctx.program.hr_zones_lthr_fraction,
        lthr,
        rpe: rideLog?.rpe ?? undefined,
      }),
    [ftp, lthr, engine.ctx.program.hr_zones_lthr_fraction, rideLog?.rpe],
  )

  const flow = useMemo(
    () =>
      dayFlow({
        date,
        today: todayISO(),
        ride: day?.bike ? { name: day.bike.name, minutes: day.bike.duration_min, pushable: isPushable(day.bike.workout_id) } : null,
        gym: day?.gym ? { name: day.gym.name } : null,
        checkedIn: !!checkin && (checkin.sleep != null || checkin.weight_kg != null || checkin.legs != null),
        boltReady: bolt.kind === 'ok',
        rideLog: stateOf(rideLog),
        gymLog: stateOf(gymLog),
        hasActivity: activities.length > 0,
      }),
    [date, day, checkin, bolt.kind, rideLog, gymLog, activities.length],
  )

  const saveCheckin = useCallback(async (patch: Partial<Checkin>) => void (await upsertCheckin(date, patch)), [date])

  /** Zapis wyniku dnia: jazda, a w dniu bez jazdy – sesja siłowa. */
  const logRide = useCallback(
    async (status: 'done' | 'modified' | 'skipped', extra?: { rpe?: number | null; notes?: string | null }) => {
      const gymOnly = !day?.bike && !!day?.gym
      const log = gymOnly ? gymLog : rideLog
      const minutes = activities.length ? Math.round(activities.reduce((s, a) => s + a.moving_time_s, 0) / 60) : gymOnly ? day?.gym?.est_min : day?.bike?.duration_min
      await upsertSessionLog(date, gymOnly ? 'gym' : 'bike', {
        planned_workout_id: (gymOnly ? day?.gym?.session : day?.bike?.workout_id) ?? null,
        status,
        rpe: extra?.rpe ?? log?.rpe ?? null,
        duration_min: status === 'skipped' ? (log?.duration_min ?? null) : (log?.duration_min ?? minutes ?? null),
        notes: extra?.notes ?? log?.notes ?? null,
      })
    },
    [date, day, rideLog, gymLog, activities],
  )

  const sendToBolt = useCallback(async () => {
    if (!supabase) throw new Error('Aplikacja działa lokalnie – wysyłka wymaga konfiguracji Supabase.')
    if (!day) throw new Error('Tego dnia nie ma w planie.')
    const item = pushItemForDay(day, engine.ctx)
    if (!item) throw new Error('Tego dnia nie ma czego wysłać.')
    const res = await wahoo.push([item])
    const r = res.results[0]
    if (!r || r.status === 'error') throw new Error(r?.error === 'not_connected' ? 'Najpierw połącz Wahoo w Ustawieniach → Integracje.' : (r?.error ?? 'nieznany błąd'))
    if (r.plan_linked === false) throw new Error('Trening utworzony, ale Wahoo nie podpięło do niego planu.')
    return r.status === 'updated' ? ('updated' as const) : ('created' as const)
  }, [day, engine.ctx])

  return {
    view,
    day,
    flow,
    checkin,
    weighDue: weighDue(lastWeight?.date ?? null, date),
    lastWeight,
    rideLog,
    gymLog,
    activities,
    bolt,
    ftp,
    lthr,
    loadOf,
    boltWorkouts,
    saveCheckin,
    logRide,
    sendToBolt,
  }
}

/* ------------------------------------------------------------------ zgodność jazdy z planem */

/**
 * Zgodność wykonania z planem – liczona raz i zapamiętana w `kv` (ten sam klucz co w pełnej aplikacji,
 * więc oba interfejsy pokazują tę samą liczbę). Bez strumieni po prostu zwraca `null`.
 */
export function useRideScore(activity: StravaActivity | undefined, day: DayPlan | null, ftp: number | null): number | null {
  const key = activity ? `analysis:${activity.id}` : null
  const saved = useLiveQuery(async () => (key ? ((await db.kv.get(key)) ?? null) : null), [key], null as KeyValueRow | null)
  const [computed, setComputed] = useState<{ id: string; score: number | null } | null>(null)
  const workout = day?.workout ?? null
  const savedScore = (saved?.value as { score: number | null } | undefined)?.score ?? null

  useEffect(() => {
    if (!activity || !workout || !key || !activity.has_streams) return
    if (saved !== null || computed?.id === activity.id) return
    let alive = true
    void (async () => {
      try {
        const s = await loadStreams(activity.id)
        if (!s || !alive) return
        const m = matchSteps(workout, s, { auto: true, ftp })
        setComputed({ id: activity.id, score: m.score })
        await db.kv.put({ key, value: { offset_s: m.offset_s, score: m.score }, updated_at: new Date().toISOString() })
        const log = await findSessionLog(activity.date, 'bike')
        if (log && m.score != null && log.status === 'done' && statusFromScore(m.score) === 'modified') await upsertSessionLog(activity.date, 'bike', { status: 'modified' })
      } catch {
        /* brak strumieni albo offline – po prostu bez oceny */
      }
    })()
    return () => {
      alive = false
    }
  }, [activity, workout, key, saved, computed, ftp])

  return savedScore ?? computed?.score ?? null
}

/* ------------------------------------------------------------------ liczby na ekran Postęp */

export interface Snapshot {
  weight: { kg: number | null; date: ISODate | null; perWeek: number | null }
  ftp: { w: number; source: 'test' | 'estimate'; suggestion: FtpSuggestion | null; wPerKg: number | null }
  form: { ctl: number; tsb: number } | null
  week: { planned: number; done: number; monday: ISODate }
  goal: { ftp: number; watts: number }
  hasData: boolean
}

export function useSnapshot(): Snapshot {
  const engine = useEngine()
  const today = todayISO()
  const { actual } = useDailyLoad(120)
  const checkins = useLiveQuery(async () => (await db.checkins.toArray()).filter((c) => !c.deleted_at && c.weight_kg != null), [], [] as Checkin[])
  const acts = useLiveQuery(async () => (await db.strava_activities.where('date').aboveOrEqual(addDays(today, -90)).toArray()).filter((a) => !a.deleted_at && a.is_ride), [today], [] as StravaActivity[])
  const dismissals = useLiveQuery(async () => (await db.kv.where('key').startsWith('ftp_dismiss:').toArray()).map((r) => r.key.slice('ftp_dismiss:'.length)), [], [] as string[])
  const baseline = useLiveQuery(async () => (await db.baseline_entries.toArray()).filter((b) => !b.deleted_at), [], [] as BaselineEntry[])
  const days = useMemo(() => buildCalendar(engine.ctx), [engine.ctx])

  const { settings, tests } = engine.ctx
  const ftpEff = effectiveFtp(today, settings.ftp_w_estimate, tests ?? [])

  const weightPoints = useMemo(() => checkins.map((c) => ({ date: c.date, weight_kg: c.weight_kg as number })).toSorted((a, b) => (a.date < b.date ? -1 : 1)), [checkins])
  const last = weightPoints.at(-1) ?? null
  const trend = useMemo(() => weightTrend(weightPoints), [weightPoints])

  const form = useMemo(() => {
    if (actual.size === 0) return null
    const from = addDays(today, -120)
    const s = pmcSeries({ days, program: engine.ctx.program, actual, today, from, to: today })
    const now = s.at(-1)
    return now ? { ctl: now.ctl, tsb: now.tsb } : null
  }, [actual, days, engine.ctx.program, today])

  const week = useMemo(() => weekTss(days, engine.ctx.program, actual, today, today), [days, engine.ctx.program, actual, today])

  const suggestion = useMemo(() => {
    const lastTest = (tests ?? []).filter((t) => t.ftp_w).map((t) => t.date).toSorted().at(-1) ?? null
    return suggestFtp(
      acts.map((a) => ({ id: a.id, date: a.date, name: a.name, device_watts: a.device_watts, mmp_w: a.mmp_w, moving_time_s: a.moving_time_s })),
      ftpEff.ftp,
      lastTest,
      new Set(dismissals),
    )
  }, [acts, ftpEff.ftp, tests, dismissals])

  // CdA z jazdy odniesienia zapisanej w punkcie wyjścia – ten sam wynik co karta „Punkt wyjścia” w pełnej aplikacji.
  // Bez tej pary silnik używa wartości domyślnej; szacowanie CdA z najlepszej godziny zwykłej jazdy zawyża opór.
  const goal = useMemo(() => {
    const massKg = (last?.weight_kg ?? settings.body_weight_start_kg) + settings.bike_and_kit_kg
    const latest = (metric: string) => baseline.filter((b) => b.metric === metric).toSorted((a, b) => (a.date < b.date ? 1 : -1))[0]?.value ?? null
    const kmh = latest('ref_speed_kmh')
    const watts = latest('ref_power_w')
    const cda = kmh && watts ? cdaFromRide(kmh, watts, massKg) : null
    return goalPower(massKg, 30, cda)
  }, [baseline, last?.weight_kg, settings.body_weight_start_kg, settings.bike_and_kit_kg])

  return {
    weight: { kg: last?.weight_kg ?? null, date: last?.date ?? null, perWeek: trend?.kg_per_week ?? null },
    ftp: { w: ftpEff.ftp, source: ftpEff.source, suggestion, wPerKg: last?.weight_kg ? ftpEff.ftp / last.weight_kg : null },
    form,
    week: { planned: week.planned, done: week.done, monday: week.monday },
    goal: { ftp: goal.ftp, watts: goal.watts },
    hasData: actual.size > 0,
  }
}
