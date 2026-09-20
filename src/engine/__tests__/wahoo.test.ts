import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { buildWahooPlan, externalId, intervalLabel, isIndoor, isPushable, planMinutes, type WahooInterval } from '../wahoo'

const program = parseProgram(programJson)
const V = program.version

describe('plan.json dla Wahoo', () => {
  it('17. THR_4x6: nagłówek, rozgrzewka, blok powtórzeń, schłodzenie', () => {
    const plan = buildWahooPlan(program.bike_workouts.THR_4x6!, { durationMin: 0, lthr: 160, ftp: 220, programVersion: V })
    expect(plan.header).toMatchObject({ name: expect.stringContaining('4×6'), version: '1.0.0', workout_type_family: 0, workout_type_location: 1, threshold_hr: 160 })
    // bez celów mocy nie podajemy FTP – inaczej Wahoo liczy z niego bezsensowne TSS i IF
    expect(plan.header.ftp).toBeUndefined()
    // ELEMNT ignoruje cele tętna w planach, więc zakres bpm wchodzi na początek nazwy interwału
    expect(plan.intervals[0]).toMatchObject({ name: '130-142 · Rozgrzewka', exit_trigger_type: 'time', exit_trigger_value: 900, intensity_type: 'wu' })
    expect(plan.intervals[0]!.targets).toEqual([
      { type: 'threshold_hr', low: 0.81, high: 0.89 },
      { type: 'rpm', low: 85, high: 95 },
    ])
    const rep = plan.intervals.find((i) => i.exit_trigger_type === 'repeat') as WahooInterval
    expect(rep.exit_trigger_value).toBe(3) // 3 powtórzenia PO pierwszym = 4 razy łącznie
    expect(rep.intervals).toHaveLength(2)
    expect(rep.intervals![0]).toMatchObject({ exit_trigger_value: 360, intensity_type: 'lt' })
    expect(rep.intervals![0]!.targets![0]).toEqual({ type: 'threshold_hr', low: 0.95, high: 1 })
    expect(rep.intervals![1]).toMatchObject({ intensity_type: 'recover' })
    expect(plan.intervals.at(-1)).toMatchObject({ name: '<130 · Schłodzenie', intensity_type: 'cd' })
    expect(planMinutes(plan)).toBe(program.bike_workouts.THR_4x6!.duration_min)
  })

  it('jazda parametryczna dostaje czas z kalendarza', () => {
    const plan = buildWahooPlan(program.bike_workouts.Z2!, { durationMin: 90, lthr: 160, programVersion: V })
    expect(plan.intervals).toHaveLength(1)
    expect(plan.intervals[0]!.exit_trigger_value).toBe(5400)
    expect(planMinutes(plan)).toBe(90)
  })

  it('LONG_TEMPO ma blok tempa w środku, suma = czas dnia', () => {
    const plan = buildWahooPlan(program.bike_workouts.LONG_TEMPO!, { durationMin: 180, lthr: 160, programVersion: V })
    expect(planMinutes(plan)).toBe(180)
    const rep = plan.intervals.find((i) => i.exit_trigger_type === 'repeat')!
    expect(rep.exit_trigger_value).toBe(2) // 3 bloki tempa
  })

  it('bez LTHR cele idą jako RPE', () => {
    const plan = buildWahooPlan(program.bike_workouts.SS_2x20!, { durationMin: 0, lthr: null, programVersion: V })
    expect(plan.header.threshold_hr).toBeUndefined()
    const rep = plan.intervals.find((i) => i.exit_trigger_type === 'repeat')!
    expect(rep.intervals![0]!.targets![0]).toEqual({ type: 'rpe', low: 6, high: 7 })
  })

  it('test progowy zachowuje intensywność ftp; Wattbike jako trening pod dachem', () => {
    const plan = buildWahooPlan(program.bike_workouts.TEST_LTHR!, { durationMin: 0, lthr: 160, programVersion: V })
    expect(plan.intervals.some((i) => i.intensity_type === 'ftp')).toBe(true)
    expect(plan.header.workout_type_location).toBe(1)
    const indoor = buildWahooPlan(program.bike_workouts.WATTBIKE_TEST!, { durationMin: 0, lthr: 160, programVersion: V })
    expect(indoor.header.workout_type_location).toBe(0)
    expect(isIndoor('INDOOR_4x4')).toBe(true)
    expect(isIndoor('Z2')).toBe(false)
  })

  it('każdy trening z programu daje poprawny plan', () => {
    for (const w of Object.values(program.bike_workouts)) {
      if (!isPushable(w.id)) continue
      const plan = buildWahooPlan(w, { durationMin: w.duration_min, lthr: 160, programVersion: V })
      expect(plan.intervals.length, w.id).toBeGreaterThan(0)
      expect(planMinutes(plan), w.id).toBeGreaterThan(0)
      const walk = (xs: WahooInterval[]) => {
        for (const i of xs) {
          if (i.exit_trigger_type === 'repeat') {
            expect(i.intervals, w.id).toBeTruthy()
            expect(i.targets, `${w.id}: blok powtórzeń nie może mieć celów`).toBeUndefined()
            expect(i.exit_trigger_value, w.id).toBeGreaterThanOrEqual(0)
            walk(i.intervals!)
          } else {
            expect(i.exit_trigger_value, `${w.id}/${i.name}`).toBeGreaterThan(0)
            expect(['active', 'wu', 'tempo', 'lt', 'map', 'ac', 'nm', 'ftp', 'cd', 'recover', 'rest']).toContain(i.intensity_type)
            expect(i.targets, `${w.id}/${i.name}`).toBeTruthy()
          }
        }
      }
      walk(plan.intervals)
    }
  })

  it('odpoczynek i wyjazd nie idą na Bolta; external_id zawiera wersję programu', () => {
    expect(isPushable('REST')).toBe(false)
    expect(isPushable('TRIP')).toBe(false)
    expect(isPushable('TRAVEL_REST')).toBe(false)
    expect(isPushable(null)).toBe(false)
    expect(isPushable('SS_2x20')).toBe(true)
    expect(externalId('2027-01-13', 'SS_2x20', V)).toBe(`2027-01-13:SS_2x20:${V}`)
  })
})

describe('cele tętna w nazwach interwałów', () => {
  it('zakres na początku, nazwa skracana, bez LTHR bez zmian', () => {
    expect(intervalLabel('Rozgrzewka', { low: 0.81, high: 0.89 }, 160)).toBe('130-142 · Rozgrzewka')
    expect(intervalLabel('Przerwa', { low: 0, high: 0.81 }, 160)).toBe('<130 · Przerwa')
    expect(intervalLabel('Rozgrzewka', { low: 0.81, high: 0.89 }, null)).toBe('Rozgrzewka')
    const long = intervalLabel('TEST 30 min – maksymalny równy wysiłek', { low: 0.95, high: 1 }, 160)
    expect(long.startsWith('152-160 · ')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(44)
    expect(long.endsWith('…')).toBe(true)
  })
  it('upał obniża wartości w nazwie (R13)', () => {
    expect(intervalLabel('Z2', { low: 0.81, high: 0.89 }, 160, 4)).toBe('126-138 · Z2')
    const plan = buildWahooPlan(program.bike_workouts.Z2_HEAT!, { durationMin: 90, lthr: 160, heatOffsetBpm: 4, programVersion: V })
    expect(plan.intervals[0]!.name.startsWith('126-138 · ')).toBe(true)
  })
  it('opis uprzedza, gdzie szukać celów tętna', () => {
    const plan = buildWahooPlan(program.bike_workouts.Z2!, { durationMin: 60, lthr: 160, programVersion: V })
    expect(plan.header.description).toContain('w nazwach interwałów')
    const bez = buildWahooPlan(program.bike_workouts.Z2!, { durationMin: 60, lthr: null, programVersion: V })
    expect(bez.header.description).not.toContain('w nazwach interwałów')
  })
})

describe('cele mocy (miernik)', () => {
  const zones = program.power_zones_ftp_fraction
  it('bez miernika: brak ftp w nagłówku i brak celów mocy, tętno w nazwach', () => {
    const plan = buildWahooPlan(program.bike_workouts.SS_2x20!, { durationMin: 0, lthr: 160, ftp: 220, usePowerTargets: false, powerZones: zones, programVersion: V })
    expect(plan.header.ftp).toBeUndefined()
    expect(plan.intervals[0]!.targets!.some((t) => t.type === 'ftp')).toBe(false)
    expect(plan.header.description).toContain('w nazwach interwałów')
  })
  it('z miernikiem: ftp w nagłówku, cel mocy jako pierwszy, tętno zostaje', () => {
    const plan = buildWahooPlan(program.bike_workouts.SS_2x20!, { durationMin: 0, lthr: 160, ftp: 220, usePowerTargets: true, powerZones: zones, programVersion: V })
    expect(plan.header.ftp).toBe(220)
    const rep = plan.intervals.find((i) => i.exit_trigger_type === 'repeat')!
    const work = rep.intervals![0]!
    expect(work.targets![0]).toEqual({ type: 'ftp', low: 0.88, high: 0.94 }) // sweet spot
    expect(work.targets!.some((t) => t.type === 'threshold_hr')).toBe(true)
    expect(plan.intervals[0]!.targets![0]).toEqual({ type: 'ftp', low: 0.56, high: 0.75 }) // rozgrzewka Z2
    expect(plan.header.description).not.toContain('w nazwach interwałów')
  })
  it('każda strefa treningów ma odpowiednik mocy (Z5a dostaje przedział nad FTP)', async () => {
    const { powerFraction, wattsRange } = await import('../zones')
    for (const id of ['Z1', 'Z2', 'Z3', 'SS', 'Z4', 'THR', 'Z5a', 'Z5b', 'Z5c']) expect(powerFraction(id, zones), id).not.toBeNull()
    expect(wattsRange('SS', zones, 220)).toEqual([194, 207])
    expect(wattsRange('SS', zones, null)).toBeNull()
  })
  it('miernik wyłączony → brak ftp nawet gdy podano', () => {
    const plan = buildWahooPlan(program.bike_workouts.Z2!, { durationMin: 60, lthr: 160, ftp: 220, powerZones: zones, programVersion: V })
    expect(plan.header.ftp).toBeUndefined()
  })
})
