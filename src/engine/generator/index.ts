import { parseProgram, type Program, type Settings, type WeekTemplate } from '../schema'
import type { CalendarDay, PhaseId } from '../types'
import { buildCalendar, seasonSummary } from '../calendar'
import type { ISODate } from '../dates'
import { planInputs, type AthleteProfile, type PlanInputs } from '../onboarding'
import { HR_ZONES, POWER_ZONES, buildLibrary, testIdFor } from './library'
import { buildSkeleton, fillWeek, keyCountFor, layoutDays, type DayLayout, type Skeleton, type WeekSkeleton } from './structure'
import { CADENCE, DAY_NAME, bikes, nutrition, phases, programGoal, programMeta, rules } from './texts'

/**
 * Generator planów (docs/32): z danych onboardingu (`planInputs`) buduje program w formacie `data/program.json`
 * (schemat `ProgramSchema`, układ `fixed`), który silnik czyta jak każdy inny. Zastępuje generatory w Pythonie dla
 * nowych kont; programy alpejski i FTP 300 zostają bez zmian.
 *
 * Zasada: kod liczy, model opowiada – tu nie ma żadnego tekstu z modelu. Wynik jest deterministyczny dla tych samych
 * wejść i daty; `GENERATOR_VERSION` rośnie przy każdej zmianie, która zmienia plan dla tych samych wejść.
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
}

/** Szacunek FTP, gdy zawodnik go nie zna: W/kg wg doświadczenia (albo stała bez masy). Tylko do stref przed testem. */
export function estimateFtp(weightKg: number | null, experience: PlanInputs['experience']): number {
  const wkg = experience === 'novice' ? 2.0 : experience === 'experienced' ? 2.8 : 2.4
  return weightKg ? Math.round((weightKg * wkg) / 5) * 5 : 180
}

const KIT_KG = { road: 9, gravel: 10, mtb: 13 } as const

function weekNotes(inp: PlanInputs, sk: Skeleton, wk: WeekSkeleton, lay: DayLayout, tpl: WeekTemplate): string | undefined {
  const testName = { power: 'test FTP 20 min', hr: 'test progowy 30 min', rpe: 'pętla na czas' }[inp.measure]
  if (wk.index === 0) {
    const testDay = lay.calibration && wk.test ? DAY_NAME[lay.calibration] : null
    return testDay ? `Tydzień kalibracyjny: lekkie jazdy, a w ${testDay} ${testName}. Od jego wyniku liczą się strefy – do tego czasu plan używa szacunków.` : inp.intensity_allowed ? 'Tydzień wprowadzający: tylko lekkie jazdy, bez testu. Pierwszy test za kilka tygodni, gdy organizm przywyknie do regularności.' : 'Tydzień wprowadzający: lekkie jazdy. Plan zostaje spokojny do czasu rozmowy z lekarzem.'
  }
  if (wk.index === 1) {
    const key = lay.keys[0] && tpl[lay.keys[0]]?.[0] !== 'Z2' ? ` Jedyny dzień, w którym wolno się zmęczyć, to ${DAY_NAME[lay.keys[0]]}.` : ''
    return `Start fazy bazowej. Jazdy spokojne mają być nudne – rozmowa pełnymi zdaniami.${key}`
  }
  if (wk.type === 'deload') return 'Tydzień lżejszy: bez interwałów, długa krótsza. Nogi mają wyjść świeższe, niż weszły.'
  if (wk.test && wk.phase === 'TAPER') return `Taper i ${testName} na koniec planu – rozliczenie tego, co zbudowałeś. Po nim ustawiamy następny cel.`
  if (wk.test) return `W tym tygodniu ${testName} zamiast akcentu. Dzień wcześniej naprawdę lekko.`
  if (wk.phase === 'TAPER') return wk.lastTaper ? 'Ostatni tydzień: krótko i świeżo. Nie nadrabiaj niczego – forma już jest.' : 'Taper: objętość w dół, intensywność tylko w krótkich pobudzeniach.'
  const first = sk.weeks.find((w) => w.phase === wk.phase)
  if (first?.index === wk.index) {
    if (wk.phase === 'II') return 'Nowa faza: interwały progowe. Pierwsze minuty każdego interwału prowadź po odczuciu, nie na siłę.'
    if (wk.phase === 'III') return inp.goal.type === 'ftp' ? 'Blok VO2max: objętość w dół, intensywność w górę. Powtórzenia równo, nie sprintem na starcie.' : 'Faza specyficzna: praca pod wymagania celu.'
  }
  return undefined
}

/** Plan z gotowych wejść generatora (testy, podgląd bez konta). */
export function generateFromInputs(inp: PlanInputs, extras: GeneratorExtras, today: ISODate): GeneratedPlan {
  const notes: string[] = []
  const lib = buildLibrary({ discipline: inp.discipline, level: inp.measure, indoor: inp.indoor })
  const testId = testIdFor(inp.measure)
  const sk = buildSkeleton(inp, today)
  const lay = layoutDays(inp, keyCountFor(inp), lib[testId]!.duration_min)
  if (sk.weeks[0]!.test && !lay.calibration) {
    sk.weeks[0]!.test = false
    sk.weeks[0]!.type = 'prep'
    notes.push('Żaden z dostępnych dni nie mieści testu kalibracyjnego – strefy zostają szacunkiem do pierwszego testu w planie.')
  }
  const ctx = { inp, layout: lay, lib, state: { lastLong: Math.max(60, Math.min(extras.longest_ride_min, inp.day_caps_min[lay.long ?? 'sat'])), lastKeySunday: false } }
  const weeks: Record<string, WeekTemplate> = {}
  for (const wk of sk.weeks) {
    const tpl = fillWeek(ctx, wk)
    const note = weekNotes(inp, sk, wk, lay, tpl)
    if (note) tpl.notes = note
    weeks[String(wk.index)] = tpl
  }
  if (sk.horizon === 'rolling' && 'date' in inp.goal && inp.goal.date) notes.push('Data celu jest dalej niż rok – plan obejmuje pierwsze 52 tygodnie i zostanie przedłużony.')

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
    language: 'pl',
  }
  const draft: Program = {
    version: `gen-${GENERATOR_VERSION}`,
    meta: programMeta(inp, sk),
    nutrition: nutrition(inp, phaseIds, 1),
    bikes: bikes(inp),
    goal: programGoal(inp),
    cadence: CADENCE,
    rules: rules(inp, sk, lay),
    features: inp.measure === 'power' ? ['ftp_suggestions'] : [],
    default_settings: settings,
    hr_zones_lthr_fraction: HR_ZONES,
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
  return { program: parseProgram(draft), skeleton: sk, layout: lay, notes }
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
export function generateProgram(profile: AthleteProfile, today: ISODate): GeneratedPlan {
  return generateFromInputs(planInputs(profile, today), { weight_kg: profile.body.weight_kg, hr_max_bpm: profile.measure.hr_max_bpm, longest_ride_min: profile.current.longest_ride_min }, today)
}

export { buildLibrary, testIdFor, LADDERS } from './library'
export { buildSkeleton, layoutDays, keyCountFor, programStart, MAX_WEEKS } from './structure'
export type { Skeleton, WeekSkeleton, DayLayout } from './structure'
