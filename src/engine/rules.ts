import type { Program } from './schema'
import type { CalendarDay, DayFlag, PlanOverride } from './types'
import { addDays, compareISO, diffDays, type ISODate } from './dates'
import { nutritionForDay } from './nutrition'
import { hrvAlarm } from './readiness'

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
  /** historyczne logi siłowni (kind 'gym', sprzed 26.10.2026) silnik pomija */
  kind: string
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
  /** HRV z nocy (Apple Health) – sygnał zmęczenia względem własnej normy, `readiness.ts` */
  hrv_ms?: number | null
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


function indoorReplacement(program: Program, day: CalendarDay): CalendarDay['bike'] {
  if (!day.bike) return null
  const id = day.bike.fallback_workout_id ?? (isKeyDay(day) ? 'INDOOR_4x4' : day.day_type === 'long' ? 'Z2' : 'Z2')
  const w = program.bike_workouts[id]
  if (!w) return day.bike
  const duration = id === 'INDOOR_4x4' ? w.duration_min : day.day_type === 'long' ? 90 : Math.min(day.bike.duration_min, 60)
  return { workout_id: id, name: `${w.name} (pod dachem)`, duration_min: duration, bike: program.bikes.indoor, fallback_workout_id: null }
}

// ---------------------------------------------------------------- nadpisania
type ByDate = Map<ISODate, PlanOverride[]>

/** Zamiany i przeniesienia od najstarszego; wpisy bez znacznika czasu (starsze dane, testy) idą pierwsze, po dacie. */
export function structuralInOrder(overrides: PlanOverride[]): PlanOverride[] {
  const key = (o: PlanOverride) => `${o.at ?? ''}|${o.date}|${o.id}`
  return overrides.filter((o) => o.kind === 'swap' || o.kind === 'move').toSorted((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

/**
 * Ponowna zamiana tej samej pary dni cofa poprzednią – ale tylko gdy to ostatnia zmiana dotykająca któregoś z nich
 * (inaczej usunięcie wcześniejszego wpisu zmieniłoby wynik późniejszych). Zwraca id wpisu do usunięcia albo null.
 */
export function swapToUndo(active: PlanOverride[], a: ISODate, b: ISODate): string | null {
  const touches = (o: PlanOverride) => {
    const other = String(o.kind === 'swap' ? (o.payload.swap_with ?? '') : (o.payload.to ?? ''))
    return o.date === a || o.date === b || other === a || other === b
  }
  const last = structuralInOrder(active).filter(touches).at(-1)
  if (!last || last.kind !== 'swap') return null
  const other = String(last.payload.swap_with ?? '')
  return (last.date === a && other === b) || (last.date === b && other === a) ? last.id : null
}

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
  // dni zmienione przez nadpisania dostają żywienie policzone na nowo (dzień bez jazdy ≠ „Dzień treningowy”)
  const touched = new Set<ISODate>()

  // Zamiany (R15) i przeniesienia (R1/R2) w kolejności, w jakiej je zrobiono: druga zamiana działa na tygodniu
  // już zmienionym przez pierwszą. Nakładane „po dacie” dawały inny układ niż ten, który użytkownik widział przy klikaniu.
  for (const o of structuralInOrder(overrides)) {
    const date = o.date
    if (o.kind === 'swap') {
      const other = String(o.payload.swap_with ?? '')
      const a = index.get(date)
      const b = index.get(other)
      if (a === undefined || b === undefined) continue
      const A = out[a]!
      const B = out[b]!
      const [fa, fb] = [sessionFlags(A), sessionFlags(B)]
      ;[A.bike, B.bike] = [B.bike, A.bike]

      ;[A.day_type, B.day_type] = [B.day_type, A.day_type]
      A.flags = withSessionFlags(A, fb)
      B.flags = withSessionFlags(B, fa)
      touched.add(A.date).add(B.date)
    } else {
      const to = String(o.payload.to ?? '')
      // stare przeniesienia sesji siłowej (`what: 'gym'`, sprzed 26.10.2026) nic już nie zmieniają
      if ((o.payload.what ?? 'bike') !== 'bike') continue
      const from = index.get(date)
      const target = index.get(to)
      if (from === undefined || target === undefined) continue
      const F = out[from]!
      const T = out[target]!
      // nie ma czego przenosić (np. jazda już przeniesiona gdzie indziej) – cel zostaje nietknięty
      if (!F.bike) continue
      touched.add(F.date).add(T.date)
      const moved = sessionFlags(F)
      T.bike = F.bike
      T.day_type = F.day_type
      T.flags = withSessionFlags(T, moved)
      F.bike = null
      F.day_type = 'rest'
      F.flags = weekFlags(F)
    }
  }

  // pozostałe nadpisania – per dzień
  for (const d of out) {
    for (const o of by.get(d.date) ?? []) {
      if (o.kind !== 'swap' && o.kind !== 'move') touched.add(d.date)
      switch (o.kind) {
        case 'indoor':
          d.bike = indoorReplacement(program, d)
          break
        case 'sick': {
          const level = String(o.payload.level ?? 'fever')
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
          break
        }
        case 'skip': {
          // stare pominięcie samej siłowni (`what: 'gym'`) nie rusza jazdy
          if (o.payload.what === 'gym') break
          d.bike = null
          d.day_type = 'rest'
          break
        }
        default:
          break
      }
    }
  }
  for (const d of out) if (touched.has(d.date)) d.nutrition = nutritionForDay(program.nutrition, d)
  return out
}

// ---------------------------------------------------------------- ostrzeżenia
function bikeLogFor(ctx: RuleContext, date: ISODate): LogLike | undefined {
  return ctx.logs.find((l) => l.date === date && l.kind === 'bike')
}

function wasSkipped(ctx: RuleContext, date: ISODate): boolean {
  if (compareISO(date, ctx.today) >= 0) return false
  const log = bikeLogFor(ctx, date)
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

/**
 * R1: akcent da się odrobić tylko na dzień ze spokojną jazdą i tak, żeby nie wypadły dwa akcenty
 * dzień po dniu. Bez znajomości dni tygodnia – o tym, który dzień jest akcentem, mówi kalendarz programu.
 */
function canTakeAccent(target: CalendarDay | undefined, next: CalendarDay | undefined): target is CalendarDay {
  return !!target && !!target.bike && target.day_type === 'easy' && !isProtectedDay(target) && !(next && isKeyDay(next))
}

/**
 * Ostrzeżenia i propozycje dla jednego dnia. `window` to dni wokół niego, już po nałożeniu nadpisań.
 * Minimum to bieżący tydzień.
 */
export function warningsFor(date: ISODate, window: CalendarDay[], ctx: RuleContext): RuleWarning[] {
  const out: RuleWarning[] = []
  const day = window.find((d) => d.date === date)
  if (!day) return out
  const at = (d: ISODate) => window.find((x) => x.date === d)

  // R1 – pominięty akcent rowerowy
  const yesterday = at(addDays(date, -1))
  const tomorrow = at(addDays(date, 1))
  if (yesterday && isKeyDay(yesterday) && wasSkipped(ctx, yesterday.date) && canTakeAccent(day, tomorrow)) {
    out.push({
      rule: 'R1',
      severity: 'info',
      message: `Wczorajszy akcent (${yesterday.bike?.name}) nie został wykonany. Możesz go przenieść na dziś zamiast ${day.bike!.name}.`,
      actions: [{ kind: 'move', date: yesterday.date, label: 'Przenieś akcent na dziś', payload: { to: date, what: 'bike' } }],
    })
  }
  // przeniesienie tylko na dzień z lekką jazdą – nigdy na dzień wolny ani tuż przed kolejnym akcentem
  if (isKeyDay(day) && compareISO(date, ctx.today) < 0 && wasSkipped(ctx, date)) {
    if (canTakeAccent(tomorrow, at(addDays(date, 2)))) {
      out.push({ rule: 'R1', severity: 'info', message: `Akcent nie został wykonany. Przenieś go na jutro (zamiast ${tomorrow.bike!.name}) albo odpuść – nigdy dwóch akcentów dzień po dniu.`, actions: [{ kind: 'move', date, label: 'Przenieś na jutro', payload: { to: tomorrow.date, what: 'bike' } }] })
    }
  }

  // R2 – pominięta długa jazda
  // dokąd wolno ją przenieść, mówi program (`rules.long_catchup_onto`); pusta lista = przepada
  if (yesterday && yesterday.day_type === 'long' && wasSkipped(ctx, yesterday.date) && day.bike && ctx.program.rules.long_catchup_onto.includes(day.day_type)) {
    out.push({
      rule: 'R2',
      severity: 'info',
      message: `Wczorajsza długa jazda (${yesterday.bike?.name}) nie doszła do skutku. Zrób ją dziś zamiast ${day.bike.name}.`,
      actions: [{ kind: 'move', date: yesterday.date, label: 'Przenieś długą jazdę na dziś', payload: { to: date, what: 'bike' } }],
    })
  }


  // R6 – słaby poranny check-in
  const todayCheckin = ctx.checkins.find((c) => c.date === date)
  const score = checkinScore(todayCheckin)
  const hrAlarm = restingHrAlarm(ctx.checkins, date)
  const hrvLow = hrvAlarm(ctx.checkins, date)
  if ((score !== null && score <= 6) || hrAlarm || hrvLow) {
    const why = hrAlarm
      ? 'Tętno spoczynkowe jest podwyższone drugi dzień z rzędu'
      : hrvLow
        ? 'HRV jest poniżej Twojej normy drugi dzień z rzędu'
        : `Suma ocen z check-inu to ${score} na 15`
    if (isKeyDay(day)) {
      out.push({
        rule: 'R6',
        severity: 'warn',
        message: `${why}. Obniż dzień: akcent na Z2 60 min.`,
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
      message: 'Zaznaczyłeś chorobę. Gorączka lub objawy poniżej szyi to zero treningu. Sam katar: tylko Z1 do 45 min.',
      actions: [
        { kind: 'sick', date, label: 'Gorączka – dzień wolny', payload: { level: 'fever' } },
        { kind: 'sick', date, label: 'Katar – tylko Z1 45 min', payload: { level: 'cold' } },
      ],
    })
  }


  // R12 – tydzień rozładowania
  if (day.flags.includes('deload') && day.bike) {
    out.push({ rule: 'R12', severity: 'info', message: ctx.program.rules.deload_note })
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

/** Walidacja zamiany dni (R15): w obrębie tygodnia, bez dwóch akcentów pod rząd. */
const NON_MOVABLE = new Set(['TRIP', 'TRAVEL_REST', 'REST'])

/** Dzień „Wolne” w kalendarzu: bez jazdy – jedyny dozwolony cel przeniesienia. */
export function isFreeDay(day: CalendarDay): boolean {
  return !day.bike
}

/**
 * R15 dla przeciągnięcia jazdy w kalendarzu: cel musi być dniem wolnym w tym samym miesiącu i nie w przeszłości;
 * po przeniesieniu nie mogą wypaść dwa akcenty dzień po dniu.
 * `warning` nie blokuje – informuje (R2: opuszczonej jednostki nie odrabiamy).
 */
export function validateMove(from: ISODate, to: ISODate, window: CalendarDay[], opts: { today?: ISODate } = {}): { ok: boolean; reason?: string; warning?: string } {
  const F = window.find((d) => d.date === from)
  const T = window.find((d) => d.date === to)
  if (!F?.bike || NON_MOVABLE.has(F.bike.workout_id)) return { ok: false, reason: 'Ten dzień nie ma jazdy do przeniesienia.' }
  if (!T) return { ok: false, reason: 'Cel jest poza planem.' }
  if (from === to) return { ok: false, reason: 'To ten sam dzień.' }
  if (from.slice(0, 7) !== to.slice(0, 7)) return { ok: false, reason: 'Przenoś tylko w obrębie jednego miesiąca.' }
  if (!isFreeDay(T)) return { ok: false, reason: 'Celem może być tylko dzień wolny (bez jazdy).' }
  if (opts.today && compareISO(to, opts.today) < 0) return { ok: false, reason: 'Nie przenoś treningu w przeszłość.' }

  const moved = sessionFlags(F)
  const after = window.map((d) =>
    d.date === from
      ? { ...d, bike: null, day_type: 'rest' as const, flags: weekFlags(d) }
      : d.date === to
        ? { ...d, bike: F.bike, day_type: F.day_type, flags: withSessionFlags(d, moved) }
        : d,
  )
  for (let i = 1; i < after.length; i++) {
    if (isKeyDay(after[i]!) && isKeyDay(after[i - 1]!)) return { ok: false, reason: 'Po przeniesieniu dwa akcenty wypadłyby dzień po dniu.' }
  }
  const warning = opts.today && compareISO(from, opts.today) < 0 ? 'To jednostka z przeszłości – R2 mówi, żeby jej nie odrabiać. Przenoś tylko, jeśli świadomie zmieniasz układ tygodnia.' : undefined
  return { ok: true, warning }
}

export function validateSwap(a: ISODate, b: ISODate, window: CalendarDay[]): { ok: boolean; reason?: string } {
  const A = window.find((d) => d.date === a)
  const B = window.find((d) => d.date === b)
  if (!A || !B) return { ok: false, reason: 'Zamiana działa tylko w obrębie jednego tygodnia.' }
  if (A.week !== B.week) return { ok: false, reason: 'Dni muszą być w tym samym tygodniu.' }
  const after = window.map((d) =>
    d.date === a
      ? { ...d, bike: B.bike, day_type: B.day_type, flags: withSessionFlags(d, sessionFlags(B)) }
      : d.date === b
        ? { ...d, bike: A.bike, day_type: A.day_type, flags: withSessionFlags(d, sessionFlags(A)) }
        : d,
  )
  for (let i = 1; i < after.length; i++) {
    if (isKeyDay(after[i]!) && isKeyDay(after[i - 1]!)) return { ok: false, reason: 'Po zamianie dwa akcenty wypadłyby dzień po dniu.' }
  }
  return { ok: true }
}
