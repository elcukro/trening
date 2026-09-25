import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { buildCalendar } from '../calendar'
import { addDays } from '../dates'
import { applyOverrides, coreOnlySession, lighterSession, restingHrAlarm, validateSwap, warningsFor, type CheckinLike, type LogLike, type RuleContext } from '../rules'
import type { CalendarDay, EngineContext, PlanOverride } from '../types'

const program = parseProgram(programJson)
const ctxEngine: EngineContext = { program, settings: program.default_settings }
const ALL = buildCalendar(ctxEngine)

function week(around: string, before = 3, after = 4): CalendarDay[] {
  return ALL.filter((d) => d.date >= addDays(around, -before) && d.date <= addDays(around, after))
}
function rules(over: Partial<RuleContext> = {}): RuleContext {
  return { program, logs: [], checkins: [], today: '2027-05-12', ...over }
}
function ov(date: string, kind: PlanOverride['kind'], payload: Record<string, unknown> = {}): PlanOverride {
  return { id: `${date}-${kind}`, date, kind, payload }
}
const rx = (d: CalendarDay | undefined, ex: string) => d?.gym?.items.find((i) => i.exercise === ex)?.rx

describe('R9 – 48 h ochrony (scenariusz 12)', () => {
  it('Sesja C przeniesiona ze środy 12.05 na piątek 14.05 przed górami 15.05 daje ostrzeżenie i propozycje', () => {
    const w = week('2027-05-12', 1, 5)
    expect(w.find((d) => d.date === '2027-05-12')!.gym?.session).toBe('C')
    expect(w.find((d) => d.date === '2027-05-15')!.flags).toContain('mountain_weekend')
    // bez przeniesienia – cisza
    expect(warningsFor('2027-05-12', w, rules()).filter((x) => x.rule === 'R9')).toHaveLength(0)
    // po przeniesieniu na piątek
    const moved = applyOverrides(w, [ov('2027-05-12', 'move', { to: '2027-05-14', what: 'gym' })], program)
    expect(moved.find((d) => d.date === '2027-05-12')!.gym).toBeNull()
    expect(moved.find((d) => d.date === '2027-05-14')!.gym?.session).toBe('C')
    const warn = warningsFor('2027-05-14', moved, rules()).find((x) => x.rule === 'R9')!
    expect(warn.severity).toBe('warn')
    expect(warn.message).toContain('48 h')
    expect(warn.actions!.map((a) => a.label)).toEqual([expect.stringContaining('środę 12.05'), 'Zamień na core i mobilność'])
  })

  it('walidacja zamiany blokuje naruszenie R9 i dwa akcenty pod rząd', () => {
    const w = week('2027-05-12', 1, 5)
    expect(validateSwap('2027-05-12', '2027-05-14', w).ok).toBe(false)
    expect(validateSwap('2027-05-12', '2027-05-14', w).reason).toContain('48 h')
    const w2 = week('2026-09-16', 2, 3)
    expect(validateSwap('2026-09-15', '2026-09-16', w2).ok).toBe(true)
    expect(validateSwap('2026-09-16', '2026-10-01', w2).ok).toBe(false)
  })

  it('sesja core nie ma ćwiczeń na nogi', () => {
    const a = ALL.find((d) => d.date === '2026-09-16')!.gym!
    const core = coreOnlySession(a)
    expect(core.items.some((i) => i.exercise === 'back_squat')).toBe(false)
    expect(core.items.some((i) => i.exercise === 'pallof_press')).toBe(true)
  })
})

describe('R4 – gołoledź', () => {
  it('akcent zimą zamienia się na trening pod dachem', () => {
    const w = week('2027-01-14', 0, 1)
    const day = w.find((d) => d.date === '2027-01-14')!
    expect(day.bike?.fallback_workout_id).toBe('INDOOR_4x4')
    const [after] = applyOverrides([day], [ov('2027-01-14', 'indoor')], program)
    expect(after!.bike?.workout_id).toBe('INDOOR_4x4')
    expect(after!.bike?.bike).toContain('Wattbike')
  })
  it('długa jazda pod dachem to 90 min Z2', () => {
    const day = ALL.find((d) => d.date === '2027-01-16')!
    expect(day.day_type).toBe('long')
    const [after] = applyOverrides([day], [ov(day.date, 'indoor')], program)
    expect(after!.bike?.workout_id).toBe('Z2')
    expect(after!.bike?.duration_min).toBe(90)
  })
  it('pogoda z gołoledzią daje ostrzeżenie z akcją', () => {
    const w = week('2027-01-14', 0, 1)
    const warn = warningsFor('2027-01-14', w, rules({ today: '2027-01-14', weather: { icy: true } })).find((x) => x.rule === 'R4')!
    expect(warn.actions![0]!.kind).toBe('indoor')
  })
})

describe('R5 – choroba', () => {
  it('gorączka kasuje dzień, katar zostawia Z1 45 min', () => {
    const day = ALL.find((d) => d.date === '2026-09-16')!
    const [fever] = applyOverrides([day], [ov(day.date, 'sick', { level: 'fever' })], program)
    expect(fever!.bike).toBeNull()
    expect(fever!.gym).toBeNull()
    expect(fever!.day_type).toBe('rest')
    const [cold] = applyOverrides([day], [ov(day.date, 'sick', { level: 'cold' })], program)
    expect(cold!.bike?.workout_id).toBe('Z1_RECOVERY')
    expect(cold!.bike?.duration_min).toBe(45)
    expect(cold!.gym).toBeNull()
  })
  it('zaznaczona choroba w check-inie proponuje oba warianty', () => {
    const w = week('2026-09-16', 2, 2)
    const warn = warningsFor('2026-09-16', w, rules({ today: '2026-09-16', checkins: [{ date: '2026-09-16', sick: true }] })).find((x) => x.rule === 'R5')!
    expect(warn.actions!.map((a) => a.payload.level)).toEqual(['fever', 'cold'])
  })
})

describe('R6 – słaby check-in', () => {
  it('suma ocen ≤ 6 obniża akcent do Z2 60 i sesję o serię', () => {
    const w = week('2026-09-30', 2, 2) // akcent jest w środę (blok 5 jazd)
    const checkins: CheckinLike[] = [{ date: '2026-09-30', sleep: 2, legs: 2, motivation: 2 }]
    const warn = warningsFor('2026-09-30', w, rules({ today: '2026-09-30', checkins })).find((x) => x.rule === 'R6')!
    expect(warn.severity).toBe('warn')
    expect(warn.actions![0]!.kind).toBe('downgrade')
    const [after] = applyOverrides([w.find((d) => d.date === '2026-09-30')!], [ov('2026-09-30', 'downgrade')], program)
    expect(after!.bike?.workout_id).toBe('Z2')
    expect(after!.bike?.duration_min).toBe(60)
    // siłownia wraca dopiero 16.11 – obniżenie sesji sprawdzamy na środzie tygodnia 11
    const [gym] = applyOverrides([ALL.find((d) => d.date === '2026-11-25')!], [ov('2026-11-25', 'downgrade')], program)
    expect(rx(gym, 'back_squat')).toMatchObject({ sets: 3, rir: 4 }) // z 4×8 RIR 3
  })
  it('tętno spoczynkowe +7 przez dwa dni z rzędu', () => {
    const base: CheckinLike[] = [
      { date: '2026-09-10', resting_hr: 50 },
      { date: '2026-09-11', resting_hr: 51 },
      { date: '2026-09-12', resting_hr: 49 },
      { date: '2026-09-13', resting_hr: 50 },
      { date: '2026-09-14', resting_hr: 62 },
      { date: '2026-09-15', resting_hr: 63 },
    ]
    expect(restingHrAlarm(base, '2026-09-15')).toBe(true)
    expect(restingHrAlarm(base, '2026-09-14')).toBe(false)
    expect(restingHrAlarm(base.slice(0, 2), '2026-09-11')).toBe(false)
  })
  it('lżejsza sesja zdejmuje serię i podnosi RIR, także w zakresach', () => {
    const s = ALL.find((d) => d.date === '2026-11-25')!.gym!
    const light = lighterSession(s)
    const before = s.items.find((i) => i.exercise === 'back_squat')!.rx
    const after = light.items.find((i) => i.exercise === 'back_squat')!.rx
    expect(after.sets).toBe((before.sets as number) - 1)
    expect(String(after.rir)).toBe(String(before.rir).includes('–') ? '3–4' : String(Number(before.rir) + 1))
    expect(light.name).toContain('lżejsza')
  })
})

describe('R1, R2, R3 – pominięte treningi', () => {
  // faza III: akcent w środę, Z2 w czwartek – przeniesienie ma sens
  const w = week('2027-03-04', 3, 3)
  it('pominięty środowy akcent proponuje czwartek (dzień z lekką jazdą)', () => {
    const logs: LogLike[] = [{ date: '2027-03-03', kind: 'bike', status: 'skipped' }]
    const warn = warningsFor('2027-03-04', w, rules({ today: '2027-03-04', logs })).find((x) => x.rule === 'R1')!
    expect(warn.message).toContain('nie został wykonany')
    expect(warn.actions![0]).toMatchObject({ kind: 'move', date: '2027-03-03', payload: { to: '2027-03-04', what: 'bike' } })
  })
  it('pominięty czwartkowy akcent (fazy I–II) przepada – nie ma propozycji na piątek', () => {
    const w2 = week('2026-10-02', 2, 2)
    const logs: LogLike[] = [{ date: '2026-10-01', kind: 'bike', status: 'skipped' }]
    expect(warningsFor('2026-10-01', w2, rules({ today: '2026-10-02', logs })).filter((x) => x.rule === 'R1')).toHaveLength(0)
    expect(warningsFor('2026-10-02', w2, rules({ today: '2026-10-02', logs })).filter((x) => x.rule === 'R1')).toHaveLength(0)
  })
  it('przeniesienie akcentu czyści środę i zajmuje czwartek', () => {
    const moved = applyOverrides(w, [ov('2027-03-03', 'move', { to: '2027-03-04', what: 'bike' })], program)
    expect(moved.find((d) => d.date === '2027-03-03')!.bike).toBeNull()
    expect(moved.find((d) => d.date === '2027-03-04')!.bike?.workout_id).toBe('THR_4x6')
    expect(moved.find((d) => d.date === '2027-03-03')!.day_type).toBe('gym')
  })
  it('pominięta sobotnia długa jazda proponuje niedzielę', () => {
    const w2 = week('2026-09-20', 2, 1)
    const logs: LogLike[] = [{ date: '2026-09-19', kind: 'bike', status: 'skipped' }]
    const warn = warningsFor('2026-09-20', w2, rules({ today: '2026-09-20', logs })).find((x) => x.rule === 'R2')!
    expect(warn.actions![0]!.payload).toMatchObject({ to: '2026-09-20', what: 'bike' })
  })
  it('pominięta Sesja B przepada, Sesja A da się przenieść', () => {
    const w3 = week('2026-09-19', 4, 1)
    const logsB: LogLike[] = [{ date: '2026-09-18', kind: 'gym', status: 'skipped' }]
    const wb = warningsFor('2026-09-19', w3, rules({ today: '2026-09-19', logs: logsB })).find((x) => x.rule === 'R3')!
    expect(wb.message).toContain('Sesja B z piątku przepada')
    const w4 = week('2026-09-17', 2, 1)
    const logsA: LogLike[] = [{ date: '2026-09-16', kind: 'gym', status: 'skipped' }]
    const wa = warningsFor('2026-09-17', w4, rules({ today: '2026-09-17', logs: logsA })).find((x) => x.rule === 'R3')!
    expect(wa.actions![0]!.payload).toMatchObject({ what: 'gym', to: '2026-09-17' })
    expect(wa.message).toContain('Sesja A ze środy')
  })
})

describe('R15 – zamiana dni', () => {
  it('zamienia rower i siłownię między dniami', () => {
    const w = week('2026-09-16', 2, 2)
    const swapped = applyOverrides(w, [ov('2026-09-14', 'swap', { swap_with: '2026-09-17' })], program)
    expect(swapped.find((d) => d.date === '2026-09-14')!.bike?.workout_id).toBe('Z2')
    expect(swapped.find((d) => d.date === '2026-09-17')!.bike).toBeNull()
  })
})

describe('R7, R12, R13', () => {
  it('dwa nieudane akcenty sugerują mniej serii', () => {
    // R7 ostrzega w dzień siłowni, a ta wraca dopiero 16.11 – bierzemy piątek tygodnia 12 i akcenty z czwartków
    const w = week('2026-12-04', 14, 2)
    const logs: LogLike[] = [
      { date: '2026-11-26', kind: 'bike', status: 'modified', rpe: 9 },
      { date: '2026-12-03', kind: 'bike', status: 'skipped' },
    ]
    const warn = warningsFor('2026-12-04', w, rules({ today: '2026-12-04', logs })).find((x) => x.rule === 'R7')
    expect(warn?.message).toContain('o jedną serię mniej')
  })
  it('tydzień rozładowania i upał mają komunikaty', () => {
    const w = week('2026-10-21', 1, 1)
    expect(warningsFor('2026-10-21', w, rules({ today: '2026-10-21' })).some((x) => x.rule === 'R12')).toBe(true)
    const heat = week('2027-06-01', 0, 1)
    expect(warningsFor('2027-06-01', heat, rules({ today: '2027-06-01' })).some((x) => x.rule === 'R13')).toBe(true)
  })
})

describe('pominięcie dnia', () => {
  it('skip usuwa wybrany element', () => {
    const day = ALL.find((d) => d.date === '2026-09-16')!
    const [onlyGym] = applyOverrides([day], [ov(day.date, 'skip', { what: 'bike' })], program)
    expect(onlyGym!.bike).toBeNull()
    expect(onlyGym!.gym).not.toBeNull()
    const [nothing] = applyOverrides([day], [ov(day.date, 'skip', { what: 'both' })], program)
    expect(nothing!.day_type).toBe('rest')
  })
})

describe('znaczniki wędrują z treningiem', () => {
  it('zamiana przenosi „test”, a „rozładowanie” zostaje przy tygodniu', () => {
    const w = week('2026-09-24', 3, 3)
    const swapped = applyOverrides(w, [ov('2026-09-22', 'swap', { swap_with: '2026-09-26' })], program)
    expect(swapped.find((d) => d.date === '2026-09-22')!.flags).toContain('test')
    expect(swapped.find((d) => d.date === '2026-09-26')!.flags).not.toContain('test')
    const deload = week('2026-10-21', 1, 1)
    const sw2 = applyOverrides(deload, [ov('2026-10-20', 'swap', { swap_with: '2026-10-21' })], program)
    expect(sw2.every((d) => d.flags.includes('deload'))).toBe(true)
  })
  it('przeniesienie jazdy zabiera jej znaczniki', () => {
    const w = week('2026-09-25', 3, 2)
    const moved = applyOverrides(w, [ov('2026-09-26', 'move', { to: '2026-09-25', what: 'bike' })], program)
    expect(moved.find((d) => d.date === '2026-09-25')!.flags).toContain('test')
    expect(moved.find((d) => d.date === '2026-09-26')!.flags).not.toContain('test')
  })
})
