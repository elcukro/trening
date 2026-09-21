import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import type { EngineContext } from '../types'
import { getDayPlan } from '../plan'
import { computeZones, resolveWorkout } from '../zones'
import { layoutWeeks, TripDateError, earliestTripStart } from '../layout'
import { buildCalendar, scaleDuration } from '../calendar'
import { estimateClimb, powerForKmh } from '../climb'
import { epley1RM, suggestLoad, warmupSets } from '../load'
import { proteinGrams } from '../nutrition'
import { addDays, mondayOf, weekdayOf, isValidISODate } from '../dates'

const program = parseProgram(programJson)
const base: EngineContext = { program, settings: program.default_settings }
const withLthr = (lthr: number): EngineContext => ({ program, settings: { ...program.default_settings, lthr_bpm: lthr } })

function rx(items: { exercise: string; rx: Record<string, unknown> }[], id: string) {
  return items.find((i) => i.exercise === id)?.rx
}

describe('scenariusze ze specyfikacji §10', () => {
  it('1. 16.09.2026: tydzień 1 (reset), Sesja A lekko 2×10 RIR 4, bez jazdy; 26.09 test FTP', () => {
    const d = getDayPlan('2026-09-16', base)!
    expect(d.week).toBe(1)
    expect(d.phase).toBe('PREP')
    expect(d.bike).toBeNull()
    expect(d.day_type).toBe('gym')
    expect(d.gym?.session).toBe('A')
    expect(rx(d.gym!.items, 'back_squat')).toMatchObject({ sets: 2, reps: 10, rir: 4 })
    expect(rx(d.gym!.items, 'rdl')).toMatchObject({ sets: 2, reps: 10, rir: 4 })
    expect(d.nutrition.energy).toBe('deficit_500')
    const t = getDayPlan('2026-09-26', base)!
    expect(t.week).toBe(2)
    expect(t.week_type).toBe('test')
    expect(t.bike?.workout_id).toBe('FTP_TEST')
    expect(t.bike?.duration_min).toBe(65)
    expect(t.flags).toContain('test')
    expect(t.nutrition.energy).toBe('maintenance')
    expect(t.warnings.some((w) => w.rule === 'LTHR')).toBe(true)
  })
  it('1b. Faza I: wt Z2, śr Sesja A, czw akcent, pt Sesja B, sb długa, nd wolne', () => {
    const ids = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((x) => getDayPlan(x, base)!)
    expect(ids.map((d) => d.bike?.workout_id ?? null)).toEqual([null, 'Z2_CADENCE', null, 'SS_2x12', null, 'LONG', null])
    expect(ids.map((d) => d.gym?.session ?? null)).toEqual([null, null, 'A', null, 'B', null, null])
    expect(ids[3]!.day_type).toBe('key')
    expect(ids[0]!.week_notes).toContain('3 jazdy + 2 siłownie')
  })

  it('2. 18.09.2026: brak jazdy, Sesja B step-up 2×8 RIR 4, deficyt 500', () => {
    const d = getDayPlan('2026-09-18', base)!
    expect(d.bike).toBeNull()
    expect(d.gym?.session).toBe('B')
    expect(rx(d.gym!.items, 'step_up')).toMatchObject({ sets: 2, reps: 8, rir: 4 })
    expect(d.nutrition.energy).toBe('deficit_500')
  })

  it('3. 23.12.2026: tydzień 15 rozładowanie – środa tylko siłownia (przysiad 3×5 RIR 3), czwartek Z2 60', () => {
    const d = getDayPlan('2026-12-23', base)!
    expect(d.week).toBe(15)
    expect(d.week_type).toBe('deload')
    expect(d.bike).toBeNull()
    expect(d.gym?.name).toContain('rozładowania')
    expect(rx(d.gym!.items, 'back_squat')).toMatchObject({ sets: 3, reps: 5, rir: 3 })
    const thu = getDayPlan('2026-12-24', base)!
    expect(thu.bike?.workout_id).toBe('Z2')
    expect(thu.bike?.duration_min).toBe(60)
  })

  it('4. 14.01.2027 (czw): SS_2x20 z fallbackiem INDOOR_4x4; 13.01 Sesja A: przysiad 5×4 RIR 2, trap bar 5×3 RIR 2', () => {
    const d = getDayPlan('2027-01-14', base)!
    expect(d.weekday).toBe('thu')
    expect(d.bike?.workout_id).toBe('SS_2x20')
    expect(d.bike?.fallback_workout_id).toBe('INDOOR_4x4')
    expect(d.fallback_workout?.id).toBe('INDOOR_4x4')
    expect(d.fallback_workout?.duration_min).toBe(program.bike_workouts.INDOOR_4x4!.duration_min)
    const g = getDayPlan('2027-01-13', base)!
    expect(g.bike).toBeNull()
    expect(rx(g.gym!.items, 'back_squat')).toMatchObject({ sets: 5, reps: 4, rir: 2 })
    expect(rx(g.gym!.items, 'trap_bar_deadlift')).toMatchObject({ sets: 5, reps: 3, rir: 2 })
  })

  it('5. 23.02.2027 test FTP (zimą fallback Wattbike); 24.02 sprawdzian siłowy przysiad 1×5 RIR 1', () => {
    const t = getDayPlan('2027-02-23', base)!
    expect(t.bike?.workout_id).toBe('FTP_TEST')
    expect(t.bike?.fallback_workout_id).toBe('WATTBIKE_TEST')
    const d = getDayPlan('2027-02-24', base)!
    expect(d.bike).toBeNull()
    expect(rx(d.gym!.items, 'back_squat')).toMatchObject({ sets: 1, reps: 5, rir: 1 })
  })

  it('6. 31.03.2027: TEST_LTHR + Sesja C (przysiad 3×3 RIR 2–3, wskoki 3×3)', () => {
    const d = getDayPlan('2027-03-31', base)!
    expect(d.bike?.workout_id).toBe('TEST_LTHR')
    expect(d.gym?.session).toBe('C')
    expect(rx(d.gym!.items, 'back_squat')).toMatchObject({ sets: 3, reps: 3, rir: '2–3' })
    expect(rx(d.gym!.items, 'box_jump')).toMatchObject({ sets: 3, reps: 3 })
  })

  it('7. 15.05.2027: MOUNTAIN_DAY 240, event Karkonosze, Checkpoint', () => {
    const d = getDayPlan('2027-05-15', base)!
    expect(d.weekday).toBe('sat')
    expect(d.bike?.workout_id).toBe('MOUNTAIN_DAY')
    expect(d.bike?.duration_min).toBe(240)
    expect(d.event).toContain('Weekend w górach #1: Karkonosze')
    expect(d.bike?.bike).toContain('Checkpoint')
    expect(d.flags).toContain('mountain_weekend')
  })

  it('8. 20.08.2027 BLOCK_DAY1 210; 25.08 ostatnia sesja z nogami', () => {
    const d1 = getDayPlan('2027-08-20', base)!
    expect(d1.weekday).toBe('fri')
    expect(d1.bike?.workout_id).toBe('BLOCK_DAY1')
    expect(d1.bike?.duration_min).toBe(210)
    const d2 = getDayPlan('2027-08-25', base)!
    expect(d2.gym?.name).toContain('ostatnia sesja z nogami')
  })

  it('9. 11.09.2027: dzień wyjazdu (TRIP)', () => {
    const d = getDayPlan('2027-09-11', base)!
    expect(d.day_type).toBe('trip')
    expect(d.bike?.workout_id).toBe('TRIP')
    expect(d.days_to_trip).toBe(0)
    expect(getDayPlan('2027-09-13', base)).toBeNull()
  })

  it('10. LTHR 160: Z2 130–142, SS 147–154; zmiana LTHR przelicza cele', () => {
    const z = computeZones(program.hr_zones_lthr_fraction, 160)
    expect(z.find((x) => x.id === 'Z2')).toMatchObject({ low_bpm: 130, high_bpm: 142 })
    expect(z.find((x) => x.id === 'SS')).toMatchObject({ low_bpm: 147, high_bpm: 154 })
    const d160 = getDayPlan('2026-10-01', withLthr(160))!
    const ss = d160.workout!.steps.find((s) => s.zone === 'SS')!
    expect(ss.bpm).toEqual([147, 154])
    const d165 = getDayPlan('2026-10-01', withLthr(165))!
    expect(d165.workout!.steps.find((s) => s.zone === 'SS')!.bpm).toEqual([152, 158])
    expect(d165.warnings).toHaveLength(0)
    expect(d165.zones).not.toBeNull()
  })

  it('11. Zmiana wyjazdu na 25.09.2027: taper 13–26.09, faza V 6 tyg., faza IV dłuższa, I–III bez zmian', () => {
    const ctx: EngineContext = { program, settings: { ...program.default_settings, trip_start: '2027-09-25' } }
    const weeks = layoutWeeks(program, ctx.settings)
    expect(weeks).toHaveLength(55)
    const taper = weeks.filter((w) => w.phase === 'TAPER')
    expect(taper.map((w) => w.monday)).toEqual(['2027-09-13', '2027-09-20'])
    const v = weeks.filter((w) => w.phase === 'V')
    expect(v).toHaveLength(6)
    expect(v[0]!.monday).toBe('2027-08-02')
    const iv = weeks.filter((w) => w.phase === 'IV')
    expect(iv).toHaveLength(14)
    expect(iv[0]!.monday).toBe('2027-04-26')
    expect(iv.filter((w) => w.cloned)).toHaveLength(2)
    expect(iv.at(-1)!.type).toBe('deload')
    // fazy I–III identyczne
    const def = layoutWeeks(program, program.default_settings)
    for (let i = 0; i <= 32; i++) expect(weeks[i]).toEqual(def[i])
    // kalendarz: wyjazd i koniec
    const days = buildCalendar(ctx)
    expect(days.at(-1)!.date).toBe('2027-09-26')
    expect(days.find((d) => d.date === '2027-09-25')!.day_type).toBe('trip')
    expect(days.find((d) => d.date === '2027-09-24')!.bike?.workout_id).toBe('Z1_RECOVERY')
    // klonowane tygodnie nie powtarzają wydarzeń
    expect(days.filter((d) => d.event?.includes('Karkonosze'))).toHaveLength(1)
  })

  it('11b. Wcześniejszy wyjazd skraca fazę IV, potem III (tydzień testowy zostaje)', () => {
    const w = layoutWeeks(program, { ...program.default_settings, trip_start: '2027-08-28' })
    expect(w.filter((x) => x.phase === 'IV')).toHaveLength(10)
    expect(w.filter((x) => x.phase === 'IV' && x.type === 'test')).toHaveLength(1)
    const w2 = layoutWeeks(program, { ...program.default_settings, trip_start: '2027-07-10' })
    expect(w2.filter((x) => x.phase === 'IV')).toHaveLength(6)
    expect(w2.filter((x) => x.phase === 'III').map((x) => x.template)).toContain(29)
    expect(w2.filter((x) => x.phase === 'III')).toHaveLength(5)
    expect(w2.filter((x) => x.phase === 'III').map((x) => x.template)).toEqual([25, 26, 27, 28, 29])
    expect(() => layoutWeeks(program, { ...program.default_settings, trip_start: '2027-05-01' })).toThrow(TripDateError)
    expect(() => layoutWeeks(program, { ...program.default_settings, trip_start: earliestTripStart('2026-09-14') })).not.toThrow()
  })

  it('11c. Długie rozciągnięcie fazy IV wstawia rozładowanie po 3 klonach', () => {
    const w = layoutWeeks(program, { ...program.default_settings, trip_start: '2027-10-30' })
    const iv = w.filter((x) => x.phase === 'IV')
    expect(iv).toHaveLength(19)
    const types = iv.map((x) => x.type).join(',')
    expect(types).not.toContain('deload,deload')
    expect(iv.filter((x) => x.cloned && x.type === 'deload').length).toBeGreaterThan(0)
  })

  it('13. Kalkulator podjazdu: 105 kg/230 W → ~64 min; 90 kg/230 W → ~56 min', () => {
    const a = estimateClimb({ riderKg: 105, watts: 230, km: 8, gradePct: 8.8 })
    expect(Math.abs(a.minutes - 64)).toBeLessThanOrEqual(1)
    const b = estimateClimb({ riderKg: 90, watts: 230, km: 8, gradePct: 8.8 })
    expect(Math.abs(b.minutes - 56)).toBeLessThanOrEqual(1)
    expect(Math.round(powerForKmh(105, 8.8, 7.5))).toBeGreaterThan(225)
    expect(Math.round(powerForKmh(90, 8.8, 7.5))).toBeLessThan(207)
  })

  it('14. Sugestia ciężaru: 4×8 @ 80 kg, RIR 3 (cel 3) → 82,5 kg', () => {
    const s = suggestLoad('back_squat', [{ date: '2026-10-07', rx: { sets: 4, reps: 8, rir: 3 }, sets: Array.from({ length: 4 }, () => ({ weight_kg: 80, reps: 8, rir: 3 })) }], { sets: 4, reps: 8, rir: 3 })
    expect(s.weight_kg).toBe(82.5)
  })
})

describe('R8 – pozostałe przypadki', () => {
  const hist = (sets: { weight_kg: number; reps: number; rir: number | null }[], date = '2026-10-07', reps = 8) => ({ date, rx: { sets: sets.length, reps, rir: 3 }, sets })
  it('brak historii → pytanie o ciężar startowy', () => {
    expect(suggestLoad('back_squat', [], { sets: 4, reps: 8, rir: 3 }).needs_start_weight).toBe(true)
  })
  it('duży zapas → +5 kg', () => {
    expect(suggestLoad('back_squat', [hist([{ weight_kg: 80, reps: 8, rir: 5 }, { weight_kg: 80, reps: 8, rir: 5 }])], { sets: 2, reps: 8, rir: 3 }).weight_kg).toBe(85)
  })
  it('hantle: +1 kg / +2 kg', () => {
    expect(suggestLoad('step_up', [hist([{ weight_kg: 16, reps: 8, rir: 3 }])], { sets: 1, reps: 8, rir: 3 }).weight_kg).toBe(17)
    expect(suggestLoad('step_up', [hist([{ weight_kg: 16, reps: 8, rir: 6 }])], { sets: 1, reps: 8, rir: 3 }).weight_kg).toBe(18)
  })
  it('1 seria z brakiem → ten sam ciężar', () => {
    expect(suggestLoad('back_squat', [hist([{ weight_kg: 80, reps: 8, rir: 3 }, { weight_kg: 80, reps: 6, rir: 3 }])], { sets: 2, reps: 8, rir: 3 }).weight_kg).toBe(80)
  })
  it('≥2 braki dwa razy z rzędu → −10%', () => {
    const bad = [{ weight_kg: 80, reps: 6, rir: 1 }, { weight_kg: 80, reps: 5, rir: 0 }]
    expect(suggestLoad('back_squat', [hist(bad, '2026-10-01'), hist(bad, '2026-10-08')], { sets: 2, reps: 8, rir: 3 }).weight_kg).toBe(72.5)
    expect(suggestLoad('back_squat', [hist(bad, '2026-10-08')], { sets: 2, reps: 8, rir: 3 }).weight_kg).toBe(80)
  })
  it('mniej powtórzeń w nowym tygodniu → +2,5 kg', () => {
    expect(suggestLoad('back_squat', [hist([{ weight_kg: 100, reps: 5, rir: 2 }], '2027-01-06', 5)], { sets: 5, reps: 4, rir: 2 }).weight_kg).toBe(102.5)
  })
  it('rozładowanie → −10%; wdrożenie → bez zmian', () => {
    expect(suggestLoad('back_squat', [hist([{ weight_kg: 100, reps: 8, rir: 3 }])], { sets: 3, reps: 5, rir: 3 }, { deload: true }).weight_kg).toBe(90)
    expect(suggestLoad('back_squat', [hist([{ weight_kg: 60, reps: 10, rir: 4 }])], { sets: 2, reps: 10, rir: 4 }, { intro: true }).weight_kg).toBe(60)
  })
  it('e1RM i serie wstępne', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.67, 1)
    expect(epley1RM(100, 1)).toBe(100)
    expect(warmupSets(100)).toEqual([{ weight_kg: 20, reps: 8 }, { weight_kg: 50, reps: 5 }, { weight_kg: 70, reps: 3 }, { weight_kg: 85, reps: 2 }])
    expect(warmupSets(20)).toHaveLength(1)
  })
})

describe('R16 – volume_scale', () => {
  it('skaluje tylko jazdy niekluczowe z minimami 45/90', () => {
    expect(scaleDuration('Z2', 60, 0.7)).toBe(45)
    expect(scaleDuration('Z2', 90, 0.7)).toBe(65)
    expect(scaleDuration('LONG', 120, 0.7)).toBe(90)
    expect(scaleDuration('LONG', 300, 0.8)).toBe(240)
    expect(scaleDuration('SS_2x20', 75, 0.7)).toBe(75)
    expect(scaleDuration('MOUNTAIN_DAY', 240, 0.7)).toBe(240)
    expect(scaleDuration('Z2', 45, 0.7)).toBe(45)
  })
  it('kalendarz z volume_scale 0,8 zmienia tylko dozwolone treningi', () => {
    const ctx: EngineContext = { program, settings: { ...program.default_settings, volume_scale: 0.8 } }
    const days = buildCalendar(ctx)
    const ref = buildCalendar(base)
    days.forEach((d, i) => {
      const r = ref[i]!
      if (!d.bike || !(d.bike.workout_id in { Z2: 1, Z2_CADENCE: 1, Z2_FORCE: 1, Z2_HEAT: 1, LONG: 1, LONG_TEMPO: 1, HILLS: 1 })) {
        expect(d.bike?.duration_min).toBe(r.bike?.duration_min)
      } else {
        expect(d.bike.duration_min).toBeLessThanOrEqual(r.bike!.duration_min)
      }
    })
    expect(days.find((d) => d.date === '2027-05-29')!.bike?.duration_min).toBe(215)
  })
})

describe('resolveWorkout', () => {
  it('jazda parametryczna dostaje czas z kalendarza', () => {
    const r = resolveWorkout(program.bike_workouts.Z2!, 90, 160)
    expect(r.duration_min).toBe(90)
    expect(r.steps[0]!.duration_s).toBe(5400)
    expect(r.steps[0]!.bpm).toEqual([130, 142])
  })
  it('LONG_TEMPO wstawia blok tempa w środku', () => {
    const r = resolveWorkout(program.bike_workouts.LONG_TEMPO!, 180, 160)
    const total = r.steps.reduce((a, s) => a + s.duration_s, 0)
    expect(total).toBe(180 * 60)
    expect(r.steps.filter((s) => s.zone === 'Z3')).toHaveLength(3)
    expect(r.steps.filter((s) => s.repeat_label === '2/3')).toHaveLength(2)
  })
  it('interwały rozwijane z etykietą powtórzeń, bez LTHR bpm = null', () => {
    const r = resolveWorkout(program.bike_workouts.THR_4x6!, 0, null)
    expect(r.has_bpm).toBe(false)
    expect(r.steps.filter((s) => s.name.startsWith('Interwał'))).toHaveLength(4)
    expect(r.steps[1]!.bpm).toBeNull()
    expect(r.steps[1]!.repeat_label).toBe('1/4')
  })
  it('upał obniża cele o 4 bpm', () => {
    const d = getDayPlan('2027-06-01', withLthr(160))!
    expect(d.flags).toContain('heat')
    expect(d.workout!.steps[0]!.bpm).toEqual([126, 138])
  })
})

describe('gym_days: Sesja A we wtorek', () => {
  it('przenosi A/C na wtorek, B zostaje w piątek, treść bez zmian', () => {
    const ctx: EngineContext = { program, settings: { ...program.default_settings, gym_days: { A: 'tue', B: 'fri', C: 'tue' } } }
    const tue = getDayPlan('2026-09-15', ctx)!
    const wed = getDayPlan('2026-09-16', ctx)!
    expect(tue.gym?.session).toBe('A')
    expect(wed.gym).toBeNull()
    expect(tue.gym).toEqual(getDayPlan('2026-09-16', base)!.gym)
    expect(getDayPlan('2026-09-18', ctx)!.gym?.session).toBe('B')
    expect(getDayPlan('2027-03-30', ctx)!.gym?.session).toBe('C')
    expect(getDayPlan('2027-09-01', ctx)!.gym?.session).toBe('CORE')
  })
})

describe('pomocnicze', () => {
  it('białko: 1,8 × 90 = 160 g (zaokr. do 5)', () => {
    expect(proteinGrams({ energy: 'maintenance', label: '', protein_g_per_kg: 1.8, on_bike_carbs_g_per_h: [0, 0] }, 90)).toBe(160)
  })
  it('daty', () => {
    expect(weekdayOf('2026-09-14')).toBe('mon')
    expect(mondayOf('2027-09-11')).toBe('2027-09-06')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(isValidISODate('2027-02-30')).toBe(false)
    expect(isValidISODate('2027-02-28')).toBe(true)
  })
  it('dni poza kalendarzem → null', () => {
    expect(getDayPlan('2026-09-10', base)).toBeNull()
    expect(getDayPlan('2026-09-11', base)?.week).toBe(0)
  })
})

describe('plan – API pomocnicze', () => {
  it('getWeekPlan zwraca 7 dni od poniedziałku, getSeason układ + dni', async () => {
    const { getWeekPlan, getSeason, calendarRange, exerciseOf, gymSessionMinutes } = await import('../plan')
    const { zoneById } = await import('../zones')
    const week = getWeekPlan('2026-09-16', base)
    expect(week).toHaveLength(7)
    expect(week[0]!.date).toBe('2026-09-14')
    expect(week[0]!.week_notes).toContain('Wyjście ze zmęczenia')
    expect(week[2]!.phase_name).toContain('Przygotowanie')
    const season = getSeason(base)
    expect(season.weeks).toHaveLength(53)
    expect(season.days).toHaveLength(367)
    expect(calendarRange(base)).toEqual({ start: '2026-09-11', end: '2027-09-12' })
    expect(exerciseOf(base, 'back_squat')?.name).toContain('Przysiad')
    expect(gymSessionMinutes(week[2]!.gym!)).toBe(70)
    expect(zoneById(program, 'SS')?.low).toBe(0.92)
    expect(getWeekPlan('2026-09-07', base)).toHaveLength(3)
  })
})

describe('czas w strefach z histogramu (Strava)', () => {
  it('rozkłada sekundy po strefach dla LTHR 160', async () => {
    const { zoneDistribution } = await import('../zones')
    const hist: number[] = []
    hist[120] = 600 // Z1 (<130)
    hist[135] = 1800 // Z2 130–142
    hist[150] = 300 // SS 147–154 (przed Z4/THR w kolejności listy)
    hist[165] = 60 // Z5a 160–163? 165 → Z5b 165–170
    const d = zoneDistribution(hist, program.hr_zones_lthr_fraction, 160)
    const by = Object.fromEntries(d.map((x) => [x.id, x.seconds]))
    expect(by.Z1).toBe(600)
    expect(by.Z2).toBe(1800)
    expect(by.SS).toBe(300)
    expect(by.Z5b).toBe(60)
    expect(d.reduce((a, x) => a + x.seconds, 0)).toBe(2760)
    expect(d.find((x) => x.id === 'Z2')!.pct).toBe(65)
  })
})
