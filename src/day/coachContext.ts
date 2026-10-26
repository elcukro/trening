/**
 * Kontekst rozmowy „Zapytaj trenera” (docs/23): zwięzły JSON z planu, jazd, check-inów i ustaleń o zawodniku,
 * który aplikacja wysyła z każdą wiadomością do Edge Function `coach-chat`. Czysty TS – testy w __tests__/coachContext.test.ts.
 * Kod liczy fakty (także sygnały luzowania), model je tylko czyta.
 */
import type { CalendarDay } from '@/engine/types'
import type { ISODate } from '@/engine/dates'
import { addDays } from '@/engine/dates'
import { restingHrAlarm } from '@/engine/rules'
import type { Checkin, PlanOverrideRow, SessionLog, StravaActivity } from '@/db'
import { WEEKDAY_LONG } from '@/lib/labels'

export interface CoachContextInput {
  today: ISODate
  /** dzień otwartego ekranu (zwykle dziś) */
  date: ISODate
  /** dni po nałożeniu nadpisań (okno wokół `date`) */
  window: CalendarDay[]
  checkins: Checkin[]
  logs: SessionLog[]
  activities: StravaActivity[]
  overrides: PlanOverrideRow[]
  athlete: { ftp: number | null; lthr: number | null; goal: string; coach_notes: string[]; weight_goal_kg: number | null }
  /** TSS/IF jazdy liczone w aplikacji (moc → tętno → RPE) */
  loadOf?: (a: StravaActivity) => { tss: number; if: number } | null
  /** stan planu na Bolcie – daty już wysłane */
  boltDates?: ISODate[]
}

export interface CoachContext {
  today: ISODate
  date: ISODate
  athlete: CoachContextInput['athlete'] & { weight_kg: number | null; weight_date: ISODate | null }
  days: {
    date: ISODate
    weekday: string
    week: number
    phase: string
    week_type: string
    day_type: string
    bike: { name: string; minutes: number; workout_id: string } | null
    flags: string[]
    /** wynik dnia dla dni ≤ dziś */
    outcome?: 'done' | 'modified' | 'skipped' | 'missed' | 'extra' | 'free' | 'pending'
    on_bolt?: boolean
  }[]
  rides: { date: ISODate; name: string | null; minutes: number; km: number; elevation_m: number; avg_w: number | null; np_w: number | null; avg_hr: number | null; tss: number | null; if: number | null; decoupling_pct: number | null; note: string | null }[]
  checkins: { date: ISODate; weight_kg: number | null; resting_hr: number | null; sleep: number | null; legs: number | null; motivation: number | null; sick: boolean; notes: string | null }[]
  logs: { date: ISODate; kind: string; status: string; rpe: number | null; notes: string | null }[]
  overrides: { date: ISODate; kind: string; payload: Record<string, unknown> }[]
  /** gotowe sygnały z kryteriów luzowania – model ma o nich mówić wprost */
  flags: string[]
}

const BACK = 14
const FORWARD = 7
const r1 = (x: number) => Math.round(x * 10) / 10
const num = (v: number | null | undefined) => (v == null ? null : Math.round(v))

export function buildCoachContext(inp: CoachContextInput): CoachContext {
  const from = addDays(inp.today, -BACK)
  const to = addDays(inp.today, FORWARD)
  const inRange = (d: string) => d >= from && d <= to
  const checkins = inp.checkins.filter((c) => !c.deleted_at && inRange(c.date)).toSorted((a, b) => (a.date < b.date ? -1 : 1))
  // tylko logi jazd – dawne logi siłowni (`kind: 'gym'`) zostają w historii, trener ich nie dostaje
  const logs = inp.logs.filter((l) => !l.deleted_at && l.kind === 'bike' && inRange(l.date))
  const acts = inp.activities.filter((a) => !a.deleted_at && a.is_ride && inRange(a.date)).toSorted((a, b) => (a.date < b.date ? -1 : 1))
  const bolt = new Set(inp.boltDates ?? [])

  const days: CoachContext['days'] = inp.window
    .filter((d) => d.date >= addDays(inp.today, -7) && d.date <= to)
    .toSorted((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => {
      const base = {
        date: d.date,
        weekday: WEEKDAY_LONG[d.weekday] ?? d.weekday,
        week: d.week,
        phase: d.phase,
        week_type: d.week_type,
        day_type: d.day_type,
        bike: d.bike ? { name: d.bike.name, minutes: d.bike.duration_min, workout_id: d.bike.workout_id } : null,
        flags: d.flags as string[],
      }
      if (d.date > inp.today) return bolt.has(d.date) ? { ...base, on_bolt: true } : base
      const log = d.bike ? logs.find((l) => l.date === d.date) : undefined
      const rode = acts.some((a) => a.date === d.date)
      let outcome: NonNullable<CoachContext['days'][number]['outcome']>
      if (log?.status === 'skipped') outcome = 'skipped'
      else if (log?.status === 'done' || log?.status === 'modified') outcome = log.status
      else if (!d.bike) outcome = rode ? 'extra' : 'free'
      else if (rode) outcome = 'done'
      else outcome = d.date === inp.today ? 'pending' : 'missed'
      return { ...base, outcome }
    })

  const lastWeigh = checkins.filter((c) => c.weight_kg != null).at(-1) ?? inp.checkins.filter((c) => !c.deleted_at && c.weight_kg != null).toSorted((a, b) => (a.date < b.date ? -1 : 1)).at(-1)

  const flags: string[] = []
  if (restingHrAlarm(checkins, inp.today) || restingHrAlarm(checkins, addDays(inp.today, -1))) flags.push('tętno spoczynkowe > średnia 7 dni + 7 bpm dwa dni z rzędu')
  const last2 = checkins.filter((c) => c.date >= addDays(inp.today, -1))
  if (last2.length === 2 && last2.every((c) => c.legs != null && c.legs <= 2)) flags.push('nogi ocenione na 1–2 dwa dni z rzędu')
  if (last2.length === 2 && last2.every((c) => c.sleep != null && c.legs != null && c.motivation != null && c.sleep + c.legs + c.motivation <= 6)) flags.push('suma ocen check-inu ≤ 6 dwa dni z rzędu')
  if (checkins.some((c) => c.sick && c.date >= addDays(inp.today, -3))) flags.push('choroba w ostatnich dniach')
  const missed = days.filter((d) => d.outcome === 'missed').length
  if (missed >= 2) flags.push(`${missed} treningi w ostatnim tygodniu bez jazdy i bez oznaczenia`)

  return {
    today: inp.today,
    date: inp.date,
    athlete: { ...inp.athlete, weight_kg: lastWeigh?.weight_kg ?? null, weight_date: lastWeigh?.date ?? null },
    days,
    rides: acts.map((a) => {
      const load = inp.loadOf?.(a) ?? null
      return {
        date: a.date,
        name: a.name ?? null,
        minutes: Math.round(a.moving_time_s / 60),
        km: r1((a.distance_m ?? 0) / 1000),
        elevation_m: Math.round(a.elevation_m ?? 0),
        avg_w: a.device_watts ? num(a.avg_watts) : null,
        np_w: a.device_watts ? num(a.np_w) : null,
        avg_hr: num(a.avg_hr),
        tss: load ? Math.round(load.tss) : null,
        if: load ? Math.round(load.if * 100) / 100 : null,
        decoupling_pct: a.decoupling_pct == null ? null : r1(a.decoupling_pct),
        note: a.note ? a.note.slice(0, 400) : null,
      }
    }),
    checkins: checkins.map((c) => ({ date: c.date, weight_kg: c.weight_kg, resting_hr: c.resting_hr, sleep: c.sleep, legs: c.legs, motivation: c.motivation, sick: !!c.sick, notes: c.notes ?? null })),
    logs: logs.map((l) => ({ date: l.date, kind: l.kind, status: l.status, rpe: l.rpe ?? null, notes: l.notes ?? null })),
    overrides: inp.overrides.filter((o) => !o.deleted_at && o.date >= from).map((o) => ({ date: o.date, kind: o.kind, payload: o.payload })),
    flags,
  }
}
