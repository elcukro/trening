import type { BikeWorkout, HrZone, PowerZone, Step, StepBlock } from '../schema'
import type { Discipline, MeasureLevel } from '../onboarding'
import { t } from '../../i18n'
import { LADDER_IDS, WORKOUT_FAMILIES, familyText, type LadderId, type WorkoutFamily } from './templates'

/**
 * Biblioteka treningów generatora (docs/32 § 3). Te same identyfikatory i kształt kroków co w programach
 * z `data/` (silnik rozpoznaje akcenty po przedrostkach `SS_`/`THR_`/`VO2_`/`TEST`/`FTP`, skaluje `Z2`/`LONG`/`HILLS`,
 * a reguły sięgają po `Z2`, `Z1_RECOVERY`, `INDOOR_4x4`), ale opisy zależą od dyscypliny i poziomu pomiaru:
 * moc mówi w % FTP, tętno w % LTHR, odczucie w RPE i „teście rozmowy”. Kadencja standardowa (85–95) – indywidualne
 * ustalenia jednego zawodnika nie trafiają tu nigdy (docs/18). Teksty ze słownika `engine.generator.library`
 * w języku z chwili generowania (docs/34).
 */

type ZoneId = 'Z1' | 'Z2' | 'Z3' | 'SS' | 'Z4' | 'THR' | 'Z5a' | 'Z5b' | 'Z5c'
const HR_ZONE_DATA: (Omit<HrZone, 'name'> & { id: ZoneId })[] = [
  { id: 'Z1', low: 0.0, high: 0.81, rpe: [1, 2] },
  { id: 'Z2', low: 0.81, high: 0.89, rpe: [3, 4] },
  { id: 'Z3', low: 0.9, high: 0.93, rpe: [5, 6] },
  { id: 'SS', low: 0.92, high: 0.96, rpe: [6, 7] },
  { id: 'Z4', low: 0.94, high: 0.99, rpe: [7, 8] },
  { id: 'THR', low: 0.95, high: 1.0, rpe: [7, 8] },
  { id: 'Z5a', low: 1.0, high: 1.02, rpe: [8, 9] },
  { id: 'Z5b', low: 1.03, high: 1.06, rpe: [9, 9] },
  { id: 'Z5c', low: 1.06, high: 1.15, rpe: [10, 10] },
]

/** Strefy tętna z nazwami w bieżącym języku. */
export function hrZones(): HrZone[] {
  const names = t().engine.generator.library.zones
  return HR_ZONE_DATA.map((z) => ({ id: z.id, name: names[z.id], low: z.low, high: z.high, rpe: z.rpe }))
}

export const POWER_ZONES: PowerZone[] = [
  { id: 'Z1', low: 0.0, high: 0.55 },
  { id: 'Z2', low: 0.56, high: 0.75 },
  { id: 'Z3', low: 0.76, high: 0.9 },
  { id: 'SS', low: 0.88, high: 0.94 },
  { id: 'Z4', low: 0.91, high: 1.05 },
  { id: 'THR', low: 0.95, high: 1.0 },
  { id: 'Z5b', low: 1.06, high: 1.2 },
  { id: 'Z5c', low: 1.21, high: 1.5 },
]

const ZONE = Object.fromEntries(HR_ZONE_DATA.map((z) => [z.id, z])) as Record<string, Omit<HrZone, 'name'>>

const CAD_EASY: [number, number] = [85, 95]
const CAD_CD: [number, number] = [90, 100]

type Cad = [number, number] | null

export function step(name: string, minutes: number, zone: string, intensity: Step['intensity_type'] = 'active', cadence: Cad = null, note?: string, rpe?: [number, number]): Step {
  const z = ZONE[zone]!
  const s: Step = {
    name,
    duration_s: Math.round(minutes * 60),
    zone,
    target: { type: 'threshold_hr', low: z.low, high: z.high },
    rpe: rpe ?? z.rpe,
    intensity_type: intensity,
  }
  if (cadence) s.cadence_rpm = cadence
  if (note) s.note = note
  return s
}

export const repeat = (times: number, steps: StepBlock[]): StepBlock => ({ repeat: times, steps })

export function totalSeconds(blocks: StepBlock[]): number {
  return blocks.reduce((sum, b) => sum + ('repeat' in b ? b.repeat * totalSeconds(b.steps) : b.duration_s), 0)
}

const WU = (m = 15) => step(t().engine.generator.library.warmup, m, 'Z2', 'wu', CAD_EASY, t().engine.generator.library.warmupNote)
const CD = (m = 10) => step(t().engine.generator.library.cooldown, m, 'Z1', 'cd', CAD_CD)

/* ------------------------------------------------------------------ język poziomu pomiaru */

/** Jak opisujemy intensywność strefy w danym poziomie pomiaru (docs/30 § 3). */
export function intensityText(level: MeasureLevel, zone: 'Z1' | 'Z2' | 'Z3' | 'SS' | 'THR' | 'Z5b'): string {
  return t().engine.generator.library.intensity[level][zone]
}

/* ------------------------------------------------------------------ biblioteka */

export interface LibraryOptions {
  discipline: Discipline
  level: MeasureLevel
  /** ma trenażer – opisy wersji pod dachem mówią o ERG, nie o rowerku na siłowni */
  indoor: boolean
}

type Endurance = { id: string; name: string; minutes: number; zone?: string; desc: string; category?: string; cadence?: Cad; key?: boolean; insert?: StepBlock }

function endurance(o: Endurance): BikeWorkout {
  const zone = o.zone ?? 'Z2'
  const w: BikeWorkout = {
    id: o.id,
    name: o.name,
    category: o.category ?? 'endurance',
    key: o.key ?? false,
    steps: [step(o.name, o.minutes, zone, 'active', o.cadence ?? CAD_EASY, o.desc)],
    duration_min: o.minutes,
    description: o.desc,
    parametric_duration: true,
  }
  if (o.insert) w.insert = o.insert
  return w
}

function intervals(id: string, name: string, category: string, reps: number, workMin: number, recMin: number, zone: string, cadence: [number, number], description: string, lagNote: string, wu = 15, cd = 10): BikeWorkout {
  const intensity: Step['intensity_type'] = zone === 'THR' || zone === 'Z4' ? 'lt' : zone === 'Z5b' ? 'map' : 'active'
  const L = t().engine.generator.library
  const steps: StepBlock[] = [WU(wu), repeat(reps, [step(L.interval(workMin), workMin, zone, intensity, cadence, lagNote), step(L.recovery, recMin, 'Z1', 'recover', CAD_EASY)]), CD(cd)]
  return { id, name, category, key: true, steps, duration_min: Math.round(totalSeconds(steps) / 60), description }
}

/** Pod i nad progiem: w powtórzeniu na zmianę 2 min `zone` i 1 min `zone_over`, bez przerwy (jeden poziom powtórzeń). */
function overUnder(id: string, name: string, f: WorkoutFamily, reps: number, workMin: number, recMin: number, description: string, lagNote: string): BikeWorkout {
  const inner: StepBlock[] = []
  for (let k = 0; k < Math.floor(workMin / 3); k++) inner.push(step('Pod progiem 2 min', 2, f.zone, 'active', f.cadence, k === 0 ? lagNote : undefined), step('Nad progiem 1 min', 1, f.zone_over ?? 'THR', 'lt', f.cadence))
  const steps: StepBlock[] = [WU(f.warmup_min), repeat(reps, [...inner, step('Przerwa', recMin, 'Z1', 'recover', CAD_EASY)]), CD(10)]
  return { id, name, category: f.category, key: true, steps, duration_min: Math.round(totalSeconds(steps) / 60), description }
}

/** Serie 30/30: `sets` serii po `per` powtórzeń (30 s mocno / 30 s luźno), między seriami `recMin` minut luźno. */
function sets30(id: string, name: string, f: WorkoutFamily, sets: number, per: number, recMin: number, description: string): BikeWorkout {
  const X = t().engine.generator.library
  const steps: StepBlock[] = [WU(f.warmup_min)]
  for (let i = 0; i < sets; i++) {
    steps.push(repeat(per, [step(X.set30Hard, 0.5, f.zone, 'map', f.cadence, undefined, [9, 9]), step(X.set30Easy, 0.5, 'Z1', 'recover', CAD_EASY)]))
    if (i < sets - 1) steps.push(step(X.betweenSets, recMin, 'Z1', 'recover', CAD_EASY))
  }
  steps.push(CD(10))
  return { id, name, category: f.category, key: true, steps, duration_min: Math.round(totalSeconds(steps) / 60), description }
}

/**
 * Drabinki progresji akcentów – z `data/templates/workouts.json` (docs/33 § 8.1). Generator wybiera szczebel wg numeru
 * tygodnia w fazie i limitu czasu dnia. Szczebel: [id, powtórzenia, minuty pracy, minuty przerwy].
 */
export const LADDERS = Object.fromEntries(LADDER_IDS.map((id) => [id, WORKOUT_FAMILIES[id].rungs])) as Record<LadderId, [string, number, number, number][]>
export type { LadderId }

/** Opisy terenu dla dyscypliny (długa jazda, pagórki, podjazdy pod interwały) i nazwa roweru – w bieżącym języku. */
export function terrain(d: Discipline): { long: string; hills: string; climbs: string; climbsSs: string; bike: string } {
  return t().engine.generator.library.terrain[d]
}

/**
 * Pełna biblioteka dla danych parametrów. Zawsze ma: REST, Z1_RECOVERY, Z2, LONG, HILLS, Z2_FORCE, DELOAD, OPENERS,
 * INDOOR_4x4, TRIP, test właściwy dla poziomu pomiaru i wszystkie drabinki akcentów (generator wybiera z nich,
 * a Biblioteka w aplikacji pokaże tylko to, co jest w planie, i resztę jako zapas).
 */
export function buildLibrary(o: LibraryOptions): Record<string, BikeWorkout> {
  const L = o.level
  const T = terrain(o.discipline)
  const X = t().engine.generator.library
  const lib: Record<string, BikeWorkout> = {}
  const add = (w: BikeWorkout) => {
    lib[w.id] = w
  }

  const z2 = intensityText(L, 'Z2')
  const z1 = intensityText(L, 'Z1')
  const lag = X.lag[L]

  add(endurance({ id: 'REST', name: X.rest.name, minutes: 0, zone: 'Z1', desc: X.rest.desc, category: 'rest' }))
  add(endurance({ id: 'Z1_RECOVERY', name: X.recoveryRide.name, minutes: 45, zone: 'Z1', desc: X.recoveryRide.desc(z1), category: 'recovery', cadence: [90, 100] }))
  add(endurance({ id: 'Z2', name: X.z2.name, minutes: 60, desc: X.z2.desc(z2) }))
  add(endurance({ id: 'LONG', name: X.long.name, minutes: 150, desc: X.long.desc(T.long, z2), category: 'long' }))
  add(endurance({ id: 'LONG_TEMPO', name: X.longTempo.name, minutes: 180, desc: X.longTempo.desc(T.long, intensityText(L, 'Z3')), category: 'long', insert: repeat(3, [step(X.longTempo.step, 15, 'Z3', 'tempo', [88, 95]), step(X.longTempo.recovery, 5, 'Z2', 'recover', CAD_EASY)]) }))
  add(endurance({ id: 'HILLS', name: X.hills.name, minutes: 105, desc: X.hills.desc(T.hills, z2), category: 'hills' }))
  add(endurance({ id: 'Z2_FORCE', name: X.force.name, minutes: 75, desc: X.force.desc(z2), insert: repeat(4, [step(X.force.step, 5, 'Z3', 'active', [55, 65], X.force.stepNote), step(X.force.recovery, 5, 'Z2', 'recover', CAD_EASY)]) }))
  add(endurance({ id: 'DELOAD', name: X.deload.name, minutes: 60, desc: X.deload.desc(z2), insert: repeat(3, [step(X.deload.step, 1, 'Z4', 'lt', [90, 100]), step(X.deload.recovery, 3, 'Z2', 'recover', CAD_EASY)]) }))
  if (o.discipline === 'mtb') add(endurance({ id: 'MTB_SKILLS', name: X.mtbSkills.name, minutes: 60, desc: X.mtbSkills.desc(z2), category: 'skills' }))

  // akcenty z rodzin w data/templates/workouts.json; {SS}/{THR}/{Z3}/{Z5b} – intensywność w języku poziomu pomiaru
  const fill = (text: string) =>
    text
      .replace('{climbs_best}', T.climbsSs)
      .replace('{climbs}', T.climbs)
      .replace(/\{(SS|THR|Z3|Z5b)\}/g, (_, z: 'SS' | 'THR' | 'Z3' | 'Z5b') => intensityText(L, z))
  for (const ladder of LADDER_IDS) {
    const f = WORKOUT_FAMILIES[ladder]
    const ft = familyText(f)
    const desc = fill(ft.description)
    for (const [id, reps, m, rec] of f.rungs) {
      if (f.kind === 'intervals') add(intervals(id, `${ft.label} ${reps}×${m} min`, f.category, reps, m, rec, f.zone, f.cadence, desc, lag, f.warmup_min))
      else if (f.kind === 'over_under') add(overUnder(id, `${ft.label} ${reps}×${m} min`, f, reps, m, rec, desc, lag))
      else add(sets30(id, `${ft.label} ${reps}×${m}`, f, reps, m, rec, desc))
    }
  }
  add(intervals('INDOOR_4x4', X.indoor.name(o.indoor), 'indoor', 4, 4, 3, 'Z5b', [85, 95], X.indoor.desc(intensityText(L, 'Z5b')), lag, 10, 5))

  // testy kalibracyjne – jeden właściwy dla poziomu pomiaru (docs/30 § 3), reszta jako zapas w bibliotece
  const F = X.ftpTest
  const ftpSteps: StepBlock[] = [
    step(X.warmup, 20, 'Z2', 'wu', CAD_EASY, F.warmupNote),
    step(F.opener, 5, 'Z4', 'lt', CAD_EASY, F.openerNote),
    step(F.easy, 10, 'Z1', 'recover', CAD_EASY),
    step(F.effort, 20, 'Z5a', 'ftp', CAD_EASY, F.effortNote, [9, 10]),
    CD(10),
  ]
  const tests = t().engine.generator.tests
  add({ id: 'FTP_TEST', name: tests.power.name, category: 'test', key: true, steps: ftpSteps, duration_min: Math.round(totalSeconds(ftpSteps) / 60), description: F.desc })
  const lthrSteps: StepBlock[] = [WU(15), step(X.preTest, 5, 'Z1', 'recover'), step(X.lthrTest.effort, 30, 'THR', 'ftp', CAD_EASY, X.lthrTest.effortNote, [9, 9]), CD(10)]
  add({ id: 'TEST_LTHR', name: tests.hr.name, category: 'test', key: true, steps: lthrSteps, duration_min: Math.round(totalSeconds(lthrSteps) / 60), description: X.lthrTest.desc })
  const loopSteps: StepBlock[] = [WU(15), step(X.preTest, 5, 'Z1', 'recover'), step(X.loopTest.effort, 25, 'THR', 'ftp', CAD_EASY, X.loopTest.effortNote, [9, 9]), CD(10)]
  add({ id: 'TEST_LOOP', name: tests.rpe.name, category: 'test', key: true, steps: loopSteps, duration_min: Math.round(totalSeconds(loopSteps) / 60), description: X.loopTest.desc })

  const O = X.openers
  add({
    id: 'OPENERS',
    name: O.name,
    category: 'taper',
    key: false,
    steps: [WU(15), repeat(3, [step(O.tempo, 3, 'Z4', 'lt', [85, 95]), step(O.easy, 3, 'Z1', 'recover')]), repeat(5, [step(O.sprint, 0.5, 'Z5b', 'ac', [95, 110], undefined, [8, 9]), step(O.sprintEasy, 1.5, 'Z1', 'recover')]), CD(10)],
    duration_min: 60,
    description: O.desc,
  })
  add(endurance({ id: 'GROUP_RIDE', name: X.groupRide.name, minutes: 120, desc: X.groupRide.desc(z2), category: 'endurance' }))
  add(endurance({ id: 'COMMUTE', name: X.commute.name, minutes: 45, desc: X.commute.desc(z1, z2), category: 'recovery', cadence: [85, 100] }))
  add(endurance({ id: 'RACE', name: X.race.name, minutes: 120, desc: X.race.desc, category: 'race', key: true }))
  add(endurance({ id: 'TRIP', name: X.trip.name, minutes: 0, desc: X.trip.desc, category: 'trip' }))
  return lib
}

/** Identyfikator testu kalibracyjnego dla poziomu pomiaru. */
export function testIdFor(level: MeasureLevel): 'FTP_TEST' | 'TEST_LTHR' | 'TEST_LOOP' {
  return level === 'power' ? 'FTP_TEST' : level === 'hr' ? 'TEST_LTHR' : 'TEST_LOOP'
}

