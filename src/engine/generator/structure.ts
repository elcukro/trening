import type { BikeWorkout, WeekTemplate } from '../schema'
import type { PhaseId, WeekType } from '../types'
import { WEEKDAYS, addDays, diffDays, mondayOf, weekdayIndex, type ISODate, type Weekday } from '../dates'
import type { PlanInputs } from '../onboarding'
import { LADDERS, testIdFor, type LadderId } from './library'
import { templateById, type TemplateId } from './templates'
import { defaultTuning, maxKeySessions, type PlanTuning } from './tuning'

/**
 * Szkielet planu (docs/32 § 2): ile tygodni, które są rozładowaniem, testem i taperem, jaka faza i objętość,
 * a potem wypełnienie każdego tygodnia dniami (długa, akcenty, Z2, wolne) w ramach limitów dnia.
 * Czysty TS, deterministyczny: te same wejścia dają ten sam plan.
 */

export const MAX_WEEKS = 52
export const MIN_WEEKS = 2

export type Horizon = 'to_goal' | 'rolling'

export interface WeekSkeleton {
  index: number
  type: WeekType
  phase: PhaseId
  /** budżet minut jazdy w tygodniu (bez dnia celu) */
  minutes: number
  /** numer tygodnia budującego w fazie (0 = pierwszy) – wybiera szczebel drabinki */
  buildNo: number
  /** w tym tygodniu jest test kalibracyjny */
  test: boolean
  /** ostatni tydzień tapera (pobudzenie zamiast akcentu) */
  lastTaper: boolean
}

export interface Skeleton {
  program_start: ISODate
  trip_start: ISODate
  horizon: Horizon
  weeks: WeekSkeleton[]
  /** co ile tygodni rozładowanie */
  block: number
}

const PERFORMANCE = new Set(['event', 'ftp', 'speed'])

/** Start planu: ten poniedziałek, chyba że tydzień już się kończy (pt–nd) – wtedy następny. */
export function programStart(today: ISODate): ISODate {
  const monday = mondayOf(today)
  return weekdayIndex(today) >= 4 ? addDays(monday, 7) : monday
}

function totalWeeks(inp: PlanInputs, start: ISODate): { count: number; horizon: Horizon } {
  const date = 'date' in inp.goal ? inp.goal.date : null
  if (date && date >= start) {
    const n = Math.floor(diffDays(date, start) / 7) + 1
    if (n > MAX_WEEKS) return { count: MAX_WEEKS, horizon: 'rolling' }
    return { count: Math.max(MIN_WEEKS, n), horizon: 'to_goal' }
  }
  const g = inp.goal
  let n = 16
  if (g.type === 'fitness') n = g.weeks
  else if (g.type === 'comeback') n = g.weeks_off > 26 ? 16 : 12
  return { count: Math.min(MAX_WEEKS, Math.max(4, n)), horizon: 'rolling' }
}

const round5 = (m: number) => Math.round(m / 5) * 5
const floor5 = (m: number) => Math.floor(m / 5) * 5

export function buildSkeleton(inp: PlanInputs, today: ISODate, t: PlanTuning = defaultTuning(inp)): Skeleton {
  const start = programStart(today)
  const { count: T, horizon } = totalWeeks(inp, start)
  const date = 'date' in inp.goal ? inp.goal.date : null
  const trip_start = horizon === 'to_goal' && date ? date : addDays(start, T * 7 - 1)
  const perf = PERFORMANCE.has(inp.goal.type)
  const block = t.block_weeks
  const [splitBase, splitBuild] = templateById(t.template).phase_split
  const taper = perf && horizon === 'to_goal' && inp.intensity_allowed ? (T >= 10 ? 2 : T >= 5 ? 1 : 0) : 0
  const middle = T - 1 - taper
  const testOk = inp.intensity_allowed

  const phaseOf = (j: number): PhaseId => {
    if (!inp.intensity_allowed) return 'I'
    const blockStart = Math.floor((j - 1) / block) * block + 1
    const f = (blockStart - 1) / Math.max(1, middle)
    if (perf) {
      if (middle < 6) return 'I'
      if (middle < 10) return f < 0.6 ? 'I' : 'II'
      return f < splitBase ? 'I' : f < splitBuild ? 'II' : 'III'
    }
    return middle >= 10 && f >= 0.5 ? 'II' : 'I'
  }

  const startMin = inp.start_weekly_hours * 60
  // objętość z dopasowania: % dostępnych godzin, nigdy więcej (100 % = jak przed szablonami)
  const targetMin = (inp.weekly_hours * 60 * t.volume_pct) / 100
  const ramp = t.ramp_pct / 100

  const weeks: WeekSkeleton[] = []
  const week0Test = testOk && !inp.cautious
  weeks.push({ index: 0, type: week0Test ? 'test' : 'prep', phase: 'PREP', minutes: round5(Math.min(startMin, targetMin) * 0.7), buildNo: 0, test: week0Test, lastTaper: false })

  let cur = startMin
  let lastBuild = startMin
  let buildNo = 0
  let lastPhase: PhaseId = 'PREP'
  const testEvery = t.test_every_blocks * block
  const firstTestAt = week0Test ? testEvery + 1 : block + 1
  for (let j = 1; j <= middle; j++) {
    const phase = phaseOf(j)
    if (phase !== lastPhase) {
      buildNo = 0
      lastPhase = phase
    }
    const deload = j % block === 0 && j < middle
    const nearEnd = taper > 0 && j > middle - 2
    const test = testOk && !deload && !nearEnd && j >= firstTestAt && (j - firstTestAt) % testEvery === 0
    let minutes: number
    if (deload) minutes = round5(lastBuild * 0.65)
    else {
      minutes = cur
      lastBuild = cur
      cur = Math.min(targetMin, cur * (1 + ramp))
      if (test) minutes *= 0.9
      // blok VO2max (cel mocowy, faza III): intensywność w górę, objętość w dół
      if (phase === 'III' && inp.goal.type === 'ftp') minutes *= 0.85
    }
    weeks.push({ index: j, type: deload ? 'deload' : test ? 'test' : 'build', phase, minutes: round5(minutes), buildNo, test, lastTaper: false })
    if (!deload) buildNo += 1
  }
  for (let k = 0; k < taper; k++) {
    const last = k === taper - 1
    const factor = taper === 2 && !last ? 0.6 : 0.45
    const finalTest = last && testOk && inp.goal.type !== 'event'
    weeks.push({ index: weeks.length, type: finalTest ? 'test' : 'taper', phase: 'TAPER', minutes: round5(lastBuild * factor), buildNo: 0, test: finalTest, lastTaper: last })
  }
  return { program_start: start, trip_start, horizon, weeks, block }
}

/* ------------------------------------------------------------------ układ dni */

export interface DayLayout {
  days: Weekday[]
  long: Weekday | null
  keys: Weekday[]
  easy: Weekday[]
  commute: Weekday[]
  group: Weekday | null
  race: Weekday | null
  /** dzień testu w tygodniu kalibracyjnym (ostatni dostępny, który zmieści test) */
  calibration: Weekday | null
}

const adjacent = (a: Weekday, b: Weekday) => {
  const d = Math.abs(WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
  return d === 1 || d === 6
}

/**
 * Stały układ tygodnia: długa jazda w dniu z największym limitem (remis: weekend, potem późniejszy dzień),
 * akcenty w dniach z największym zapasem, nigdy dzień po dniu i w miarę możliwości nie obok długiej;
 * dojazdy i jazda z grupą zostają tam, gdzie są.
 */
export function layoutDays(inp: PlanInputs, keyCount: number, testMin: number, fixedDays: Pick<PlanTuning, 'long_day' | 'key_days'> = { long_day: null, key_days: null }): DayLayout {
  const caps = inp.day_caps_min
  const days = WEEKDAYS.filter((d) => caps[d] > 0)
  const fixed = (kind: string) => inp.fixed.find((f) => f.kind === kind && caps[f.day] > 0)?.day ?? null
  const commute = inp.fixed.filter((f) => f.kind === 'commute' && caps[f.day] > 0).map((f) => f.day)
  const group = fixed('group_ride')
  const race = fixed('race')
  const other = fixed('other')
  const free = days.filter((d) => !commute.includes(d))
  const score = (d: Weekday) => caps[d] * 10 + (d === 'sat' ? 6 : d === 'sun' ? 5 : 0) + WEEKDAYS.indexOf(d) * 0.1
  const byCap = [...free].toSorted((a, b) => score(b) - score(a))
  let long: Weekday | null = byCap[0] ?? null
  // jazda z grupą o limicie zbliżonym do najdłuższego dnia staje się długą jazdą tygodnia
  if (group && long && group !== long && caps[group] >= caps[long] * 0.8) long = group
  // stała jazda „inne” o podobnym limicie też staje się długą jazdą (np. wolny poniedziałek z długą trasą)
  else if (other && long && other !== long && caps[other] >= caps[long] * 0.8) long = other
  // dni wskazane w dopasowaniu (sprawdzone w `clampTuning`): długa i akcenty tam, gdzie zawodnik chce
  if (fixedDays.long_day && free.includes(fixedDays.long_day)) long = fixedDays.long_day
  if (free.length === 1) keyCount = 0

  const keys: Weekday[] = []
  if (race && race !== long) keys.push(race)
  const candidates = free.filter((d) => d !== long && d !== group && d !== race && d !== other)
  // akcent dzień po długiej jeździe jest najgorszy (zmęczone nogi psują jakość) – gdy nie da się inaczej, wolimy dzień przed
  const afterLong = (d: Weekday) => (long ? WEEKDAYS[(WEEKDAYS.indexOf(long) + 1) % 7] === d : false)
  const pick = (allowNextToLong: boolean) =>
    candidates
      .filter((d) => !keys.includes(d) && !keys.some((k) => adjacent(k, d)) && (allowNextToLong || !long || !adjacent(long, d)))
      .toSorted((a, b) => Number(afterLong(a)) - Number(afterLong(b)) || caps[b] - caps[a] || WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))[0]
  for (const k of fixedDays.key_days ?? []) if (keys.length < keyCount && candidates.includes(k) && !keys.includes(k)) keys.push(k)
  while (keys.length < keyCount) {
    const d = pick(false) ?? pick(true)
    if (!d) break
    keys.push(d)
  }
  const easy = free.filter((d) => d !== long && !keys.includes(d))
  // test kalibracyjny: ostatni dzień tygodnia, który go zmieści (świeże nogi po dniach lekkich)
  const calibration = [...free].toReversed().find((d) => caps[d] >= testMin) ?? null
  return { days, long, keys, easy, commute, group, race, calibration }
}

/* ------------------------------------------------------------------ wypełnienie tygodnia */

export interface FillContext {
  inp: PlanInputs
  /** szablon planu (drabinki akcentów per faza) */
  template?: TemplateId
  layout: DayLayout
  lib: Record<string, BikeWorkout>
  /** stan przenoszony między tygodniami: ostatnia długa (progresja +20 min/tydz.) */
  state: {
    lastLong: number
    /** poprzedni tydzień skończył się akcentem albo testem w niedzielę – poniedziałkowy akcent wypada */
    lastKeySunday: boolean
  }
}

type Slot = [string, number | null] | null

/**
 * Drabinka akcentu dla fazy i celu wg szablonu (`data/templates/plan_templates.json`); `second` = drugi akcent tygodnia
 * (zawsze łagodniejszy). Ostrożny zawodnik dostaje sweet spot i tempo niezależnie od szablonu (granica kodu).
 */
export function ladderFor(inp: PlanInputs, phase: PhaseId, second: boolean, template: TemplateId = 'pyramidal'): LadderId {
  const l = templateById(template).ladders
  const pick = (p: readonly [LadderId, LadderId]) => p[second ? 1 : 0]
  if (inp.cautious) return second ? 'tempo' : 'sweet_spot'
  if (phase === 'I' || phase === 'PREP') return pick(l.base)
  if (phase === 'II') return pick(l.build)
  // faza III – specyfika celu
  const g = inp.goal
  if (g.type === 'ftp') return pick(l.specific.ftp)
  if (g.type === 'speed') return pick(l.specific.speed)
  if (g.type === 'event') return pick(g.elevation_m / Math.max(1, g.distance_km) >= 12 ? l.specific.event_hilly : l.specific.event)
  return pick(l.specific.other)
}

/** Najwyższy szczebel drabinki, który mieści się w limicie dnia i nie przeskakuje progresji (`buildNo`). */
export function pickRung(lib: Record<string, BikeWorkout>, ladder: LadderId, buildNo: number, capMin: number, experience: PlanInputs['experience']): string | null {
  const rungs = LADDERS[ladder]
  // nowicjusz wchodzi na drabinkę wolniej (co drugi tydzień szczebel wyżej)
  const idx = Math.min(rungs.length - 1, experience === 'novice' ? Math.floor(buildNo / 2) : buildNo)
  for (let i = idx; i >= 0; i--) {
    const id = rungs[i]![0]
    if (lib[id]!.duration_min <= capMin) return id
  }
  return null
}

/** `cap` = ile minut ma ten dzień: limit dnia albo reszta budżetu tygodnia, gdy jest mniejsza. */
function keySlot(ctx: FillContext, wk: WeekSkeleton, day: Weekday, second: boolean, cap: number): Slot {
  const { inp, lib, layout } = ctx
  if (layout.race === day) return cap >= 45 ? ['RACE', Math.min(cap, 120)] : ['Z2', 0]
  // rozładowanie, tydzień testowy i taper: jeden akcent, drugi wypada (dzień spokojny albo wolny)
  if (second && (wk.type === 'deload' || wk.test || wk.phase === 'TAPER')) return ['Z2', 0]
  if (wk.type === 'deload') return cap < 45 ? ['Z2', 0] : ['DELOAD', Math.min(cap, 60)]
  if (wk.type === 'taper' || (wk.phase === 'TAPER' && !wk.test)) {
    if (wk.lastTaper) return lib.OPENERS!.duration_min <= cap ? ['OPENERS', null] : ['Z2', 0]
    const id = pickRung(lib, ladderFor(inp, 'I', second, ctx.template), 0, cap, inp.experience)
    return id ? [id, null] : ['Z2', 0]
  }
  const id = pickRung(lib, ladderFor(inp, wk.phase, second, ctx.template), wk.buildNo, cap, inp.experience)
  return id ? [id, null] : ['Z2', 0]
}

const slotMinutes = (lib: Record<string, BikeWorkout>, s: Slot): number => (s ? (s[1] ?? lib[s[0]]!.duration_min) : 0)

/**
 * Tydzień jako szablon: najpierw to, co stałe (dojazdy, akcenty, test), potem długa jazda, a resztę budżetu
 * dostają dni spokojne proporcjonalnie do limitów. Suma nigdy nie przekracza budżetu tygodnia ani limitu dnia;
 * dzień, któremu zostało mniej niż 30 min, jest wolny.
 */
export function fillWeek(ctx: FillContext, wk: WeekSkeleton): WeekTemplate {
  const { inp, layout, lib } = ctx
  const caps = inp.day_caps_min
  const slots: Record<Weekday, Slot> = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }
  let budget = wk.minutes

  for (const d of layout.commute) {
    slots[d] = ['COMMUTE', Math.min(caps[d], 45)]
    budget -= slotMinutes(lib, slots[d])
  }

  const testId = testIdFor(inp.measure)
  const calibration = wk.index === 0
  const easyDays = [...layout.easy]
  const keyDays: Weekday[] = []
  if (calibration) {
    // tydzień kalibracyjny: tylko jazdy spokojne i test na końcu
    if (wk.test && layout.calibration) {
      slots[layout.calibration] = [testId, null]
      budget -= slotMinutes(lib, slots[layout.calibration])
    }
    for (const d of [layout.long, ...layout.keys]) if (d && !slots[d]) easyDays.push(d)
  } else {
    layout.keys.forEach((d, i) => {
      const room = Math.min(caps[d], budget)
      if (d === 'mon' && ctx.state.lastKeySunday) slots[d] = ['Z2', 0] // nigdy dwóch akcentów dzień po dniu – także przez granicę tygodnia
      else if (wk.test && i === 0 && lib[testId]!.duration_min <= room) slots[d] = [testId, null]
      else if (wk.type !== 'prep' && inp.intensity_allowed) slots[d] = keySlot(ctx, wk, d, i > 0, room)
      else slots[d] = ['Z2', 0] // wypełnione niżej jak dzień spokojny
      if (slots[d]![1] === 0) {
        slots[d] = null
        easyDays.push(d)
      } else {
        keyDays.push(d)
        budget -= slotMinutes(lib, slots[d])
      }
    })
    // test bez pasującego dnia akcentu (albo plan bez akcentów): na dniu długiej jazdy
    if (wk.test && !keyDays.some((d) => slots[d]?.[0] === testId) && layout.long && lib[testId]!.duration_min <= Math.min(caps[layout.long], budget)) {
      slots[layout.long] = [testId, null]
      keyDays.push(layout.long)
      budget -= slotMinutes(lib, slots[layout.long])
    }
  }

  // długa jazda
  if (!calibration && layout.long && !slots[layout.long]) {
    const d = layout.long
    const share = easyDays.length === 0 ? 1 : easyDays.length === 1 ? 0.6 : easyDays.length === 2 ? 0.5 : 0.45
    let long = Math.max(60, round5(budget * share))
    long = Math.min(long, caps[d], ctx.state.lastLong + 20)
    if (wk.type === 'deload') long = Math.min(long, round5(ctx.state.lastLong * 0.7))
    if (wk.phase === 'TAPER') long = Math.min(long, round5(ctx.state.lastLong * 0.6))
    long = floor5(Math.min(long, Math.max(0, budget)))
    if (long >= 45) {
      const id = layout.group === d ? 'GROUP_RIDE' : inp.goal.type === 'speed' && wk.phase === 'III' && long >= 150 ? 'LONG_TEMPO' : 'LONG'
      slots[d] = [id, long]
      budget -= long
      if (wk.type === 'build' || wk.type === 'test') ctx.state.lastLong = Math.max(ctx.state.lastLong, long)
    } else easyDays.push(d)
  }

  // dni spokojne: proporcjonalnie do limitów, po 5 min, poniżej 30 min dzień wolny; żaden nie dłuższy od długiej
  const longMin = layout.long && slots[layout.long] && !calibration ? slotMinutes(lib, slots[layout.long]) : Infinity
  const ordered = WEEKDAYS.filter((d) => easyDays.includes(d) && !slots[d])
  let pool = ordered
  let left = Math.max(0, budget)
  for (let round = 0; round < 2 && pool.length && left >= 30; round++) {
    const capSum = pool.reduce((s, d) => s + caps[d], 0)
    const next: Weekday[] = []
    for (const d of pool) {
      const m = Math.min(caps[d], longMin, floor5((left * caps[d]) / capSum))
      if (m >= 30) {
        slots[d] = [easyId(ctx, wk, d, m), m]
        next.push(d)
      }
    }
    const used = next.reduce((s, d) => s + slotMinutes(lib, slots[d]), 0)
    if (next.length === pool.length || next.length === 0) {
      left -= used
      break
    }
    // część dni wypadła – rozdziel budżet jeszcze raz tylko między te, które zostały
    for (const d of next) slots[d] = null
    pool = next
  }
  // zapas budżetu, gdy limity dni spokojnych są wyczerpane – dłuższa długa, do limitu dnia
  if (left > 0 && layout.long && slots[layout.long] && (slots[layout.long]![0] === 'LONG' || slots[layout.long]![0] === 'GROUP_RIDE')) {
    const s = slots[layout.long]!
    const extra = Math.min(left, caps[layout.long] - (s[1] ?? 0))
    if (extra >= 5) slots[layout.long] = [s[0], (s[1] ?? 0) + Math.floor(extra / 5) * 5]
  }

  const sun = slots.sun
  ctx.state.lastKeySunday = !!sun && (lib[sun[0]]!.key || /^(SS_|THR_|VO2_|TEMPO_|TEST|FTP)/.test(sun[0]))
  const tpl: WeekTemplate = { phase: wk.phase, type: wk.type }
  for (const d of WEEKDAYS) tpl[d] = slots[d] ?? ['REST', 0]
  return tpl
}

/** Identyfikator jazdy spokojnej: Z2, a dla urozmaicenia pagórki, siła na niskiej kadencji albo technika (MTB). */
function easyId(ctx: FillContext, wk: WeekSkeleton, day: Weekday, minutes: number): string {
  const { inp, layout } = ctx
  if (layout.group === day) return 'GROUP_RIDE'
  if (wk.index === 0 || wk.type === 'deload' || wk.phase === 'TAPER' || !inp.intensity_allowed) return 'Z2'
  const first = layout.easy[0] === day
  if (first && minutes >= 90 && inp.discipline !== 'road') return 'HILLS'
  if (first && minutes >= 60 && wk.index % 2 === 0 && inp.discipline !== 'mtb') return 'Z2_FORCE'
  if (inp.discipline === 'mtb' && layout.easy.at(-1) === day && minutes >= 60 && wk.index % 2 === 1) return 'MTB_SKILLS'
  return 'Z2'
}

/** Liczba akcentów w tygodniu: 0 bez zgody na intensywność, 1 przy małym czasie / ostrożnie / nowicjusz, inaczej 2. */
export function keyCountFor(inp: PlanInputs): number {
  return maxKeySessions(inp)
}
