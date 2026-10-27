import type { Bikes, CadencePolicy, Goal as ProgramGoal, NutritionPolicy, Phase, ProgramRules } from '../schema'
import type { z } from 'zod'
import type { ProgramMetaSchema } from '../schema'
type ProgramMeta = z.infer<typeof ProgramMetaSchema>
import type { PhaseId } from '../types'
import type { Weekday } from '../dates'
import type { Discipline, PlanInputs } from '../onboarding'
import { terrain, testIdFor } from './library'
import { t } from '../../i18n'
import type { DayLayout, Skeleton } from './structure'

/**
 * Teksty programu dla człowieka (docs/32 § 4): reguły R1–R16 jako dane z dniami tygodnia zawodnika, fazy,
 * nazwa planu i cel. Silnik czyta z tych sekcji tylko parametry (`long_catchup_onto`, `deload_note`), reszta jest
 * do czytania w Bibliotece → Zasady. Teksty ze słownika `engine.generator` w języku z chwili generowania (docs/34).
 */

/** Nazwa dnia tygodnia w bieżącym języku („wtorek” / „Tuesday”). */
export function dayName(d: Weekday): string {
  return t().engine.generator.day[d]
}

export function goalLabel(inp: PlanInputs): { label: string; short: string } {
  const g = inp.goal
  const T = t().engine.generator.goal
  switch (g.type) {
    case 'event':
      return { label: T.event(g.name?.trim() || T.eventFallback, g.distance_km, g.elevation_m, g.target_time_min ?? null), short: g.name?.trim() || `${g.distance_km} km` }
    case 'ftp':
      return { label: T.ftp(g.target_w), short: T.ftp(g.target_w) }
    case 'speed':
      return { label: T.speed(g.kmh, g.hours), short: T.speedShort(g.kmh) }
    case 'weight':
      return { label: T.weight(g.target_kg), short: T.weightShort(g.target_kg) }
    case 'fitness':
      return { label: T.fitness(g.weekly_hours, g.weeks), short: T.fitnessShort }
    case 'comeback':
      return { label: T.comeback(g.weeks_off, g.weekly_hours), short: T.comebackShort }
  }
}

export function programGoal(inp: PlanInputs): ProgramGoal {
  const { label, short } = goalLabel(inp)
  if (inp.goal.type === 'speed') return { kind: 'speed', kmh: inp.goal.kmh, label, short }
  return { kind: 'ftp', label, short }
}

export function programMeta(inp: PlanInputs, sk: Skeleton): ProgramMeta {
  const { short } = goalLabel(inp)
  const G = t().engine.generator
  const disc: Record<Discipline, string> = G.discipline
  const name = G.planName(short, disc[inp.discipline])
  if (inp.goal.type === 'event' && sk.horizon === 'to_goal') return { name, short, target: { ...G.target.event } }
  if (sk.horizon === 'to_goal') return { name, short, target: { ...G.target.goal } }
  return { name, short, target: { ...G.target.end } }
}

export function phases(inp: PlanInputs, sk: Skeleton): Phase[] {
  const ids = [...new Set(sk.weeks.map((w) => w.phase))] as PhaseId[]
  const range = (id: PhaseId): [number, number] => {
    const ws = sk.weeks.filter((w) => w.phase === id).map((w) => w.index)
    return [ws[0]!, ws.at(-1)!]
  }
  const g = inp.goal.type
  const P = t().engine.generator.phases
  const texts: Record<PhaseId, { name: string; goal: string }> = {
    PREP: {
      name: sk.weeks[0]!.test ? P.calibration : P.intro,
      goal: sk.weeks[0]!.test ? P.calibrationGoal : P.introGoal,
    },
    I: { name: P.base, goal: inp.intensity_allowed ? P.baseGoal : P.baseGoalEasy },
    II: { name: P.build, goal: g === 'weight' || g === 'fitness' || g === 'comeback' ? P.buildGoalGeneral : P.buildGoal },
    III: {
      name: P.specific,
      goal: g === 'ftp' ? P.specificGoalFtp : g === 'speed' ? P.specificGoalSpeed : P.specificGoalEvent,
    },
    IV: { name: P.iv, goal: '' },
    V: { name: P.v, goal: '' },
    TAPER: { name: g === 'event' ? P.taperEvent : P.taperTest, goal: g === 'event' ? P.taperGoalEvent : P.taperGoalTest },
  }
  return ids.map((id) => ({ id, name: texts[id].name, goal: texts[id].goal, weeks: range(id) }))
}

export function bikes(inp: PlanInputs): Bikes {
  const B = t().engine.generator.bikes
  return { default: terrain(inp.discipline).bike, indoor: inp.indoor ? B.trainer : B.stationary }
}

export function cadence(): CadencePolicy {
  return { floor_rpm: 75, goal_rpm: 90, tip: t().engine.generator.cadenceTip }
}

/** Żywienie: deficyt tylko przy celu masy (liczony z masy z check-inu), inaczej bilans zerowy. */
export function nutrition(inp: PlanInputs, phaseIds: PhaseId[], deficitSharesPerWeek: number): NutritionPolicy {
  const weight = inp.goal.type === 'weight'
  const N = t().engine.generator.nutrition
  const deficit_by_phase = Object.fromEntries(phaseIds.map((p) => [p, weight && p !== 'TAPER']))
  const base: NutritionPolicy = {
    deficit_by_phase,
    protein_g_per_kg: weight ? 1.8 : 1.6,
    heavy_min: 120,
    medium_min: 60,
    buckets: {
      no_deficit: { energy: 'maintenance', label: N.noDeficit },
      heavy: { energy: 'maintenance', label: N.heavy },
      medium: weight ? { energy: 'deficit_300', label: N.mediumWeight, deficit_share: 0.5 } : { energy: 'maintenance', label: N.medium },
      light: weight ? { energy: 'deficit_300', label: N.lightWeight, deficit_share: 1 } : { energy: 'maintenance', label: N.light },
    },
    if_above_target_suffix: N.ifAboveTarget,
    carbs_g_per_h: [
      [90, [60, 80]],
      [60, [30, 40]],
    ],
    post_workout: { min_ride_min: 60, text: N.postWorkout },
  }
  if (weight) base.weight_based = { max_kcal_per_day: 500, max_loss_pct_per_week: 0.7, deficit_shares_per_week: Math.max(0.5, Math.round(deficitSharesPerWeek * 100) / 100) }
  return base
}

export function rules(inp: PlanInputs, sk: Skeleton, lay: DayLayout): ProgramRules {
  const keys = lay.keys
  const key1 = keys[0]
  const long = lay.long
  const afterLong = long ? lay.easy.find((d) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(d) > ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(long)) : undefined
  const easyAfterKey = key1 ? lay.easy.find((d) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(d) > ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(key1)) : undefined
  const testWeeks = sk.weeks.filter((w) => w.test).map((w) => w.index)
  const testId = testIdFor(inp.measure)
  const G = t().engine.generator
  const R = G.rules
  const T = G.tests[inp.measure]
  const text: ProgramRules['text'] = []
  if (key1) {
    text.push({ id: 'R1', title: R.r1Title(key1), text: easyAfterKey ? R.r1Text(easyAfterKey) : R.r1TextNoEasy })
  } else text.push({ id: 'R1', title: R.r1TitleNoKey, text: R.r1TextNoKey })
  if (long) text.push({ id: 'R2', title: R.r2Title(long), text: afterLong ? R.r2Text(afterLong) : R.r2TextNoAfter })
  text.push({ id: 'R4', title: R.r4Title, text: inp.indoor ? R.r4Indoor : R.r4NoIndoor })
  text.push({ id: 'R5', title: R.r5Title, text: R.r5Text })
  text.push({ id: 'R6', title: R.r6Title, text: R.r6Text })
  if (inp.goal.type === 'weight') text.push({ id: 'R10', title: R.r10TitleWeight, text: R.r10TextWeight })
  else text.push({ id: 'R10', title: R.r10Title, text: R.r10Text })
  text.push({ id: 'R11', title: R.r11Title, text: inp.measure === 'rpe' ? R.r11Rpe : R.r11Text })
  text.push({ id: 'R12', title: R.r12Title, text: R.r12Text(sk.block) })
  text.push({ id: 'R13', title: R.r13Title, text: R.r13Text })
  text.push({ id: 'R14', title: sk.horizon === 'to_goal' ? R.r14TitleGoal : R.r14TitleRolling, text: sk.horizon === 'to_goal' ? R.r14TextGoal(sk.weeks.length, sk.program_start) : R.r14TextRolling(sk.weeks.length, sk.program_start) })
  text.push({ id: 'R15', title: R.r15Title, text: R.r15Text })
  text.push({ id: 'R16', title: R.r16Title, text: R.r16Text })

  const hierarchy: string[] = []
  if (key1) hierarchy.push(R.hierarchyKey(key1))
  if (long) hierarchy.push(R.hierarchyLong(long))
  if (keys[1]) hierarchy.push(R.hierarchyKey2(keys[1]))
  for (const d of lay.easy) hierarchy.push(R.hierarchyEasy(d))

  return {
    text,
    hierarchy,
    tests: inp.intensity_allowed ? [{ id: testId, name: T.name, when: testWeeks.length ? G.tests.when(testWeeks) : G.tests.whenLater, protocol: T.protocol, result: T.result }] : [],
    long_catchup_onto: afterLong ? ['easy'] : [],
    deload_note: R.deloadNote,
  }
}
