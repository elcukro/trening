import type { GymSession, Program } from './schema'
import type { CalendarDay, DayFlag, PlanOverride } from './types'
import { addDays, compareISO, diffDays, type ISODate, type Weekday } from './dates'

/**
 * Reguły adaptacji R1–R16 działające na gotowym kalendarzu.
 * `applyOverrides` zmienia plan (co użytkownik zrobił z dniem), `warningsFor` tylko ostrzega i proponuje.
 * Silnik nie wie nic o UI ani o bazie – dostaje dni, nadpisania, logi i check-iny.
 */

export type Severity = 'info' | 'warn'

export interface RuleAction {
  kind: PlanOverride['kind']
  /** dzień, którego dotyczy proponowane nadpisanie */
  date: ISODate
  label: string
  payload: Record<string, unknown>
}

export interface RuleWarning {
  rule: string
  severity: Severity
  message: string
  actions?: RuleAction[]
}

export interface LogLike {
  date: ISODate
  kind: 'bike' | 'gym' | 'test'
  status: 'planned' | 'in_progress' | 'done' | 'modified' | 'skipped'
  rpe?: number | null
}

export interface CheckinLike {
  date: ISODate
  resting_hr?: number | null
  sleep?: number | null
  legs?: number | null
  motivation?: number | null
  sick?: boolean
}

export interface RuleContext {
  program: Program
  logs: LogLike[]
  checkins: CheckinLike[]
  /** dzisiejsza data – dni po niej to przyszłość (nie ostrzegamy o „pominięciu”) */
  today: ISODate
  weather?: { temp_c?: number | null; icy?: boolean }
}

// ---------------------------------------------------------------- pomocnicze
const LEG_SESSIONS = new Set(['A', 'B', 'C'])
const PROTECTED_FLAGS: DayFlag[] = ['test', 'mountain_weekend', 'back_to_back']
/** Znaczniki opisujące trening, nie tydzień – wędrują razem z treningiem przy zamianie i przeniesieniu. */
const SESSION_FLAGS: DayFlag[] = ['test', 'mountain_weekend', 'back_to_back', 'heat']

function sessionFlags(day: CalendarDay): DayFlag[] {
  return day.flags.filter((f) => SESSION_FLAGS.includes(f))
}

function weekFlags(day: CalendarDay): DayFlag[] {
  return day.flags.filter((f) => !SESSION_FLAGS.includes(f))
}

function withSessionFlags(day: CalendarDay, flags: DayFlag[]): DayFlag[] {
  return [...weekFlags(day), ...flags]
}

export function isKeyDay(day: CalendarDay): boolean {
  return day.day_type === 'key'
}

export function isProtectedDay(day: CalendarDay): boolean {
  return PROTECTED_FLAGS.some((f) => day.flags.includes(f)) || day.bike?.workout_id === 'BLOCK_DAY1'
}

/** Lżejsza wersja sesji: −1 seria, RIR +1 (R1, R6). */
export function lighterSession(session: GymSession, suffix = 'wersja lżejsza'): GymSession {
  return {
    ...session,
    name: `${session.name} – ${suffix}`,
    est_min: Math.round(session.est_min * 0.85),
    items: session.items.map((it) => {
      if (typeof it.rx.sets !== 'number' || it.rx.sets <= 1) return it
      const rir = it.rx.rir
      const nextRir = typeof rir === 'number' ? rir + 1 : typeof rir === 'string' && rir.includes('–') ? rir.split('–').map((x) => Number(x) + 1).join('–') : rir
      return { ...it, rx: { ...it.rx, sets: it.rx.sets - 1, ...(rir !== undefined ? { rir: nextRir } : {}) } }
    }),
  }
}

/** Wersja core, bez nóg (propozycja przy naruszeniu R9). */
export function coreOnlySession(session: GymSession): GymSession {
  const items = session.items.filter((it) => it.circuit || ['pallof_press', 'dead_bug', 'side_plank', 'plank_reach', 'copenhagen_plank', 'mobility_circuit', 'cooldown_stretch'].includes(it.exercise))
  return { ...session, session: 'CORE', name: 'Core i mobilność (zamiast nóg)', est_min: 20, items }
}

function indoorReplacement(program: Program, day: CalendarDay): CalendarDay['bike'] {
  if (!day.bike) return null
  const id = day.bike.fallback_workout_id ?? (isKeyDay(day) ? 'INDOOR_4x4' : day.day_type === 'long' ? 'Z2' : 'Z2')
  const w = program.bike_workouts[id]
  if (!w) return day.bike
  const duration = id === 'INDOOR_4x4' ? w.duration_min : day.day_type === 'long' ? 90 : Math.min(day.bike.duration_min, 60)
  return { workout_id: id, name: `${w.name} (pod dachem)`, duration_min: duration, bike: 'Wattbike / rowerek / wioślarz na siłowni', fallback_workout_id: null }
}

// ---------------------------------------------------------------- nadpisania
type ByDate = Map<ISODate, PlanOverride[]>

function group(overrides: PlanOverride[]): ByDate {
  const m: ByDate = new Map()
  for (const o of overrides) {
    const list = m.get(o.date) ?? []
    list.push(o)
    m.set(o.date, list)
  }
  return m
}

/**
 * Nakłada nadpisania na okno dni (zwykle tydzień). Zamiany i przeniesienia działają w obrębie okna.
 * Kolejność: swap → move → indoor/sick/downgrade/skip.
 */
export function applyOverrides(days: CalendarDay[], overrides: PlanOverride[], program: Program): CalendarDay[] {
  const out = days.map((d) => ({ ...d }))
  const index = new Map(out.map((d, i) => [d.date, i]))
  const by = group(overrides)

  // R15 – zamiana dwóch dni (rower + siłownia)
  for (const [date, list] of by) {
    for (const o of list) {
      if (o.kind !== 'swap') continue
      const other = String(o.payload.swap_with ?? '')
      const a = index.get(date)
      const b = index.get(other)
      if (a === undefined || b === undefined) continue
      const A = out[a]!
      const B = out[b]!
      const [fa, fb] = [sessionFlags(A), sessionFlags(B)]
      ;[A.bike, B.bike] = [B.bike, A.bike]
      ;[A.gym, B.gym] = [B.gym, A.gym]
      ;[A.day_type, B.day_type] = [B.day_type, A.day_type]
      ;[A.nutrition, B.nutrition] = [B.nutrition, A.nutrition]
      A.flags = withSessionFlags(A, fb)
      B.flags = withSessionFlags(B, fa)
    }
  }

  // R1/R3 – przeniesienie jednego elementu dnia
  for (const [date, list] of by) {
    for (const o of list) {
      if (o.kind !== 'move') continue
      const to = String(o.payload.to ?? '')
      const what = (o.payload.what as 'bike' | 'gym') ?? 'bike'
      const from = index.get(date)
      const target = index.get(to)
      if (from === undefined || target === undefined) continue
      const F = out[from]!
      const T = out[target]!
      if (what === 'bike') {
        const moved = sessionFlags(F)
        T.bike = F.bike
        T.day_type = F.day_type
        T.flags = withSessionFlags(T, moved)
        F.bike = null
        F.day_type = F.gym ? 'gym' : 'rest'
        F.flags = weekFlags(F)
      } else {
        T.gym = F.gym
        F.gym = null
        if (!F.bike) F.day_type = 'rest'
      }
    }
  }

  // pozostałe nadpisania – per dzień
  for (const d of out) {
    for (const o of by.get(d.date) ?? []) {
      switch (o.kind) {
        case 'indoor':
          d.bike = indoorReplacement(program, d)
          break
        case 'sick': {
          const level = String(o.payload.level ?? 'fever')
          d.gym = null
          if (level === 'fever') {
            d.bike = null
            d.day_type = 'rest'
          } else {
            const z1 = program.bike_workouts.Z1_RECOVERY
            d.bike = z1 ? { workout_id: 'Z1_RECOVERY', name: z1.name, duration_min: Math.min(45, d.bike?.duration_min ?? 45), bike: 'dowolny, bardzo luźno', fallback_workout_id: null } : null
            d.day_type = 'easy'
          }
          break
        }
        case 'downgrade': {
          if (isKeyDay(d) && d.bike) {
            const z2 = program.bike_workouts.Z2
            if (z2) d.bike = { ...d.bike, workout_id: 'Z2', name: z2.name, duration_min: 60, fallback_workout_id: null }
            d.day_type = 'easy'
          }
          if (d.gym) d.gym = lighterSession(d.gym)
          break
        }
        case 'skip': {
          const what = (o.payload.what as 'bike' | 'gym' | 'both') ?? 'both'
          if (what !== 'gym') d.bike = null
          if (what !== 'bike') d.gym = null
          if (!d.bike && !d.gym) d.day_type = 'rest'
          break
        }
        default:
          break
      }
    }
  }
  return out
}

// ---------------------------------------------------------------- ostrzeżenia
function logFor(ctx: RuleContext, date: ISODate, kind: 'bike' | 'gym'): LogLike | undefined {
  return ctx.logs.find((l) => l.date === date && l.kind === kind)
}

function wasSkipped(ctx: RuleContext, date: ISODate, kind: 'bike' | 'gym'): boolean {
  if (compareISO(date, ctx.today) >= 0) return false
  const log = logFor(ctx, date, kind)
  return !log || log.status === 'skipped' || log.status === 'planned'
}

function checkinScore(c: CheckinLike | undefined): number | null {
  if (!c || c.sleep == null || c.legs == null || c.motivation == null) return null
  return c.sleep + c.legs + c.motivation
}

/** R6 – tętno spoczynkowe ponad średnią 7-dniową + 7 bpm dwa dni z rzędu. */
export function restingHrAlarm(checkins: CheckinLike[], date: ISODate): boolean {
  const high = (d: ISODate): boolean => {
    const c = checkins.find((x) => x.date === d)
    if (!c?.resting_hr) return false
    const window = checkins.filter((x) => x.resting_hr && x.date < d && diffDays(d, x.date) <= 7)
    if (window.length < 3) return false
    const avg = window.reduce((a, x) => a + (x.resting_hr as number), 0) / window.length
    return c.resting_hr > avg + 7
  }
  return high(date) && high(addDays(date, -1))
}

const WEEKDAY_PL: Record<Weekday, string> = { mon: 'poniedziałek', tue: 'wtorek', wed: 'środę', thu: 'czwartek', fri: 'piątek', sat: 'sobotę', sun: 'niedzielę' }

/**
 * Ostrzeżenia i propozycje dla jednego dnia. `window` to dni wokół niego, już po nałożeniu nadpisań.
 * Minimum to bieżący tydzień; R7 potrzebuje dwóch tygodni wstecz, żeby zobaczyć nieudane akcenty.
 */
export function warningsFor(date: ISODate, window: CalendarDay[], ctx: RuleContext): RuleWarning[] {
  const out: RuleWarning[] = []
  const day = window.find((d) => d.date === date)
  if (!day) return out
  const at = (d: ISODate) => window.find((x) => x.date === d)

  // R9 – 48 h ochrony przed testem, górami, back-to-back i blokiem
  if (day.gym && LEG_SESSIONS.has(day.gym.session)) {
    for (let i = 1; i <= 2; i++) {
      const next = at(addDays(date, i))
      if (!next || !isProtectedDay(next)) continue
      const safe = [-3, -2, -1].map((k) => at(addDays(next.date, k))).find((d) => d && !d.gym && diffDays(next.date, d.date) >= 3)
      out.push({
        rule: 'R9',
        severity: 'warn',
        message: `Sesja ${day.gym.session} mniej niż 48 h przed: ${next.event ?? (next.flags.includes('test') ? 'testem' : 'ciężkim weekendem')}. Nogi nie zdążą odpocząć.`,
        actions: [
          ...(safe ? [{ kind: 'move' as const, date, label: `Przenieś na ${WEEKDAY_PL[safe.weekday]} ${safe.date.slice(8)}.${safe.date.slice(5, 7)}`, payload: { to: safe.date, what: 'gym' } }] : []),
          { kind: 'downgrade', date, label: 'Zamień na core i mobilność', payload: { to_core: true } },
        ],
      })
      break
    }
  }

  // R1 – pominięty akcent rowerowy
  const yesterday = at(addDays(date, -1))
  if (yesterday && isKeyDay(yesterday) && wasSkipped(ctx, yesterday.date, 'bike') && day.bike && !isKeyDay(day)) {
    out.push({
      rule: 'R1',
      severity: 'info',
      message: `Wczorajszy akcent (${yesterday.bike?.name}) nie został wykonany. Możesz go przenieść na dziś zamiast ${day.bike.name}. Wtedy jutrzejsza Sesja B lżejsza.`,
      actions: [{ kind: 'move', date: yesterday.date, label: 'Przenieś akcent na dziś', payload: { to: date, what: 'bike' } }],
    })
  }
  if (isKeyDay(day) && compareISO(date, ctx.today) < 0 && wasSkipped(ctx, date, 'bike')) {
    const thu = at(addDays(date, 1))
    if (thu && !isKeyDay(thu)) {
      out.push({ rule: 'R1', severity: 'info', message: 'Akcent nie został wykonany. Przenieś go na jutro (zamiast Z2) albo odpuść – nigdy dwóch akcentów dzień po dniu.', actions: [{ kind: 'move', date, label: 'Przenieś na jutro', payload: { to: thu.date, what: 'bike' } }] })
    }
  }

  // R2 – pominięta długa jazda
  if (day.weekday === 'sun' && day.bike) {
    const sat = at(addDays(date, -1))
    if (sat && sat.day_type === 'long' && wasSkipped(ctx, sat.date, 'bike')) {
      out.push({
        rule: 'R2',
        severity: 'info',
        message: `Sobotnia długa jazda (${sat.bike?.name}) nie doszła do skutku. Zrób ją dziś zamiast ${day.bike.name}.`,
        actions: [{ kind: 'move', date: sat.date, label: 'Przenieś długą jazdę na dziś', payload: { to: date, what: 'bike' } }],
      })
    }
  }

  // R3 – pominięta sesja siłowa
  const gymMissed = window.filter((d) => compareISO(d.date, date) < 0 && diffDays(date, d.date) <= 2 && d.gym && wasSkipped(ctx, d.date, 'gym'))
  for (const m of gymMissed) {
    if (m.gym!.session === 'A' || m.gym!.session === 'C') {
      if (!day.gym && day.day_type !== 'key') {
        out.push({ rule: 'R3', severity: 'info', message: `Sesja ${m.gym!.session} z ${WEEKDAY_PL[m.weekday]} nie została zrobiona. Możesz ją zrobić dziś.`, actions: [{ kind: 'move', date: m.date, label: 'Przenieś sesję na dziś', payload: { to: date, what: 'gym' } }] })
      }
    } else if (m.gym!.session === 'B') {
      out.push({ rule: 'R3', severity: 'info', message: 'Sesja B przepada w tym tygodniu – nie przenoś jej na sobotę. W przyszłym tygodniu wracasz do planu.' })
    }
  }

  // R6 – słaby poranny check-in
  const todayCheckin = ctx.checkins.find((c) => c.date === date)
  const score = checkinScore(todayCheckin)
  const hrAlarm = restingHrAlarm(ctx.checkins, date)
  if ((score !== null && score <= 6) || hrAlarm) {
    const why = hrAlarm ? 'Tętno spoczynkowe jest podwyższone drugi dzień z rzędu' : `Suma ocen z check-inu to ${score} na 15`
    if (isKeyDay(day) || day.gym) {
      out.push({
        rule: 'R6',
        severity: 'warn',
        message: `${why}. Obniż dzień: akcent na Z2 60 min, siłownia o serię mniej i RIR wyżej.`,
        actions: [{ kind: 'downgrade', date, label: 'Obniż dzisiejszy trening', payload: {} }],
      })
    } else {
      out.push({ rule: 'R6', severity: 'info', message: `${why}. Dziś i tak jest lekko – jedź spokojnie albo odpocznij.` })
    }
  }
  if (todayCheckin?.sick) {
    out.push({
      rule: 'R5',
      severity: 'warn',
      message: 'Zaznaczyłeś chorobę. Gorączka lub objawy poniżej szyi to zero treningu. Sam katar: tylko Z1 do 45 min, bez siłowni.',
      actions: [
        { kind: 'sick', date, label: 'Gorączka – dzień wolny', payload: { level: 'fever' } },
        { kind: 'sick', date, label: 'Katar – tylko Z1 45 min', payload: { level: 'cold' } },
      ],
    })
  }

  // R7 – dwa tygodnie akcentów, które nie wyszły
  const failedKeys = ctx.logs.filter((l) => l.kind === 'bike' && (l.status === 'skipped' || (l.status === 'modified' && (l.rpe ?? 0) >= 9)) && compareISO(l.date, date) <= 0 && diffDays(date, l.date) <= 14)
  const failedKeyDays = failedKeys.filter((l) => window.find((d) => d.date === l.date && isKeyDay(d)))
  if (day.gym && failedKeyDays.length >= 2) {
    out.push({ rule: 'R7', severity: 'info', message: 'Dwa akcenty rowerowe z rzędu nie wyszły. Rower ma pierwszeństwo: zrób o jedną serię mniej w sesjach siłowych do końca bloku.' })
  }

  // R12 – tydzień rozładowania
  if (day.flags.includes('deload') && (day.bike || day.gym)) {
    out.push({ rule: 'R12', severity: 'info', message: 'Tydzień lżejszy: bez interwałów poza środą, objętość niżej o 40%. Na siłowni ciężar −10%, serie −40%, RIR +1. Nogi mają wyjść świeższe.' })
  }

  // R13 – upał
  const temp = ctx.weather?.temp_c
  if (day.bike && ((temp != null && temp > 28) || day.flags.includes('heat'))) {
    out.push({ rule: 'R13', severity: 'info', message: 'Upał: cele tętna w Z2–SS niżej o 3–5 uderzeń, 750 ml płynu z elektrolitami na godzinę. Przy VO2max skróć do 4 powtórzeń.' })
  }

  // R4 – warunki zimowe
  if (day.bike && ctx.weather?.icy) {
    out.push({
      rule: 'R4',
      severity: 'warn',
      message: 'Gołoledź albo mróz poniżej −5 °C. Przenieś trening pod dach.',
      actions: [{ kind: 'indoor', date, label: 'Wersja pod dachem', payload: {} }],
    })
  }

  return out
}

/** Walidacja zamiany dni (R15): w obrębie tygodnia, bez dwóch akcentów pod rząd, z pilnowaniem R9. */
export function validateSwap(a: ISODate, b: ISODate, window: CalendarDay[]): { ok: boolean; reason?: string } {
  const A = window.find((d) => d.date === a)
  const B = window.find((d) => d.date === b)
  if (!A || !B) return { ok: false, reason: 'Zamiana działa tylko w obrębie jednego tygodnia.' }
  if (A.week !== B.week) return { ok: false, reason: 'Dni muszą być w tym samym tygodniu.' }
  const after = window.map((d) =>
    d.date === a
      ? { ...d, bike: B.bike, gym: B.gym, day_type: B.day_type, flags: withSessionFlags(d, sessionFlags(B)) }
      : d.date === b
        ? { ...d, bike: A.bike, gym: A.gym, day_type: A.day_type, flags: withSessionFlags(d, sessionFlags(A)) }
        : d,
  )
  for (const d of after) {
    if (!d.gym || !LEG_SESSIONS.has(d.gym.session)) continue
    for (let i = 1; i <= 2; i++) {
      const next = after.find((x) => x.date === addDays(d.date, i))
      if (next && isProtectedDay(next)) return { ok: false, reason: `Po zamianie Sesja ${d.gym.session} wypadłaby mniej niż 48 h przed ciężkim dniem (${next.date.slice(8)}.${next.date.slice(5, 7)}).` }
    }
  }
  for (let i = 1; i < after.length; i++) {
    if (isKeyDay(after[i]!) && isKeyDay(after[i - 1]!)) return { ok: false, reason: 'Po zamianie dwa akcenty wypadłyby dzień po dniu.' }
  }
  return { ok: true }
}
