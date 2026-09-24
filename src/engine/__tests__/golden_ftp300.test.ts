import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program-ftp300.json'
import calendarJson from '../../../data/calendar-ftp300.json'
import { parseProgram } from '../schema'
import { buildCalendar } from '../calendar'
import { layoutWeeks } from '../layout'
import { plannedTss } from '../pmc'
import type { CalendarDay, EngineContext } from '../types'

const program = parseProgram(programJson)
const ctx: EngineContext = { program, settings: program.default_settings }
const golden = calendarJson.days as unknown as CalendarDay[]

describe('golden file: calendar-ftp300.json', () => {
  const days = buildCalendar(ctx)

  it('silnik daje dokładnie to samo co plik referencyjny', () => {
    expect(days).toHaveLength(golden.length)
    expect(days[0]!.date).toBe('2026-09-21')
    expect(days.at(-1)!.date).toBe('2027-06-27')
    for (let i = 0; i < golden.length; i++) {
      expect(days[i], `dzień ${golden[i]!.date}`).toEqual(golden[i])
    }
  })

  it('układ stały: 40 tygodni po kolei, pierwszy tydzień od startu programu', () => {
    const weeks = layoutWeeks(program, program.default_settings)
    expect(weeks).toHaveLength(40)
    expect(weeks[0]!.monday).toBe('2026-09-21')
    expect(weeks.map((w) => w.template)).toEqual(Array.from({ length: 40 }, (_, i) => i))
    expect(weeks.every((w) => !w.cloned)).toBe(true)
  })

  it('tydzień: długa w poniedziałek, wolne we wtorek i niedzielę, akcenty w środę i piątek', () => {
    const w = days.filter((d) => d.week === 3)
    expect(w.map((d) => d.weekday)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
    expect(w[0]!.bike?.workout_id).toBe('LONG')
    expect(w[0]!.day_type).toBe('long')
    expect(w[1]!.bike).toBeNull()
    expect(w[2]!.day_type).toBe('key')
    expect(w[4]!.bike?.workout_id).toBe('Z2')
    expect(w[6]!.bike).toBeNull()
  })

  it('jedna siłownia w tygodniu, w sobotę', () => {
    for (let week = 0; week <= 36; week++) {
      const gymDays = days.filter((d) => d.week === week && d.gym)
      expect(gymDays.length, `tydzień ${week}`).toBeLessThanOrEqual(1)
      if (gymDays[0]) expect(gymDays[0].weekday, `tydzień ${week}`).toBe('sat')
    }
    // od tygodnia 37 siłownia wypada (szczyt i taper)
    expect(days.filter((d) => d.week >= 37 && d.gym)).toHaveLength(0)
  })

  it('testy FTP zamykają każdą fazę: tygodnie 0, 11, 21, 27 i 39', () => {
    const tests = days.filter((d) => d.bike?.workout_id === 'FTP_TEST')
    expect(tests.map((d) => d.week)).toEqual([0, 11, 21, 27, 39])
    // pomiar wejściowy wypada w niedzielę 27.09, plan właściwy startuje w poniedziałek
    expect(tests[0]!.date).toBe('2026-09-27')
    expect(tests[0]!.weekday).toBe('sun')
    expect(days.find((d) => d.date === '2026-09-28')!.week).toBe(1)
    expect(days.find((d) => d.date === '2026-09-28')!.bike?.workout_id).toBe('LONG')
  })

  it('kadencja standardowa (85–95), bez ustawień z programu alpejskiego', () => {
    const z2 = program.bike_workouts.Z2!
    const first = z2.steps[0]!
    expect('repeat' in first ? null : first.cadence_rpm).toEqual([85, 95])
    expect(z2.description).not.toMatch(/nie wymuszaj/)
    // dla porównania: program alpejski ma 80–95 i własną adnotację (docs/13 § 24.09.2026)
  })

  it('obciążenie rośnie fazami i spada w tygodniach lżejszych', () => {
    const tss = (week: number) => days.filter((d) => d.week === week).reduce((s, d) => s + plannedTss(d, program), 0)
    expect(tss(10)).toBeGreaterThan(tss(1)) // koniec bazy > start bazy
    expect(tss(34)).toBeGreaterThan(tss(10)) // szczyt objętości > baza
    expect(tss(5)).toBeLessThan(tss(4)) // rozładowanie lżejsze od tygodnia przed
    expect(tss(39)).toBeLessThan(tss(34)) // taper najlżejszy
  })
})
