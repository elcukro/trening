import { describe, expect, it } from 'vitest'
import alpsJson from '../../../data/program.json'
import ftpJson from '../../../data/program-ftp300.json'
import ftpCalendar from '../../../data/calendar-ftp300.json'
import { parseProgram } from '../schema'
import { nutritionFor } from '../nutrition'
import { bikeSuggestion } from '../calendar'
import { programGoal } from '../baseline'
import type { CalendarDay } from '../types'

/**
 * Decoupling v1, krok 1 (docs/18): żywienie, rower, cel i kadencja siedzą w pliku programu.
 * Program alpejski ma dawać te same liczby co przed przeniesieniem (golden pilnuje całego kalendarza),
 * a program FTP 300 nie może dziedziczyć niczego z alpejskiego.
 */
const alps = parseProgram(alpsJson)
const ftp = parseProgram(ftpJson)

describe('sekcje osobiste programu', () => {
  it('program alpejski: dotychczasowe wartości, teraz jako dane', () => {
    expect(nutritionFor(alps.nutrition, 'I', 'easy', 45, false)).toMatchObject({ energy: 'deficit_500', protein_g_per_kg: 1.8 })
    expect(nutritionFor(alps.nutrition, 'IV', 'easy', 60, false).energy).toBe('deficit_300_if_above_target')
    expect(nutritionFor(alps.nutrition, 'I', 'trip', 300, false).energy).toBe('maintenance_plus')
    expect(bikeSuggestion(alps.bikes, 'II', 'Z2')).toBe('Checkpoint (zima, błotniki)')
    expect(bikeSuggestion(alps.bikes, 'I', 'MOUNTAIN_DAY')).toContain('40/50')
    expect(alps.goal).toMatchObject({ kind: 'speed', kmh: 30 })
    expect(alps.cadence).toMatchObject({ floor_rpm: 75, goal_rpm: 78 })
  })

  it('program FTP 300: własne żywienie, rower, cel i kadencja', () => {
    expect(ftp.meta.short).toBe('FTP 300')
    expect(bikeSuggestion(ftp.bikes, 'II', 'THR_4x8')).toBe('Rower')
    expect(bikeSuggestion(ftp.bikes, 'II', 'INDOOR_4x4')).toBe('Trenażer (ERG)')
    expect(ftp.goal.kind).toBe('ftp')
    expect(programGoal(ftp.goal, 82, 300).ftp).toBe(300)
    expect(ftp.cadence.goal_rpm).toBeGreaterThanOrEqual(85)
    // blok VO2max bez deficytu, dzień treningowy na bilansie zerowym
    expect(nutritionFor(ftp.nutrition, 'III', 'easy', 45, false).energy).toBe('maintenance')
    expect(nutritionFor(ftp.nutrition, 'I', 'easy', 75, false)).toMatchObject({ energy: 'deficit_300', deficit_share: 0.5 }) // spokojna jazda: pół udziału
    expect(nutritionFor(ftp.nutrition, 'I', 'key', 75, true).energy).toBe('maintenance') // akcent bez deficytu
  })

  it('kalendarz FTP 300 nie zawiera żywienia ani rowerów z programu alpejskiego', () => {
    const days = ftpCalendar.days as unknown as CalendarDay[]
    const text = JSON.stringify(days)
    for (const leak of ['500 kcal', 'Checkpoint', 'Dogma', 'Wattbike', 'Wyjazd:']) expect(text, leak).not.toContain(leak)
    expect(days.every((d) => d.nutrition.energy !== 'deficit_500')).toBe(true)
  })

  it('cel prędkościowy liczy fizyka z prędkości programu, nie ze stałej', () => {
    const g = programGoal(alps.goal, 118, 250)
    expect(g.kmh).toBe(30)
    expect(g.watts).toBeGreaterThan(150)
    expect(g.ftp).toBeGreaterThan(g.watts!)
  })
})
