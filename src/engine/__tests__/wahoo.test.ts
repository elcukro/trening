import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { buildWahooPlan, externalId, isIndoor, isPushable, planMinutes, type WahooInterval } from '../wahoo'

const program = parseProgram(programJson)
const V = program.version

describe('plan.json dla Wahoo', () => {
  it('17. THR_4x6: nagłówek, rozgrzewka, blok powtórzeń, schłodzenie', () => {
    const plan = buildWahooPlan(program.bike_workouts.THR_4x6!, { durationMin: 0, lthr: 160, ftp: 220, programVersion: V })
    expect(plan.header).toMatchObject({ name: expect.stringContaining('4×6'), version: '1.0.0', workout_type_family: 0, workout_type_location: 1, threshold_hr: 160 })
    // bez celów mocy nie podajemy FTP – inaczej Wahoo liczy z niego bezsensowne TSS i IF
    expect(plan.header.ftp).toBeUndefined()
    expect(plan.intervals[0]).toMatchObject({ name: 'Rozgrzewka', exit_trigger_type: 'time', exit_trigger_value: 900, intensity_type: 'wu' })
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
    expect(plan.intervals.at(-1)).toMatchObject({ name: 'Schłodzenie', intensity_type: 'cd' })
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
