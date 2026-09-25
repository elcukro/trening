import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program-ftp300.json'
import alpsJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { buildCalendar } from '../calendar'
import { addDays } from '../dates'
import { applyOverrides, warningsFor, type LogLike, type RuleContext } from '../rules'
import type { CalendarDay, EngineContext, PlanOverride } from '../types'

/**
 * Reguły R1–R3 i R12 na programie FTP 300 (pn długa, śr akcent, pt drugi akcent, sb Z2 + jedyna siłownia).
 * Pilnują, że silnik nie zakłada tygodnia programu alpejskiego (docs/18, krok 2).
 */
const program = parseProgram(programJson)
const ctxEngine: EngineContext = { program, settings: program.default_settings }
const ALL = buildCalendar(ctxEngine)

function week(around: string, before = 3, after = 4): CalendarDay[] {
  return ALL.filter((d) => d.date >= addDays(around, -before) && d.date <= addDays(around, after))
}
function rules(over: Partial<RuleContext> = {}): RuleContext {
  return { program, logs: [], checkins: [], today: '2027-05-12', ...over }
}
const only = (rule: string, date: string, w: CalendarDay[], ctx: RuleContext) => warningsFor(date, w, ctx).filter((x) => x.rule === rule)

describe('FTP 300 – pominięte treningi', () => {
  it('pominięta poniedziałkowa długa przepada – wtorek wolny, środa akcent, brak propozycji', () => {
    const w = week('2026-11-10', 2, 3)
    const logs: LogLike[] = [{ date: '2026-11-09', kind: 'bike', status: 'skipped' }]
    for (const d of ['2026-11-10', '2026-11-11', '2026-11-12']) expect(only('R2', d, w, rules({ today: d, logs }))).toHaveLength(0)
  })

  it('pominięty piątkowy akcent przepada – sobota ma siłownię', () => {
    const w = week('2026-11-07', 3, 2)
    const logs: LogLike[] = [{ date: '2026-11-06', kind: 'bike', status: 'skipped' }]
    expect(only('R1', '2026-11-07', w, rules({ today: '2026-11-07', logs }))).toHaveLength(0)
    expect(only('R1', '2026-11-06', w, rules({ today: '2026-11-07', logs }))).toHaveLength(0)
  })

  it('środowy akcent przed piątkowym nie trafia na czwartek (dwa akcenty dzień po dniu)', () => {
    const w = week('2026-11-05', 3, 3)
    const logs: LogLike[] = [{ date: '2026-11-04', kind: 'bike', status: 'skipped' }]
    expect(only('R1', '2026-11-05', w, rules({ today: '2026-11-05', logs }))).toHaveLength(0)
  })

  it('w tygodniu z jednym akcentem środa przechodzi na czwartek, bez wzmianki o siłowni', () => {
    const w = week('2026-10-08', 3, 3)
    const logs: LogLike[] = [{ date: '2026-10-07', kind: 'bike', status: 'skipped' }]
    const warn = only('R1', '2026-10-08', w, rules({ today: '2026-10-08', logs }))[0]!
    expect(warn.actions![0]).toMatchObject({ kind: 'move', date: '2026-10-07', payload: { to: '2026-10-08', what: 'bike' } })
    expect(warn.message).not.toContain('Sesja')
  })

  it('pominięta sobotnia siłownia przepada, z poprawną odmianą dnia', () => {
    const w = week('2026-11-08', 3, 3)
    const logs: LogLike[] = [{ date: '2026-11-07', kind: 'gym', status: 'skipped' }]
    const warn = only('R3', '2026-11-08', w, rules({ today: '2026-11-08', logs }))
    expect(warn).toHaveLength(1)
    expect(warn[0]!.message).toContain('Sesja A z soboty przepada')
    expect(warn[0]!.actions).toBeUndefined()
    expect(only('R3', '2026-11-09', w, rules({ today: '2026-11-09', logs }))[0]!.actions).toBeUndefined()
  })

  it('tydzień rozładowania mówi o wolnym piątku, nie o środzie z interwałami', () => {
    const w = week('2026-10-28', 2, 3)
    const msg = only('R12', '2026-10-28', w, rules({ today: '2026-10-28' }))[0]!.message
    expect(msg).toBe(program.rules.deload_note)
    expect(msg).toContain('piątek wolny')
  })

  it('wersja pod dachem używa trenażera z programu, nie Wattbike z siłowni', () => {
    const w = week('2026-11-04', 1, 1)
    const ov: PlanOverride = { id: 'x', date: '2026-11-04', kind: 'indoor', payload: {} }
    const d = applyOverrides(w, [ov], program).find((x) => x.date === '2026-11-04')!
    expect(d.bike?.bike).toBe('Trenażer (ERG)')
  })
})

describe('teksty zasad należą do programu', () => {
  const alps = parseProgram(alpsJson)
  it('żaden tekst programu FTP 300 nie wspomina układu tygodnia alpejskiego', () => {
    const all = JSON.stringify(program.rules)
    for (const leak of ['Sesja B', 'sobotnia długa', 'Sobotnia długa', 'Wattbike', 'przełęcz', '26.04.2027']) expect(all).not.toContain(leak)
    expect(program.rules.pass_strategy).toBeUndefined()
  })
  it('oba programy mają pełen zestaw R1–R16', () => {
    for (const p of [program, alps]) expect(p.rules.text.map((r) => r.id)).toEqual(Array.from({ length: 16 }, (_, i) => `R${i + 1}`))
  })
})
