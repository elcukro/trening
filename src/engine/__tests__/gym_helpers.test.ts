import { describe, expect, it } from 'vitest'
import { detectPlateau, platesFor, sessionBestE1rm } from '../load'

describe('platesFor', () => {
  it('rozkłada ciężar na talerze na stronę', () => {
    expect(platesFor(100)).toEqual({ per_side: [25, 15], achieved_kg: 100, remainder_kg: 0 })
    expect(platesFor(67.5)).toEqual({ per_side: [20, 2.5, 1.25], achieved_kg: 67.5, remainder_kg: 0 })
    expect(platesFor(101)!.remainder_kg).toBe(1)
    expect(platesFor(140, 25)!.per_side).toEqual([25, 25, 5, 2.5])
    expect(platesFor(15)).toBeNull()
    expect(platesFor(20)!.per_side).toEqual([])
  })
})

describe('detectPlateau', () => {
  const s = (w: number, r: number) => [{ weight_kg: w, reps: r }]
  it('null przy postępie albo za krótkiej historii', () => {
    expect(detectPlateau([{ date: '2026-10-01', sets: s(80, 8) }, { date: '2026-10-08', sets: s(82.5, 8) }], 2)).toBeNull()
    const growing = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d, i) => ({ date: d, sets: s(80 + i * 2.5, 8) }))
    expect(detectPlateau(growing, 2)).toBeNull()
  })
  it('trzy sesje bez przebicia rekordu → plateau z podpowiedzią wg RIR', () => {
    const hist = [
      { date: '2026-10-01', sets: s(90, 8) },
      { date: '2026-10-08', sets: s(90, 7) },
      { date: '2026-10-15', sets: s(90, 8) },
      { date: '2026-10-22', sets: s(87.5, 8) },
    ]
    const p = detectPlateau(hist, 3)!
    expect(p.best_e1rm).toBe(Math.round(sessionBestE1rm(s(90, 8))))
    expect(p.message).toContain('RIR')
    expect(detectPlateau(hist, 1)!.message).toContain('serię')
  })
})
