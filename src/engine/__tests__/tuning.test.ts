import { describe, expect, it } from 'vitest'
import { generateFromInputs } from '../generator'
import { buildLibrary, LADDERS } from '../generator/library'
import { planInputs, type AthleteProfile, type Goal } from '../onboarding'
import { WEEKDAYS, addDays } from '../dates'
import { buildCalendar } from '../calendar'
import { PLAN_TEMPLATES, TEMPLATE_IDS, allowedTemplates, templateById } from '../generator/templates'
import { clampTuning, defaultTuning, maxKeySessions, tuningBounds } from '../generator/tuning'
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


/* Szablony planów i dopasowanie przez AI (docs/33 § 8): granice pilnuje kod, nie model. */

const extrasOf = (p: AthleteProfile) => ({ weight_kg: p.body.weight_kg, hr_max_bpm: p.measure.hr_max_bpm, longest_ride_min: p.current.longest_ride_min })

/** „Model” losowy i złośliwy: wartości spoza granic, zakazane dni, liczby zmyślone w uzasadnieniach. */
function randomRaw(seed: number) {
  const r = rng(seed * 7919)
  return {
    template: pick(r, [...TEMPLATE_IDS, 'hiit_madness']),
    volume_pct: Math.floor(r() * 160),
    ramp_pct: Math.floor(r() * 25),
    block_weeks: pick(r, [2, 3, 4, 5]),
    key_sessions: Math.floor(r() * 4),
    long_day: pick(r, [...WEEKDAYS, null, 'someday']),
    key_days: r() < 0.5 ? null : [pick(r, WEEKDAYS), pick(r, WEEKDAYS)],
    test_every_blocks: Math.floor(r() * 5),
    why: { template: 'Ten szablon da Ci 437 W.', volume: 'Krótko.', ramp: 'x'.repeat(300), blocks: '', keys: 'Dwa akcenty.', days: 'Ok.' },
  }
}

describe('szablony planów (data/templates)', () => {
  it('każdy szablon i rodzina akcentów są w bibliotece, a identyfikatory są rozpoznawane jako akcenty', () => {
    expect(PLAN_TEMPLATES.map((t) => t.id).toSorted()).toEqual([...TEMPLATE_IDS].toSorted())
    for (const discipline of ['road', 'gravel', 'mtb'] as const) {
      const lib = buildLibrary({ discipline, level: 'power', indoor: true })
      for (const t of PLAN_TEMPLATES) {
        const ladders = [...t.ladders.base, ...t.ladders.build, ...Object.values(t.ladders.specific).flat()]
        for (const l of ladders) for (const [id] of LADDERS[l]) expect(lib[id]?.key, `${t.id}: ${id}`).toBe(true)
      }
      expect(lib.THR_OU_3x9!.key).toBe(true)
      expect(lib.VO2_30_2x10!.duration_min).toBeGreaterThan(30)
      expect(lib.SS_CLIMB_3x15!.description).toMatch(/70–80/)
    }
  })

  it('poziom „odczucie” opisuje nowe akcenty bez watów', () => {
    const lib = buildLibrary({ discipline: 'gravel', level: 'rpe', indoor: false })
    for (const id of ['THR_OU_3x12', 'VO2_30_2x8', 'SS_CLIMB_2x20']) expect(lib[id]!.description).not.toMatch(/FTP|W\b/)
  })
})

describe('dopasowanie planu: granice kodu', () => {
  const cases = Array.from({ length: 160 }, (_, i) => {
    const p = randomProfile(i + 1)
    return { seed: i + 1, p, inp: planInputs(p, TODAY) }
  })

  it('domyślne dopasowanie = plan bez dopasowania (bit w bit)', () => {
    for (const c of cases.slice(0, 40)) {
      const a = generateFromInputs(c.inp, extrasOf(c.p), TODAY)
      const b = generateFromInputs(c.inp, extrasOf(c.p), TODAY, defaultTuning(c.inp))
      expect(b.program, `seed ${c.seed}`).toEqual(a.program)
    }
  })

  it('clamp: dowolna propozycja kończy się zestawem w granicach', () => {
    for (const c of cases) {
      const { tuning: t } = clampTuning(c.inp, randomRaw(c.seed))
      const b = tuningBounds(c.inp)
      expect(b.templates, `seed ${c.seed}`).toContain(t.template)
      expect(t.key_sessions).toBeLessThanOrEqual(maxKeySessions(c.inp))
      expect(t.ramp_pct).toBeLessThanOrEqual(b.ramp_pct[1])
      expect(b.block_weeks).toContain(t.block_weeks)
      expect(t.volume_pct).toBeGreaterThanOrEqual(70)
      expect(t.volume_pct).toBeLessThanOrEqual(100)
      if (t.long_day) expect(c.inp.day_caps_min[t.long_day]).toBeGreaterThan(0)
      // uzasadnienie ze zmyśloną liczbą albo za długie → tekst z reguł
      expect(t.why.template).not.toMatch(/437/)
      expect(t.why.ramp.length).toBeLessThanOrEqual(180)
      expect(t.why.blocks.length).toBeGreaterThan(0)
    }
  })

  it('plan z dowolnym dopasowaniem: budżet, limity dni, akcenty nigdy dzień po dniu', () => {
    for (const c of cases) {
      const { tuning } = clampTuning(c.inp, randomRaw(c.seed))
      const g = generateFromInputs(c.inp, extrasOf(c.p), TODAY, tuning)
      const days = buildCalendar({ program: g.program, settings: g.program.default_settings })
      for (const w of new Set(days.map((d) => d.week))) {
        const ds = weekOf(days, w)
        expect(minutes(ds), `seed ${c.seed}, tydzień ${w}`).toBeLessThanOrEqual(c.inp.weekly_hours * 60 + 1e-9)
        for (const d of ds) if (d.bike && d.bike.workout_id !== 'TRIP') expect(d.bike.duration_min).toBeLessThanOrEqual(c.inp.day_caps_min[d.weekday])
      }
      for (let i = 1; i < days.length; i++) if (days[i - 1]!.day_type === 'key' && days[i]!.day_type === 'key') expect.fail(`seed ${c.seed}: akcenty dzień po dniu ${days[i]!.date}`)
      if (!c.inp.intensity_allowed) expect(days.some((d) => d.day_type === 'key')).toBe(false)
      if (c.inp.cautious) expect(days.some((d) => /^(VO2_|THR_)/.test(d.bike?.workout_id ?? ''))).toBe(false)
      if (tuning.long_day) {
        const longs = days.filter((d) => d.bike?.workout_id === 'LONG' || d.bike?.workout_id === 'LONG_TEMPO')
        if (longs.length) expect(longs.every((d) => d.weekday === tuning.long_day), `seed ${c.seed}`).toBe(true)
      }
    }
  })

  it('szablon zmienia akcenty: spolaryzowany bez sweet spotu w budowie, góry z długimi podjazdami', () => {
    const p = profile({ goal: { type: 'event', date: '2027-09-05', name: 'Alpy', discipline: 'road', distance_km: 120, elevation_m: 3000, target_time_min: null } })
    const inp = planInputs(p, TODAY)
    const ids = (template: string) => {
      const g = generateFromInputs(inp, extrasOf(p), TODAY, clampTuning(inp, { template }).tuning)
      return buildCalendar({ program: g.program, settings: g.program.default_settings }).map((d) => d.bike?.workout_id ?? '')
    }
    expect(ids('climbing').some((id) => id.startsWith('SS_CLIMB_'))).toBe(true)
    expect(ids('polarized').some((id) => id.startsWith('VO2_'))).toBe(true)
    expect(ids('pyramidal').some((id) => id.startsWith('SS_CLIMB_'))).toBe(false)
  })

  it('zdrowie i doświadczenie zawężają szablony; dni z dopasowania trafiają do planu', () => {
    const cautious = planInputs(profile({ health: { injury: true } }), TODAY)
    expect(allowedTemplates({ ...cautious, cautious: true }).map((t) => t.id).toSorted()).toEqual(['comeback', 'pyramidal'])
    const novice = planInputs(profile({ current: { years: 'lt1', hours_4w: 2, longest_ride_min: 60 } }), TODAY)
    expect(allowedTemplates(novice).map((t) => t.id)).not.toContain('polarized')
    expect(clampTuning(novice, { ramp_pct: 10, block_weeks: 4 }).tuning).toMatchObject({ ramp_pct: 7, block_weeks: 3 })
    const inp = planInputs(profile(), TODAY)
    const t = clampTuning(inp, { long_day: 'sun', key_sessions: 2, key_days: ['tue', 'thu'] }).tuning
    expect(t).toMatchObject({ long_day: 'sun', key_days: ['tue', 'thu'] })
    // akcent dzień po długiej (poniedziałek po niedzieli) – odrzucony
    expect(clampTuning(inp, { long_day: 'sat', key_sessions: 2, key_days: ['sun', 'tue'] }).tuning.key_days).toBeNull()
    expect(templateById('comeback').ladders.build).toEqual(['sweet_spot', 'tempo'])
  })
})
