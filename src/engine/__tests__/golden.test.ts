import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import calendarJson from '../../../data/calendar.json'
import { parseProgram } from '../schema'
import { buildCalendar, seasonSummary } from '../calendar'
import { layoutWeeks } from '../layout'
import type { CalendarDay, EngineContext } from '../types'

const program = parseProgram(programJson)
const ctx: EngineContext = { program, settings: program.default_settings }
const golden = calendarJson.days as unknown as CalendarDay[]

describe('golden file: calendar.json', () => {
  const days = buildCalendar(ctx)

  it('ma tyle samo dni co calendar.json', () => {
    expect(days).toHaveLength(golden.length)
    expect(days[0]!.date).toBe('2026-09-11')
    expect(days.at(-1)!.date).toBe('2027-09-12')
  })

  it('każdy dzień jest identyczny z plikiem referencyjnym', () => {
    for (let i = 0; i < golden.length; i++) {
      expect(days[i], `dzień ${golden[i]!.date}`).toEqual(golden[i])
    }
  })

  it('układ tygodni dla domyślnych ustawień = szablony 0…52', () => {
    const weeks = layoutWeeks(program, program.default_settings)
    expect(weeks).toHaveLength(53)
    weeks.forEach((w, i) => {
      expect(w.template).toBe(i)
      expect(w.week).toBe(i)
      expect(w.cloned).toBe(false)
    })
    expect(weeks[0]!.monday).toBe('2026-09-07')
    expect(weeks[52]!.monday).toBe('2027-09-06')
  })

  it('tabela sezonu = program.week_summary', () => {
    const summary = seasonSummary(ctx, days)
    expect(summary).toEqual(program.week_summary)
  })

  it('wersja programu zgadza się z kalendarzem', () => {
    expect(program.version).toBe(calendarJson.version)
  })
})
