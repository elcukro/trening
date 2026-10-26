import { describe, expect, it } from 'vitest'
import { generateProgram, generateFromInputs, estimateFtp, programStart, GENERATED_PROGRAM_ID } from '../generator'
import { buildLibrary, LADDERS, testIdFor } from '../generator/library'
import { ladderFor, pickRung } from '../generator/structure'
import { planInputs, type AthleteProfile, type Goal } from '../onboarding'
import { WEEKDAYS, addDays, diffDays, type Weekday } from '../dates'
import { buildCalendar, getCalendarWeek } from '../calendar'
import { getDayPlan } from '../plan'
import type { CalendarDay } from '../types'

const TODAY = '2026-10-26' // poniedziałek

type Over = Partial<{ [K in keyof AthleteProfile]: Partial<AthleteProfile[K]> }> & { goal?: Goal }

function profile(o: Over = {}): AthleteProfile {
  return {
    version: 1,
    time: { hours_per_week: 7, days: ['tue', 'thu', 'sat', 'sun'], weekday_max_min: 90, weekend_max_min: 240, fixed: [], ...o.time },
    current: { hours_4w: 5, longest_ride_min: 150, years: '3to5', ...o.current },
    measure: { level: 'power', ftp_w: 230, lthr_bpm: 165, hr_max_bpm: 185, ...o.measure },
    gear: { disciplines: ['road'], bikes: ['road'], trainer: 'smart', devices: ['wahoo'], ...o.gear },
    consent: { health_data: true, at: '2026-10-26T10:00:00Z', version: '2026-10-26' },
    body: { height_cm: 180, weight_kg: 80, birth_date: '1985-05-05', sex: 'male', ...o.body },
    health: { heart: false, chest_pain: false, dizziness: false, supervised: false, chronic: false, meds: false, injury: false, ...o.health },
    goal: o.goal ?? { type: 'ftp', target_w: 260, date: '2027-04-04' },
  }
}

/* ------------------------------------------------------------------ pomocnicze */

const weekOf = (days: CalendarDay[], w: number) => days.filter((d) => d.week === w)
const minutes = (days: CalendarDay[]) => days.reduce((s, d) => s + (d.bike && d.bike.workout_id !== 'TRIP' ? d.bike.duration_min : 0), 0)

/** Prosty deterministyczny generator liczb (LCG) – profile losowe, ale powtarzalne. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!

function randomProfile(seed: number): AthleteProfile {
  const r = rng(seed)
  const nDays = 1 + Math.floor(r() * 7)
  const days = [...WEEKDAYS].toSorted(() => r() - 0.5).slice(0, nDays).toSorted((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
  const hasWeekday = days.some((d) => d !== 'sat' && d !== 'sun')
  const hasWeekend = days.some((d) => d === 'sat' || d === 'sun')
  const fixed: AthleteProfile['time']['fixed'] = []
  if (r() < 0.3) fixed.push({ day: pick(r, days), kind: pick(r, ['group_ride', 'commute', 'race', 'other'] as const) })
  const goals: Goal[] = [
    { type: 'event', date: addDays(TODAY, 20 + Math.floor(r() * 500)), name: 'Gran Fondo', discipline: pick(r, ['road', 'gravel', 'mtb']), distance_km: 50 + Math.floor(r() * 200), elevation_m: Math.floor(r() * 4000), target_time_min: null },
    { type: 'ftp', target_w: 200 + Math.floor(r() * 150), date: r() < 0.5 ? addDays(TODAY, 30 + Math.floor(r() * 300)) : null },
    { type: 'speed', kmh: 25 + Math.floor(r() * 10), hours: 2, date: r() < 0.5 ? addDays(TODAY, 30 + Math.floor(r() * 300)) : null },
    { type: 'weight', target_kg: 65 + Math.floor(r() * 20), date: addDays(TODAY, 30 + Math.floor(r() * 400)) },
    { type: 'fitness', weekly_hours: 3 + Math.floor(r() * 8), weeks: 4 + Math.floor(r() * 40), date: null },
    { type: 'comeback', weeks_off: 1 + Math.floor(r() * 100), reason: 'illness', weekly_hours: 2 + Math.floor(r() * 6), date: null },
  ]
  const red = r() < 0.08
  const yellow = r() < 0.15
  return profile({
    time: { hours_per_week: 1 + Math.round(r() * 38) / 2, days, weekday_max_min: hasWeekday ? 30 + Math.floor(r() * 10) * 15 : 0, weekend_max_min: hasWeekend ? 45 + Math.floor(r() * 12) * 30 : 0, fixed },
    current: { hours_4w: Math.round(r() * 20) / 2, longest_ride_min: Math.floor(r() * 300), years: pick(r, ['lt1', '1to3', '3to5', '5to10', '10plus'] as const) },
    measure: { level: pick(r, ['power', 'hr', 'rpe'] as const), ftp_w: r() < 0.5 ? 150 + Math.floor(r() * 150) : null, lthr_bpm: r() < 0.5 ? 150 + Math.floor(r() * 30) : null, hr_max_bpm: null },
    gear: { disciplines: [pick(r, ['road', 'gravel', 'mtb'] as const)], bikes: ['road'], trainer: pick(r, ['none', 'smart'] as const), devices: [] },
    body: { height_cm: null, weight_kg: r() < 0.7 ? 55 + Math.floor(r() * 50) : null, birth_date: null, sex: null },
    health: { heart: red, chest_pain: false, dizziness: false, supervised: false, chronic: yellow, meds: false, injury: false },
    goal: pick(r, goals),
  })
}

const SEEDS = Array.from({ length: 160 }, (_, i) => i + 1)

/* ------------------------------------------------------------------ własności */

describe('generator – własności dla losowych profili', () => {
  const cases = SEEDS.map((seed) => {
    const p = randomProfile(seed)
    const inp = planInputs(p, TODAY)
    const gen = generateProgram(p, TODAY)
    const days = buildCalendar({ program: gen.program, settings: gen.program.default_settings })
    return { seed, p, inp, gen, days }
  })

  it('program przechodzi schemat i buduje kalendarz z co najmniej 2 tygodniami', () => {
    for (const c of cases) {
      expect(c.gen.program.default_settings.program_id).toBe(GENERATED_PROGRAM_ID)
      expect(Object.keys(c.gen.program.weeks).length, `seed ${c.seed}`).toBeGreaterThanOrEqual(2)
      expect(c.days.length, `seed ${c.seed}`).toBeGreaterThan(7)
    }
  })

  it('tygodniowy czas jazdy nie przekracza dostępnego, a dzień nie przekracza swojego limitu', () => {
    for (const c of cases) {
      const weeks = new Set(c.days.map((d) => d.week))
      for (const w of weeks) {
        const ds = weekOf(c.days, w)
        expect(minutes(ds), `seed ${c.seed}, tydzień ${w}`).toBeLessThanOrEqual(c.inp.weekly_hours * 60 + 1e-9)
        for (const d of ds) {
          if (!d.bike || d.bike.workout_id === 'TRIP') continue
          expect(d.bike.duration_min, `seed ${c.seed}, ${d.date} ${d.bike.workout_id}`).toBeLessThanOrEqual(c.inp.day_caps_min[d.weekday])
        }
      }
    }
  })

  it('dni niedostępne są wolne, dojazdy zostają dojazdami', () => {
    for (const c of cases) {
      for (const d of c.days) {
        if (d.bike?.workout_id === 'TRIP') continue
        if (c.inp.day_caps_min[d.weekday] === 0) expect(d.bike, `seed ${c.seed}, ${d.date}`).toBeNull()
        if (c.inp.fixed.some((f) => f.day === d.weekday && f.kind === 'commute') && d.bike) expect(d.bike.workout_id).toBe('COMMUTE')
      }
    }
  })

  it('nigdy dwóch akcentów dzień po dniu', () => {
    for (const c of cases) {
      for (let i = 1; i < c.days.length; i++) {
        const a = c.days[i - 1]!
        const b = c.days[i]!
        if (a.day_type === 'key' && b.day_type === 'key') expect.fail(`seed ${c.seed}: akcenty ${a.date} (${a.bike?.workout_id}) i ${b.date} (${b.bike?.workout_id}) dzień po dniu`)
      }
    }
  })

  it('rozładowanie co N tygodni w środku planu, nigdy dwa pod rząd', () => {
    for (const c of cases) {
      const sk = c.gen.skeleton
      const middle = sk.weeks.filter((w) => w.phase !== 'PREP' && w.phase !== 'TAPER')
      middle.forEach((w, i) => {
        const j = i + 1
        const last = j === middle.length
        if (j % sk.block === 0 && !last) expect(w.type, `seed ${c.seed}, tydzień ${w.index}`).toBe('deload')
        else expect(w.type, `seed ${c.seed}, tydzień ${w.index}`).not.toBe('deload')
      })
      for (let i = 1; i < sk.weeks.length; i++) expect(sk.weeks[i - 1]!.type === 'deload' && sk.weeks[i]!.type === 'deload', `seed ${c.seed}`).toBe(false)
      // flaga `deload` w dniach tygodnia rozładowania
      for (const d of c.days) expect(d.flags.includes('deload'), `seed ${c.seed}, ${d.date}`).toBe(d.week_type === 'deload')
    }
  })

  it('test kalibracyjny w tygodniu 0 (gdy wolno i jest dzień), test co dwa bloki, żadnego przy czerwonej fladze', () => {
    for (const c of cases) {
      const tests = c.days.filter((d) => d.flags.includes('test'))
      if (!c.inp.intensity_allowed) {
        expect(tests, `seed ${c.seed}`).toHaveLength(0)
        expect(c.days.some((d) => d.day_type === 'key'), `seed ${c.seed}`).toBe(false)
        continue
      }
      const w0 = c.gen.skeleton.weeks[0]!
      if (!c.inp.cautious && c.gen.layout.calibration) {
        expect(w0.test, `seed ${c.seed}`).toBe(true)
        expect(weekOf(c.days, 0).some((d) => d.flags.includes('test')), `seed ${c.seed}`).toBe(true)
      }
      // test tylko w tygodniach oznaczonych jako testowe i właściwy dla poziomu pomiaru
      for (const d of tests) {
        expect(d.week_type, `seed ${c.seed}, ${d.date}`).toBe('test')
        expect(d.bike?.workout_id).toBe(testIdFor(c.inp.measure))
      }
      // między testami co najmniej jeden blok
      const testWeeks = [...new Set(tests.map((d) => d.week))]
      for (let i = 1; i < testWeeks.length; i++) expect(testWeeks[i]! - testWeeks[i - 1]!, `seed ${c.seed}`).toBeGreaterThanOrEqual(c.gen.skeleton.block)
    }
  })

  it('cel z datą do roku: plan kończy się w dniu celu; dalej albo bez daty: plan kroczący', () => {
    for (const c of cases) {
      const date = 'date' in c.p.goal ? c.p.goal.date : null
      const s = c.gen.program.default_settings
      if (date && diffDays(date, s.program_start) < 52 * 7) {
        expect(c.gen.skeleton.horizon, `seed ${c.seed}`).toBe('to_goal')
        expect(s.trip_start, `seed ${c.seed}`).toBe(date)
        // dzień po celu istnieje tylko, gdy cel nie wypada w niedzielę (ostatni szablon kończy się w niedzielę)
        expect(c.days.at(-1)!.date >= date, `seed ${c.seed}`).toBe(true)
      } else {
        expect(c.gen.skeleton.horizon, `seed ${c.seed}`).toBe('rolling')
        expect(Object.keys(c.gen.program.weeks).length).toBeLessThanOrEqual(52)
      }
      expect(s.program_start).toBe(programStart(TODAY))
    }
  })

  it('żywienie: deficyt z masy tylko przy celu masy', () => {
    for (const c of cases) {
      const n = c.gen.program.nutrition
      if (c.p.goal.type === 'weight') {
        expect(n.weight_based, `seed ${c.seed}`).toBeDefined()
        expect(n.weight_based!.deficit_shares_per_week).toBeGreaterThan(0)
        expect(c.gen.program.default_settings.body_weight_target_kg).toBeLessThanOrEqual(c.gen.program.default_settings.body_weight_start_kg)
      } else {
        expect(n.weight_based).toBeUndefined()
        expect(Object.values(n.deficit_by_phase).every((v) => v === false)).toBe(true)
      }
    }
  })

  it('plan dnia z silnika działa dla każdego dnia (strefy, żywienie, białko)', () => {
    for (const c of cases.filter((_, i) => i % 8 === 0)) {
      const ctx = { program: c.gen.program, settings: c.gen.program.default_settings }
      for (const d of c.days) {
        const plan = getDayPlan(d.date, ctx)
        expect(plan, `seed ${c.seed}, ${d.date}`).not.toBeNull()
        expect(plan!.protein_g).toBeGreaterThan(0)
        if (plan!.workout) expect(plan!.workout.duration_min).toBe(d.bike!.duration_min)
      }
    }
  })

  it('poziom „odczucie” mówi językiem RPE, nie watów ani LTHR', () => {
    for (const c of cases.filter((x) => x.inp.measure === 'rpe')) {
      const used = new Set(c.days.map((d) => d.bike?.workout_id).filter(Boolean))
      for (const id of used) {
        const w = c.gen.program.bike_workouts[id!]!
        expect(w.description, `seed ${c.seed}, ${id}`).not.toMatch(/% FTP|LTHR/)
      }
      expect(c.gen.program.default_settings.power_meter).toBe(false)
    }
  })

  it('ostrożnie (żółta flaga, powrót): jeden akcent najwyżej sweet spot, test nie w tygodniu 0', () => {
    for (const c of cases.filter((x) => x.inp.cautious && x.inp.intensity_allowed)) {
      expect(c.gen.skeleton.weeks[0]!.test, `seed ${c.seed}`).toBe(false)
      for (const d of c.days) if (d.day_type === 'key' && !d.flags.includes('test')) expect(d.bike!.workout_id, `seed ${c.seed}, ${d.date}`).toMatch(/^(SS_|TEMPO_|RACE)/)
      const weeks = new Set(c.days.map((d) => d.week))
      for (const w of weeks) expect(weekOf(c.days, w).filter((d) => d.day_type === 'key').length, `seed ${c.seed}`).toBeLessThanOrEqual(1)
    }
  })

  it('objętość rośnie najwyżej o 10 % tygodniowo między tygodniami budującymi', () => {
    for (const c of cases) {
      const sk = c.gen.skeleton
      let prev: number | null = null
      for (const w of sk.weeks) {
        if (w.type !== 'build') {
          // tydzień testowy ma 90 % objętości – do porównania bierzemy wartość przed obcięciem
          if (w.type === 'test' && w.phase !== 'PREP') prev = w.minutes / 0.9
          continue
        }
        if (prev) expect(w.minutes, `seed ${c.seed}, tydzień ${w.index}`).toBeLessThanOrEqual(Math.round((prev * 1.1) / 5) * 5 + 5)
        prev = w.minutes
      }
    }
  })

  it('jest deterministyczny', () => {
    const a = generateProgram(randomProfile(7), TODAY)
    const b = generateProgram(randomProfile(7), TODAY)
    expect(JSON.stringify(a.program)).toBe(JSON.stringify(b.program))
  })
})

/* ------------------------------------------------------------------ regresja: dwóch znanych zawodników */

describe('generator – zawodnicy podobni do istniejących programów', () => {
  it('„Alpy”: 5 jazd, miernik, wydarzenie górskie we wrześniu 2027', () => {
    const p = profile({
      time: { hours_per_week: 7.5, days: ['tue', 'wed', 'fri', 'sat', 'sun'], weekday_max_min: 90, weekend_max_min: 240, fixed: [] },
      current: { hours_4w: 5, longest_ride_min: 180, years: '5to10' },
      measure: { level: 'power', ftp_w: 220, lthr_bpm: 160, hr_max_bpm: null },
      gear: { disciplines: ['road', 'gravel'], bikes: ['road', 'gravel'], trainer: 'none', devices: ['wahoo'] },
      body: { height_cm: 186, weight_kg: 106, birth_date: '1980-01-01', sex: 'male' },
      goal: { type: 'event', date: '2027-09-11', name: 'Alpy', discipline: 'road', distance_km: 500, elevation_m: 9000, target_time_min: null },
    })
    const { program, skeleton, layout } = generateProgram(p, TODAY)
    const days = buildCalendar({ program, settings: program.default_settings })
    expect(skeleton.horizon).toBe('to_goal')
    expect(skeleton.weeks.length).toBe(46)
    expect(layout.long).toBe('sat')
    expect(layout.keys).toHaveLength(2)
    expect(layout.keys).toEqual(['tue', 'fri']) // drugi akcent przed długą, nie dzień po niej
    expect(skeleton.weeks.filter((w) => w.type === 'deload').length).toBeGreaterThanOrEqual(9)
    expect(skeleton.weeks.filter((w) => w.phase === 'TAPER')).toHaveLength(2)
    expect([...new Set(skeleton.weeks.map((w) => w.phase))]).toEqual(['PREP', 'I', 'II', 'III', 'TAPER'])
    // test FTP w niedzielę tygodnia 0 (ostatni dostępny dzień) i co 8 tygodni
    expect(weekOf(days, 0).find((d) => d.flags.includes('test'))?.weekday).toBe('sun')
    expect(skeleton.weeks.filter((w) => w.test).map((w) => w.index)).toEqual([0, 9, 17, 25, 33, 41])
    // dochodzi do 7,5 h i tam zostaje; długa rośnie do limitu 4 h
    const build = skeleton.weeks.filter((w) => w.type === 'build')
    expect(Math.max(...build.map((w) => w.minutes))).toBe(450)
    expect(Math.max(...days.filter((d) => d.weekday === 'sat').map((d) => d.bike?.duration_min ?? 0))).toBeLessThanOrEqual(240)
    // trasa górzysta: faza III na progu
    expect(days.filter((d) => d.phase === 'III' && d.day_type === 'key' && !d.flags.includes('test')).some((d) => d.bike!.workout_id.startsWith('THR_'))).toBe(true)
    expect(program.nutrition.weight_based).toBeUndefined()
    expect(program.bikes.default).toBe('Rower szosowy')
    expect(program.rules.text.find((r) => r.id === 'R2')!.text).toMatch(/niedziel/)
    expect(program.rules.long_catchup_onto).toEqual(['easy'])
    expect(program.meta.target.label).toBe('Data wydarzenia')
    expect(days.at(-1)!.date).toBe('2027-09-12')
    expect(days.find((d) => d.date === '2027-09-11')!.bike!.workout_id).toBe('TRIP')
  })

  it('„FTP 300”: długa w poniedziałek, trenażer, cel mocowy w czerwcu 2027', () => {
    const p = profile({
      time: { hours_per_week: 9, days: ['mon', 'wed', 'thu', 'fri', 'sat'], weekday_max_min: 90, weekend_max_min: 90, fixed: [] },
      current: { hours_4w: 7.5, longest_ride_min: 230, years: '5to10' },
      measure: { level: 'power', ftp_w: 235, lthr_bpm: 170, hr_max_bpm: 193 },
      gear: { disciplines: ['road'], bikes: ['road'], trainer: 'smart', devices: ['wahoo'] },
      body: { height_cm: 178, weight_kg: 73, birth_date: '1990-01-01', sex: 'male' },
      goal: { type: 'ftp', target_w: 300, date: '2027-06-28' },
    })
    // wolny poniedziałek z długą trasą: w onboardingu to limit dnia roboczego 270 i stały punkt „inne” w poniedziałek
    p.time.weekday_max_min = 270
    p.time.fixed = [{ day: 'mon', kind: 'other' }]
    const { program, skeleton, layout } = generateProgram(p, TODAY)
    const days = buildCalendar({ program, settings: program.default_settings })
    expect(skeleton.horizon).toBe('to_goal')
    expect(layout.long).toBe('mon')
    expect(layout.keys.length).toBe(2)
    expect(layout.keys.every((k) => k !== 'mon')).toBe(true)
    expect(program.goal).toEqual({ kind: 'ftp', label: 'FTP 300 W', short: 'FTP 300 W' })
    expect(program.default_settings.ftp_w_goal).toBe(300)
    expect(program.default_settings.power_meter).toBe(true)
    expect(program.features).toEqual(['ftp_suggestions'])
    // faza III = VO2max, taper kończy się testem
    expect(days.filter((d) => d.phase === 'III' && d.day_type === 'key' && !d.flags.includes('test')).some((d) => d.bike!.workout_id.startsWith('VO2_'))).toBe(true)
    const last = skeleton.weeks.at(-1)!
    expect(last.phase).toBe('TAPER')
    expect(last.test).toBe(true)
    expect(program.phases.map((ph) => ph.id)).toEqual(['PREP', 'I', 'II', 'III', 'TAPER'])
    // każdy tydzień mieści się w 9 h, a w fazie II są interwały progowe
    expect(days.some((d) => d.phase === 'II' && d.bike?.workout_id.startsWith('THR_'))).toBe(true)
    expect(program.week_summary.length).toBe(skeleton.weeks.length)
  })

  it('cel masy: deficyt z masy, białko 1,8 g/kg, R10 o redukcji', () => {
    const p = profile({ goal: { type: 'weight', target_kg: 72, date: '2027-05-01' } })
    const { program } = generateProgram(p, TODAY)
    expect(program.nutrition.weight_based).toMatchObject({ max_kcal_per_day: 500, max_loss_pct_per_week: 0.7 })
    expect(program.nutrition.protein_g_per_kg).toBe(1.8)
    expect(program.default_settings.body_weight_target_kg).toBe(72)
    expect(program.rules.text.find((r) => r.id === 'R10')!.text).toMatch(/0,7 %/)
    const day = getDayPlan(addDays(programStart(TODAY), 8), { program, settings: program.default_settings })!
    expect(day.nutrition.label).toMatch(/deficyt|bilans/)
  })

  it('czerwona flaga: tylko spokojne jazdy, bez testów i akcentów, faza I do końca', () => {
    const p = profile({ health: { heart: true } })
    const { program, skeleton } = generateProgram(p, TODAY)
    const days = buildCalendar({ program, settings: program.default_settings })
    expect(days.every((d) => d.day_type !== 'key')).toBe(true)
    expect(skeleton.weeks.every((w) => w.phase === 'PREP' || w.phase === 'I')).toBe(true)
    expect(program.rules.tests).toHaveLength(0)
  })

  it('bez urządzeń: pętla na czas, opisy w odczuciu, bez miernika', () => {
    const p = profile({ measure: { level: 'rpe', ftp_w: null, lthr_bpm: null, hr_max_bpm: null }, gear: { disciplines: ['gravel'], bikes: ['gravel'], trainer: 'none', devices: [] } })
    const { program } = generateProgram(p, TODAY)
    const days = buildCalendar({ program, settings: program.default_settings })
    expect(weekOf(days, 0).find((d) => d.flags.includes('test'))!.bike!.workout_id).toBe('TEST_LOOP')
    expect(program.bike_workouts.Z2!.description).toMatch(/pełnymi zdaniami/)
    expect(program.default_settings.ftp_w_estimate).toBe(estimateFtp(80, 'intermediate'))
    expect(program.bikes.default).toBe('Gravel')
    expect(days.some((d) => d.bike?.workout_id === 'HILLS')).toBe(true)
  })

  it('stałe punkty: jazda z grupą w sobotę jako długa, wyścig jako akcent', () => {
    const p = profile({ time: { hours_per_week: 8, days: ['tue', 'thu', 'sat', 'sun'], weekday_max_min: 90, weekend_max_min: 240, fixed: [{ day: 'sat', kind: 'group_ride' }, { day: 'tue', kind: 'race' }] } })
    const { program, layout } = generateProgram(p, TODAY)
    const days = buildCalendar({ program, settings: program.default_settings })
    expect(layout.group).toBe('sat')
    expect(layout.long).toBe('sat')
    expect(layout.race).toBe('tue')
    expect(days.filter((d) => d.weekday === 'sat' && d.week === 3)[0]!.bike!.workout_id).toBe('GROUP_RIDE')
    expect(days.filter((d) => d.weekday === 'tue' && d.week === 3)[0]!.bike!.workout_id).toBe('RACE')
  })

  it('mało czasu: 2 h na dwa dni – jedna długa i jeden akcent, nic ponad budżet', () => {
    const p = profile({ time: { hours_per_week: 2, days: ['wed', 'sun'], weekday_max_min: 60, weekend_max_min: 120, fixed: [] }, current: { hours_4w: 1.5, longest_ride_min: 60, years: '1to3' } })
    const { program, layout } = generateProgram(p, TODAY)
    const days = buildCalendar({ program, settings: program.default_settings })
    expect(layout.long).toBe('sun')
    expect(layout.keys).toEqual(['wed'])
    for (const w of new Set(days.map((d) => d.week))) expect(minutes(weekOf(days, w))).toBeLessThanOrEqual(120)
  })

  it('cel bez daty: 16 tygodni kroczących, forma – tyle tygodni, ile zawodnik podał', () => {
    const a = generateProgram(profile({ goal: { type: 'ftp', target_w: 250, date: null } }), TODAY)
    expect(a.skeleton.weeks).toHaveLength(16)
    expect(a.skeleton.horizon).toBe('rolling')
    expect(a.program.meta.target.label).toBe('Koniec planu')
    const b = generateProgram(profile({ goal: { type: 'fitness', weekly_hours: 5, weeks: 8, date: null } }), TODAY)
    expect(b.skeleton.weeks).toHaveLength(8)
    expect(b.skeleton.weeks.filter((w) => w.phase === 'TAPER')).toHaveLength(0)
    const c = generateProgram(profile({ goal: { type: 'comeback', weeks_off: 52, reason: 'injury', weekly_hours: 5, date: null } }), TODAY)
    expect(c.skeleton.weeks).toHaveLength(16)
    expect(c.skeleton.block).toBe(3)
  })

  it('cel za mniej niż 4 tygodnie: krótki plan bez budowania', () => {
    const { skeleton } = generateProgram(profile({ goal: { type: 'event', date: addDays(TODAY, 15), name: null, discipline: 'road', distance_km: 100, elevation_m: 500, target_time_min: null } }), TODAY)
    expect(skeleton.weeks.length).toBeLessThanOrEqual(4)
    expect(skeleton.weeks.every((w) => w.type !== 'deload')).toBe(true)
  })

  it('start planu: ten poniedziałek do czwartku, od piątku następny', () => {
    expect(programStart('2026-10-26')).toBe('2026-10-26')
    expect(programStart('2026-10-29')).toBe('2026-10-26')
    expect(programStart('2026-10-30')).toBe('2026-11-02')
    expect(programStart('2026-11-01')).toBe('2026-11-02')
  })

  it('pierwszy tydzień do podglądu „Gotowe!”', () => {
    const { program } = generateProgram(profile(), TODAY)
    const week = getCalendarWeek(program.default_settings.program_start, { program, settings: program.default_settings })
    expect(week).toHaveLength(7)
    expect(week.filter((d) => d.bike).length).toBe(4)
    expect(week.find((d) => d.weekday === 'sun')!.bike!.workout_id).toBe('FTP_TEST')
  })
})

describe('generator – biblioteka i drabinki', () => {
  it('biblioteka ma to, czego wymaga silnik i reguły', () => {
    for (const level of ['power', 'hr', 'rpe'] as const) {
      const lib = buildLibrary({ discipline: 'mtb', level, indoor: false })
      for (const id of ['REST', 'Z1_RECOVERY', 'Z2', 'LONG', 'INDOOR_4x4', 'TRIP', 'OPENERS', 'DELOAD', 'MTB_SKILLS', testIdFor(level)]) expect(lib[id], id).toBeDefined()
      for (const w of Object.values(lib)) expect(w.duration_min, w.id).toBeGreaterThanOrEqual(0)
    }
    expect(buildLibrary({ discipline: 'road', level: 'hr', indoor: true }).MTB_SKILLS).toBeUndefined()
  })

  it('szczebel drabinki nie przekracza limitu dnia, nowicjusz wchodzi wolniej', () => {
    const lib = buildLibrary({ discipline: 'road', level: 'power', indoor: true })
    expect(pickRung(lib, 'sweet_spot', 10, 60, 'intermediate')).toBe('SS_2x12') // 59 min
    expect(pickRung(lib, 'sweet_spot', 10, 58, 'intermediate')).toBe('SS_2x10')
    expect(pickRung(lib, 'sweet_spot', 10, 240, 'intermediate')).toBe(LADDERS.sweet_spot.at(-1)![0])
    expect(pickRung(lib, 'threshold', 1, 240, 'novice')).toBe('THR_4x6')
    expect(pickRung(lib, 'threshold', 1, 240, 'intermediate')).toBe('THR_4x8')
    expect(pickRung(lib, 'vo2max', 0, 40, 'intermediate')).toBeNull()
  })

  it('drabinka zależy od fazy i celu', () => {
    const inp = planInputs(profile(), TODAY)
    expect(ladderFor(inp, 'I', false)).toBe('sweet_spot')
    expect(ladderFor(inp, 'II', false)).toBe('threshold')
    expect(ladderFor(inp, 'III', false)).toBe('vo2max')
    expect(ladderFor(planInputs(profile({ goal: { type: 'speed', kmh: 30, hours: 2, date: null } }), TODAY), 'III', false)).toBe('threshold')
    expect(ladderFor({ ...inp, cautious: true }, 'III', false)).toBe('sweet_spot')
    expect(ladderFor(planInputs(profile({ goal: { type: 'event', date: '2027-06-01', name: null, discipline: 'road', distance_km: 100, elevation_m: 200, target_time_min: null } }), TODAY), 'III', true)).toBe('tempo')
  })

  it('generateFromInputs działa bez masy i progów', () => {
    const inp = planInputs(profile({ measure: { level: 'hr', ftp_w: null, lthr_bpm: null, hr_max_bpm: null }, body: { weight_kg: null } }), TODAY)
    const { program } = generateFromInputs(inp, { weight_kg: null, hr_max_bpm: null, longest_ride_min: 0 }, TODAY)
    expect(program.default_settings.ftp_w_estimate).toBe(180)
    expect(program.default_settings.lthr_bpm).toBeNull()
    expect(program.default_settings.body_weight_start_kg).toBe(75)
  })
})

/** Pomocnicze do ręcznego podglądu: `PRINT=1 npx vitest run generator`. */
if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PRINT) {
  const { program, skeleton } = generateProgram(profile(), TODAY)
  const days = buildCalendar({ program, settings: program.default_settings })
  for (const w of skeleton.weeks) {
    const ds = weekOf(days, w.index)
    const line = (WEEKDAYS as readonly Weekday[]).map((wd) => {
      const d = ds.find((x) => x.weekday === wd)
      return d?.bike ? `${wd} ${d.bike.workout_id} ${d.bike.duration_min}` : `${wd} –`
    })
    console.log(`${String(w.index).padStart(2)} ${w.phase.padEnd(5)} ${w.type.padEnd(6)} ${String(w.minutes).padStart(3)}′ | ${line.join(' | ')}`)
  }
}
