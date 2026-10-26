import { parseProgram, type Program, type Settings, type WeekTemplate } from '../schema'
import type { CalendarDay, PhaseId } from '../types'
import { buildCalendar, seasonSummary } from '../calendar'
import type { ISODate } from '../dates'
import { planInputs, type AthleteProfile, type PlanInputs } from '../onboarding'
import { hrZones, POWER_ZONES, buildLibrary, testIdFor } from './library'
import { clampTuning, defaultTuning, type PlanTuning } from './tuning'
import { buildSkeleton, fillWeek, layoutDays, type DayLayout, type Skeleton, type WeekSkeleton } from './structure'
import { bikes, cadence, nutrition, phases, programGoal, programMeta, rules } from './texts'
import { t as tr } from '../../i18n'

/**
 * Generator planów (docs/32): z danych onboardingu (`planInputs`) buduje program w formacie `data/program.json`
 * (schemat `ProgramSchema`, układ `fixed`), który silnik czyta jak każdy inny. Zastępuje generatory w Pythonie dla
 * nowych kont; programy alpejski i FTP 300 zostają bez zmian.
 *
 * Zasada: kod liczy, model opowiada – tu nie ma żadnego tekstu z modelu. Wynik jest deterministyczny dla tych samych
 * wejść i daty; `GENERATOR_VERSION` rośnie przy każdej zmianie, która zmienia plan dla tych samych wejść.
 * Teksty powstają w bieżącym języku (`getLang()`) – cache programu w `src/data/generated.ts` ma język w kluczu.
 */

export const GENERATOR_VERSION = '1.0.0'
export const GENERATED_PROGRAM_ID = 'generated'

export interface GeneratorExtras {
  weight_kg: number | null
  hr_max_bpm: number | null
  /** najdłuższa jazda w ostatnim miesiącu – punkt startu progresji długiej jazdy */
  longest_ride_min: number
}

export interface GeneratedPlan {
  program: Program
  skeleton: Skeleton
  layout: DayLayout
  /** uwagi generatora dla człowieka (np. „plan przyjął 6 h zamiast 8 h”) */
  notes: string[]
  /** dopasowanie po clampie – to, z czym plan naprawdę powstał (docs/33 § 8.2) */
  tuning: PlanTuning
}

/** Szacunek FTP, gdy zawodnik go nie zna: W/kg wg doświadczenia (albo stała bez masy). Tylko do stref przed testem. */
export function estimateFtp(weightKg: number | null, experience: PlanInputs['experience']): number {
  const wkg = experience === 'novice' ? 2.0 : experience === 'experienced' ? 2.8 : 2.4
  return weightKg ? Math.round((weightKg * wkg) / 5) * 5 : 180
}

const KIT_KG = { road: 9, gravel: 10, mtb: 13 } as const

function weekNotes(inp: PlanInputs, sk: Skeleton, wk: WeekSkeleton, lay: DayLayout, tpl: WeekTemplate): string | undefined {
  const N = tr().engine.generator.weekNotes
  const testName = N.testName[inp.measure]
  if (wk.index === 0) {
    if (lay.calibration && wk.test) return N.calibration(lay.calibration, testName)
    return inp.intensity_allowed ? N.intro : N.introEasy
  }
  if (wk.index === 1) {
    const keyDay = lay.keys[0] && tpl[lay.keys[0]]?.[0] !== 'Z2' ? lay.keys[0] : null
    return N.baseStart(keyDay)
  }
  if (wk.type === 'deload') return N.deload
  if (wk.test && wk.phase === 'TAPER') return N.finalTest(testName)
  if (wk.test) return N.test(testName)
  if (wk.phase === 'TAPER') return wk.lastTaper ? N.lastTaper : N.taper
  const first = sk.weeks.find((w) => w.phase === wk.phase)
  if (first?.index === wk.index) {
    if (wk.phase === 'II') return N.build
    if (wk.phase === 'III') return inp.goal.type === 'ftp' ? N.vo2 : N.specific
  }
  return undefined
}

/** Plan z gotowych wejść generatora (testy, podgląd bez konta). */
export function generateFromInputs(inp: PlanInputs, extras: GeneratorExtras, today: ISODate, tuning?: PlanTuning | null): GeneratedPlan {
  // dopasowanie zawsze przez clamp – nawet zapisane w bazie (inna wersja granic, ręczna zmiana)
  const t = tuning ? clampTuning(inp, tuning).tuning : defaultTuning(inp)
  const notes: string[] = []
  const lib = buildLibrary({ discipline: inp.discipline, level: inp.measure, indoor: inp.indoor })
  const testId = testIdFor(inp.measure)
  const sk = buildSkeleton(inp, today, t)
  const lay = layoutDays(inp, t.key_sessions, lib[testId]!.duration_min, t)
  if (sk.weeks[0]!.test && !lay.calibration) {
    sk.weeks[0]!.test = false
    sk.weeks[0]!.type = 'prep'
    notes.push(tr().engine.generator.notes.noCalibrationDay)
  }
  const ctx = { inp, template: t.template, layout: lay, lib, state: { lastLong: Math.max(60, Math.min(extras.longest_ride_min, inp.day_caps_min[lay.long ?? 'sat'])), lastKeySunday: false } }
  const weeks: Record<string, WeekTemplate> = {}
  for (const wk of sk.weeks) {
    const tpl = fillWeek(ctx, wk)
    const note = weekNotes(inp, sk, wk, lay, tpl)
    if (note) tpl.notes = note
    weeks[String(wk.index)] = tpl
  }
  if (sk.horizon === 'rolling' && 'date' in inp.goal && inp.goal.date) notes.push(tr().engine.generator.notes.rolling)

  const phaseIds = [...new Set(sk.weeks.map((w) => w.phase))] as PhaseId[]
  const weight = extras.weight_kg ?? 75
  const targetKg = inp.goal.type === 'weight' ? Math.min(inp.goal.target_kg, weight) : weight
  const ftpEstimate = inp.ftp_w ?? estimateFtp(extras.weight_kg, inp.experience)
  const ftpGoal = inp.goal.type === 'ftp' ? inp.goal.target_w : Math.round((ftpEstimate * 1.08) / 5) * 5
  const settings: Settings = {
    program_start: sk.program_start,
    trip_start: sk.trip_start,
    athlete_name: '',
    body_weight_start_kg: weight,
    body_weight_target_kg: targetKg,
    bike_and_kit_kg: KIT_KG[inp.discipline],
    lthr_bpm: inp.lthr_bpm,
    hr_max_bpm: extras.hr_max_bpm,
    ftp_w_estimate: ftpEstimate,
    ftp_w_goal: ftpGoal,
    power_meter: inp.measure === 'power',
    timezone: 'Europe/Warsaw',
    volume_scale: 1,
    program_id: GENERATED_PROGRAM_ID,
    units: 'metric',
    language: 'system',
  }
  const draft: Program = {
    version: `gen-${GENERATOR_VERSION}`,
    meta: programMeta(inp, sk),
    nutrition: nutrition(inp, phaseIds, 1),
    bikes: bikes(inp),
    goal: programGoal(inp),
    cadence: cadence(),
    rules: rules(inp, sk, lay),
    features: inp.measure === 'power' ? ['ftp_suggestions'] : [],
    default_settings: settings,
    hr_zones_lthr_fraction: hrZones(),
    power_zones_ftp_fraction: POWER_ZONES,
    phases: phases(inp, sk),
    bike_workouts: lib,
    weeks,
    week_summary: [],
    layout: { mode: 'fixed' },
  }
  const days = buildCalendar({ program: draft, settings })
  if (draft.nutrition.weight_based) draft.nutrition = nutrition(inp, phaseIds, deficitSharesPerWeek(days, draft))
  draft.week_summary = seasonSummary({ program: draft, settings }, days)
  return { program: parseProgram(draft), skeleton: sk, layout: lay, notes, tuning: t }
}

/** Średnia suma udziałów dni w tygodniach z deficytem – mianownik rozkładu puli tygodniowej (jak w generatorach). */
function deficitSharesPerWeek(days: CalendarDay[], program: Program): number {
  const byWeek = new Map<number, number>()
  for (const d of days) {
    if (!program.nutrition.deficit_by_phase[d.phase]) continue
    byWeek.set(d.week, (byWeek.get(d.week) ?? 0) + (d.nutrition.deficit_share ?? 0))
  }
  const sums = [...byWeek.values()]
  return sums.length ? sums.reduce((a, b) => a + b, 0) / sums.length : 0
}

/** Plan z profilu onboardingu (docs/31) – wejście dla ekranu „Gotowe!” i dla zapisu programu konta. */
export function generateProgram(profile: AthleteProfile, today: ISODate, tuning?: PlanTuning | null): GeneratedPlan {
  return generateFromInputs(planInputs(profile, today), { weight_kg: profile.body.weight_kg, hr_max_bpm: profile.measure.hr_max_bpm, longest_ride_min: profile.current.longest_ride_min }, today, tuning)
}

export { buildLibrary, testIdFor, LADDERS } from './library'
export { buildSkeleton, layoutDays, keyCountFor, programStart, MAX_WEEKS } from './structure'
export { allowedTemplates, PLAN_TEMPLATES, templateById, templateText, TEMPLATE_IDS, type PlanTemplate, type TemplateId } from './templates'
export { clampTuning, defaultTuning, isDefaultTuning, planTuningSchema, ruleWhy, tuningBounds, type PlanTuning, type TuningKey } from './tuning'
export type { Skeleton, WeekSkeleton, DayLayout } from './structure'
