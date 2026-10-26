import { describe, expect, it } from 'vitest'
import {
  CONSENT_VERSION,
  STEPS,
  checks,
  experienceOf,
  finalize,
  firstIncomplete,
  healthScreen,
  nextStep,
  planInputs,
  prevStep,
  stepNumber,
  stepValid,
  withDays,
  withGoalType,
  type AthleteProfile,
  type Draft,
} from '../onboarding'

const TODAY = '2026-10-26'
const NO = { heart: false, chest_pain: false, dizziness: false, supervised: false, chronic: false, meds: false, injury: false }

/** Komplet odpowiedzi – zawodnik z miernikiem, 8 h tygodniowo, wydarzenie w czerwcu. */
function full(): Draft {
  return {
    time: { hours_per_week: 8, days: ['tue', 'thu', 'sat', 'sun'], weekday_max_min: 90, weekend_max_min: 240, fixed: [{ day: 'sat', kind: 'group_ride' }] },
    current: { hours_4w: 6, longest_ride_min: 180, years: '3to5' },
    measure: { level: 'power', ftp_w: 240 },
    gear: { disciplines: ['road', 'gravel'], bikes: ['road'], trainer: 'smart', devices: ['wahoo'] },
    consent: { health_data: true, at: '2026-10-26T10:00:00Z', version: CONSENT_VERSION },
    body: { height_cm: 180, weight_kg: 82, birth_date: '1985-05-01', sex: 'male' },
    health: { ...NO },
    goal: { type: 'event', date: '2027-06-20', discipline: 'road', distance_km: 160, elevation_m: 2500 },
  }
}

describe('kroki', () => {
  it('numeracja i nawigacja', () => {
    expect(stepNumber('time')).toBe(1)
    expect(stepNumber('goal_detail')).toBe(STEPS.length)
    expect(nextStep('time')).toBe('time_detail')
    expect(nextStep('goal_detail')).toBe('summary')
    expect(prevStep('time')).toBeNull()
    expect(prevStep('current')).toBe('time_detail')
    expect(prevStep('summary')).toBe('goal_detail')
  })

  it('pusty szkic zaczyna od czasu, pełny kończy na podsumowaniu', () => {
    expect(firstIncomplete({})).toBe('time')
    expect(firstIncomplete(full())).toBe('summary')
    const d = full()
    delete d.health
    expect(firstIncomplete(d)).toBe('health')
  })

  it('ciało jest opcjonalne, zgoda nie', () => {
    expect(stepValid('body', {})).toBe(true)
    expect(stepValid('body', { body: { height_cm: 300 } })).toBe(false)
    expect(stepValid('consent', {})).toBe(false)
    expect(stepValid('consent', { consent: { health_data: false as unknown as true, at: 'x', version: '1' } })).toBe(false)
  })

  it('limit dnia roboczego wymagany tylko przy dniach roboczych', () => {
    const weekendOnly: Draft = { time: { hours_per_week: 4, days: ['sat', 'sun'], weekend_max_min: 180 } }
    expect(stepValid('time_detail', weekendOnly)).toBe(false) // brak weekday_max_min w ogóle
    expect(stepValid('time_detail', { time: { ...weekendOnly.time, weekday_max_min: 0 } })).toBe(true)
    expect(stepValid('time_detail', { time: { ...weekendOnly.time, weekday_max_min: 0, weekend_max_min: 0 } })).toBe(false)
    expect(stepValid('time_detail', { time: { ...weekendOnly.time, weekday_max_min: 0, fixed: [{ day: 'wed', kind: 'commute' }] } })).toBe(false)
  })

  it('dni bez powtórzeń i stały punkt raz na dzień', () => {
    expect(stepValid('time', { time: { hours_per_week: 5, days: ['mon', 'mon'] } })).toBe(false)
    const d = full()
    d.time!.fixed = [
      { day: 'sat', kind: 'group_ride' },
      { day: 'sat', kind: 'race' },
    ]
    expect(stepValid('time_detail', d)).toBe(false)
  })

  it('withDays sortuje dni i usuwa stałe punkty z dni niedostępnych', () => {
    const d = withDays(full(), ['sun', 'tue'])
    expect(d.time?.days).toEqual(['tue', 'sun'])
    expect(d.time?.fixed).toEqual([])
  })

  it('zmiana typu celu czyści stare pola, ten sam typ zostawia', () => {
    const d = full()
    expect(withGoalType(d, 'event')).toBe(d)
    expect(withGoalType(d, 'ftp').goal).toEqual({ type: 'ftp' })
    expect(stepValid('goal', withGoalType(d, 'ftp'))).toBe(true)
    expect(stepValid('goal_detail', withGoalType(d, 'ftp'))).toBe(false)
  })
})

describe('finalize', () => {
  it('uzupełnia wartości domyślne', () => {
    const d = full()
    delete d.body
    d.measure = { level: 'rpe' }
    const r = finalize(d)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.profile.version).toBe(1)
    expect(r.profile.body).toEqual({ height_cm: null, weight_kg: null, birth_date: null, sex: null })
    expect(r.profile.measure).toEqual({ level: 'rpe', ftp_w: null, lthr_bpm: null, hr_max_bpm: null })
    expect(r.profile.goal).toMatchObject({ name: null, target_time_min: null })
  })

  it('zwraca ścieżki błędów', () => {
    const d = full()
    d.current = { hours_4w: -1 }
    const r = finalize(d)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.issues).toContain('current.hours_4w')
    expect(r.issues).toContain('current.years')
  })

  it.each([
    [{ type: 'ftp', target_w: 280 }],
    [{ type: 'speed', kmh: 30, hours: 2.5 }],
    [{ type: 'weight', target_kg: 78, date: '2027-05-01' }],
    [{ type: 'fitness', weekly_hours: 6, weeks: 12 }],
    [{ type: 'comeback', weeks_off: 10, reason: 'injury', weekly_hours: 4 }],
  ])('każdy typ celu ma mierzalne kryterium: %o', (goal) => {
    const d = { ...full(), goal } as Draft
    expect(finalize(d).ok).toBe(true)
    expect(finalize({ ...d, goal: { type: goal.type } } as Draft).ok).toBe(false)
  })
})

describe('zdrowie', () => {
  it('czerwone flagi → lekarz, żółte → ostrożnie', () => {
    expect(healthScreen(NO)).toEqual({ level: 'ok', flags: [] })
    expect(healthScreen(undefined).level).toBe('ok')
    expect(healthScreen({ ...NO, injury: true, meds: true })).toEqual({ level: 'caution', flags: ['meds', 'injury'] })
    expect(healthScreen({ ...NO, injury: true, chest_pain: true })).toEqual({ level: 'doctor', flags: ['chest_pain'] })
  })
})

describe('checks', () => {
  const ids = (d: Draft) => checks(d, TODAY).map((c) => c.id)

  it('komplet bez uwag', () => {
    expect(ids(full())).toEqual([])
  })

  it('godziny ponad limit dni', () => {
    const d = full()
    d.time!.hours_per_week = 12 // 2×1,5 h + 2×4 h = 11 h
    expect(checks(d, TODAY)[0]).toMatchObject({ id: 'time_cap', text: expect.stringContaining('11 h') })
  })

  it('skok objętości', () => {
    const d = full()
    d.current!.hours_4w = 2
    expect(ids(d)).toContain('ramp')
  })

  it('data celu: minęła albo za blisko', () => {
    const d = full()
    d.goal = { ...d.goal, date: '2026-10-01' } as Draft['goal']
    expect(ids(d)).toContain('goal_past')
    d.goal = { ...d.goal, date: '2026-11-10' } as Draft['goal']
    expect(ids(d)).toContain('goal_soon')
  })

  it('tempo chudnięcia i cel masy nie niższy', () => {
    const d = full()
    d.goal = { type: 'weight', target_kg: 70, date: '2027-01-04' } // 12 kg w 10 tygodni
    expect(ids(d)).toContain('weight_rate')
    d.goal = { type: 'weight', target_kg: 85, date: '2027-06-01' }
    expect(ids(d)).toEqual(['weight_up'])
  })

  it('miernik bez urządzenia i czerwona flaga', () => {
    const d = full()
    d.gear!.devices = []
    d.health = { ...NO, heart: true }
    expect(ids(d)).toEqual(['power_no_device', 'health_doctor'])
  })
})

const exp = (current: AthleteProfile['current']) => experienceOf({ current })

describe('planInputs', () => {
  const profile = (patch: (d: Draft) => void = () => {}): AthleteProfile => {
    const d = full()
    patch(d)
    const r = finalize(d)
    if (!r.ok) throw new Error(r.issues.join(', '))
    return r.profile
  }

  it('limity dni, start objętości, horyzont', () => {
    const p = planInputs(profile(), TODAY)
    expect(p.day_caps_min).toEqual({ mon: 0, tue: 90, wed: 0, thu: 90, fri: 0, sat: 240, sun: 240 })
    expect(p.weekly_hours).toBe(8)
    expect(p.start_weekly_hours).toBe(6.5)
    expect(p.weeks_to_goal).toBe(33)
    expect(p).toMatchObject({ measure: 'power', ftp_w: 240, discipline: 'road', indoor: true, experience: 'intermediate', intensity_allowed: true, cautious: false })
  })

  it('godziny przycięte do limitu, dyscyplina z listy, bez daty', () => {
    const p = planInputs(
      profile((d) => {
        d.time!.hours_per_week = 20
        d.gear = { ...d.gear, disciplines: ['gravel'], trainer: 'none' }
        d.goal = { type: 'ftp', target_w: 280 }
      }),
      TODAY,
    )
    expect(p.weekly_hours).toBe(11)
    expect(p.discipline).toBe('gravel')
    expect(p.indoor).toBe(false)
    expect(p.weeks_to_goal).toBeNull()
  })

  it('zdrowie i powrót po przerwie', () => {
    const doc = planInputs(profile((d) => (d.health = { ...NO, dizziness: true })), TODAY)
    expect(doc).toMatchObject({ intensity_allowed: false, cautious: true })
    const back = planInputs(profile((d) => (d.goal = { type: 'comeback', weeks_off: 20, reason: 'illness', weekly_hours: 4 })), TODAY)
    expect(back).toMatchObject({ intensity_allowed: true, cautious: true })
  })

  it('doświadczenie', () => {
    expect(exp({ years: 'lt1', hours_4w: 10, longest_ride_min: 300 })).toBe('novice')
    expect(exp({ years: '3to5', hours_4w: 2, longest_ride_min: 60 })).toBe('novice')
    expect(exp({ years: '10plus', hours_4w: 8, longest_ride_min: 300 })).toBe('experienced')
    expect(exp({ years: '10plus', hours_4w: 4, longest_ride_min: 300 })).toBe('intermediate')
  })
})
