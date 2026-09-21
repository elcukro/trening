import { describe, expect, it } from 'vitest'
import { rangeReport, weeksIn, weightChange } from '../report'
import { buildCalendar } from '../calendar'
import { loadProgram } from '@/data/program'

const program = loadProgram()
const days = buildCalendar({ program, settings: program.default_settings })

describe('rangeReport', () => {
  it('tydzień 3 (28.09–4.10): wykonane, pominięte, brak wpisu, dodatkowa jazda, zgodność', () => {
    const r = rangeReport({
      from: '2026-09-28',
      to: '2026-10-04',
      today: '2026-10-03',
      days,
      program,
      logs: [
        { date: '2026-09-29', kind: 'bike', status: 'done', duration_min: 80 },
        { date: '2026-09-30', kind: 'gym', status: 'done' },
        { date: '2026-10-01', kind: 'bike', status: 'skipped' },
        { date: '2026-09-28', kind: 'bike', status: 'done', duration_min: 40 }, // poniedziałek wolny – jazda dodatkowa
      ],
      tss: new Map([
        ['2026-09-29', 55],
        ['2026-09-28', 20],
      ]),
      scores: new Map([['2026-09-29', 90]]),
    })
    expect(r.days.length).toBe(7)
    expect(r.bike_planned).toBe(3)
    expect(r.bike_done).toBe(1)
    expect(r.gym_planned).toBe(2)
    expect(r.gym_done).toBe(1)
    expect(r.done_min).toBe(120)
    expect(r.done_tss).toBe(75)
    expect(r.planned_tss).toBeGreaterThan(100)
    expect(r.score).toBe(90)
    expect(r.extra_rides).toBe(1)
    const thu = r.days.find((d) => d.date === '2026-10-01')!
    expect(thu.key).toBe(true)
    expect(thu.bike).toBe('skipped')
    expect(r.days.find((d) => d.date === '2026-10-02')!.gym).toBe('missed')
    expect(r.days.find((d) => d.date === '2026-10-03')!.bike).toBe('upcoming')
    expect(r.days.find((d) => d.date === '2026-10-04')!.bike).toBe('rest')
    expect(r.issues.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02'])
  })
})

describe('weeksIn / weightChange', () => {
  it('poniedziałki miesiąca i zmiana masy', () => {
    expect(weeksIn('2026-10-01', '2026-10-31')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    const w = weightChange(
      [
        { date: '2026-09-25', weight_kg: 110 },
        { date: '2026-09-27', weight_kg: 109.6 },
        { date: '2026-10-03', weight_kg: 109 },
        { date: '2026-10-04', weight_kg: 108.6 },
      ],
      '2026-09-28',
      '2026-10-04',
    )
    expect(w.start).toBe(109.8)
    expect(w.end).toBe(108.8)
    expect(w.delta).toBe(-1)
    expect(weightChange([], '2026-09-28', '2026-10-04').delta).toBeNull()
  })
})
