import type { Program, Settings, WeekTemplate } from './schema'
import type { LayoutWeek, PhaseId, WeekType } from './types'
import { addDays, diffDays, mondayOf, type ISODate } from './dates'

/**
 * Układ tygodni sezonu (R14).
 *
 * Fazy PREP, I, II, III są przypięte do dat (szablony 0–32 liczone od `program_start`).
 * Od końca: taper = tydzień zawierający `trip_start` + poprzedni (szablony 51, 52),
 * faza V = 6 tygodni przed taperem (szablony 45–50), faza IV wypełnia resztę
 * od początku szablonu 33 (26.04.2027 dla domyślnego startu).
 * Dla ustawień domyślnych wynik = szablony 0…52 jeden do jednego.
 */

const PHASE_IV_TEMPLATES = [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44]
const PHASE_V_TEMPLATES = [45, 46, 47, 48, 49, 50]
const TAPER_TEMPLATES = [51, 52]
const PHASE_III_TEMPLATES = [25, 26, 27, 28, 29, 30, 31, 32]
const PHASE_III_TEST_WEEK = 29
const PHASE_IV_CLONE_TEMPLATE = 41
const PHASE_IV_DELOAD_TEMPLATE = 44
const PHASE_IV_MIN_WEEKS = 6

export class TripDateError extends Error {
  constructor(
    message: string,
    public readonly earliest: ISODate,
  ) {
    super(message)
    this.name = 'TripDateError'
  }
}

function tpl(program: Program, n: number): WeekTemplate {
  const t = program.weeks[String(n)]
  if (!t) throw new Error(`Brak szablonu tygodnia ${n} w program.json`)
  return t
}

/** Kolejność usuwania tygodni fazy IV przy skracaniu (od najmniej ważnych). */
function phaseIVRemovalOrder(program: Program): number[] {
  const rev = PHASE_IV_TEMPLATES.toReversed()
  const isBuildNoEvent = (n: number) => tpl(program, n).type === 'build' && !tpl(program, n).event
  const isEvent = (n: number) => tpl(program, n).type === 'build' && !!tpl(program, n).event
  const isDeload = (n: number) => tpl(program, n).type === 'deload'
  return [...rev.filter(isBuildNoEvent), ...rev.filter(isEvent), ...rev.filter(isDeload)]
}

function phaseIVTemplates(program: Program, count: number): number[] {
  if (count === PHASE_IV_TEMPLATES.length) return [...PHASE_IV_TEMPLATES]
  if (count < PHASE_IV_TEMPLATES.length) {
    const remove = new Set(phaseIVRemovalOrder(program).slice(0, PHASE_IV_TEMPLATES.length - count))
    return PHASE_IV_TEMPLATES.filter((n) => !remove.has(n))
  }
  // rozciąganie: klony tygodnia 41 przed ostatnim rozładowaniem; po każdych 3 klonach lżejszy tydzień,
  // jeśli po nim są jeszcze klony (żeby nie było dwóch rozładowań pod rząd)
  const extras = count - PHASE_IV_TEMPLATES.length
  const inserted: number[] = []
  let sinceDeload = 0
  while (inserted.length < extras) {
    inserted.push(PHASE_IV_CLONE_TEMPLATE)
    sinceDeload += 1
    // rozładowanie tylko, gdy zmieści się jeszcze co najmniej jeden klon po nim
    if (sinceDeload === 3 && inserted.length <= extras - 2) {
      inserted.push(PHASE_IV_DELOAD_TEMPLATE)
      sinceDeload = 0
    }
  }
  const head = PHASE_IV_TEMPLATES.slice(0, -1)
  return [...head, ...inserted, PHASE_IV_DELOAD_TEMPLATE]
}

function phaseIIITemplates(count: number): number[] {
  if (count >= PHASE_III_TEMPLATES.length) return [...PHASE_III_TEMPLATES]
  const order = PHASE_III_TEMPLATES.toReversed().filter((n) => n !== PHASE_III_TEST_WEEK)
  const remove = new Set(order.slice(0, PHASE_III_TEMPLATES.length - count))
  return PHASE_III_TEMPLATES.filter((n) => !remove.has(n))
}

/** Najwcześniejsza dopuszczalna data wyjazdu dla danego startu programu. */
export function earliestTripStart(programStart: ISODate): ISODate {
  const week0 = addDays(mondayOf(programStart), -7)
  // faza III min 1 tydzień (testowy) + IV 6 + V 6 + taper 2 → sobota drugiego tygodnia taperu
  const minWeeks = 25 + 1 + PHASE_IV_MIN_WEEKS + PHASE_V_TEMPLATES.length + TAPER_TEMPLATES.length
  return addDays(week0, minWeeks * 7 - 2)
}

export function layoutWeeks(program: Program, settings: Pick<Settings, 'program_start' | 'trip_start'>): LayoutWeek[] {
  const week0 = addDays(mondayOf(settings.program_start), -7)
  const tripMonday = mondayOf(settings.trip_start)
  const taperStart = addDays(tripMonday, -7)
  const phaseVStart = addDays(taperStart, -7 * PHASE_V_TEMPLATES.length)
  const phaseIVNominalStart = addDays(week0, 7 * PHASE_IV_TEMPLATES[0]!)
  const phaseIIINominalStart = addDays(week0, 7 * PHASE_III_TEMPLATES[0]!)

  let phaseIVWeeks = diffDays(phaseVStart, phaseIVNominalStart) / 7
  let phaseIIIWeeks = PHASE_III_TEMPLATES.length
  if (phaseIVWeeks < PHASE_IV_MIN_WEEKS) {
    phaseIIIWeeks = PHASE_III_TEMPLATES.length - (PHASE_IV_MIN_WEEKS - phaseIVWeeks)
    phaseIVWeeks = PHASE_IV_MIN_WEEKS
  }
  if (phaseIIIWeeks < 1) {
    throw new TripDateError(
      `Data wyjazdu ${settings.trip_start} jest za wcześnie – nie mieszczą się fazy III–V.`,
      earliestTripStart(settings.program_start),
    )
  }

  const templates: number[] = []
  for (let n = 0; n < PHASE_III_TEMPLATES[0]!; n++) templates.push(n)
  templates.push(...phaseIIITemplates(phaseIIIWeeks))
  templates.push(...phaseIVTemplates(program, phaseIVWeeks))
  templates.push(...PHASE_V_TEMPLATES, ...TAPER_TEMPLATES)

  const seen = new Map<number, number>()
  const out: LayoutWeek[] = []
  let monday = week0
  templates.forEach((template, i) => {
    const t = tpl(program, template)
    const count = (seen.get(template) ?? 0) + 1
    seen.set(template, count)
    out.push({
      week: i,
      template,
      monday,
      phase: t.phase as PhaseId,
      type: t.type as WeekType,
      cloned: count > 1,
    })
    monday = addDays(monday, 7)
  })
  // sanity: faza III zaczyna się zawsze od nominalnej daty
  const first3 = out.find((w) => w.phase === 'III')
  if (first3 && first3.monday !== phaseIIINominalStart) {
    throw new Error('Błąd układu tygodni: faza III nie zaczyna się od nominalnej daty')
  }
  return out
}
