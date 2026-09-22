import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '@/engine/schema'
import { buildSequence } from './sequence'

const program = parseProgram(programJson)

describe('kolejność serii w sesji', () => {
  it('Sesja A: superseria 3A/3B i obwód core przeplatają się', () => {
    const a = program.gym_prescriptions['11']!.wed!
    const seq = buildSequence(a)
    const names = seq.map((s) => `${a.items[s.itemIndex]!.exercise}#${s.setNo}`)
    expect(names.slice(0, 4)).toEqual(['mobility_circuit#1', 'mobility_circuit#2', 'back_squat#1', 'back_squat#2'])
    const i = names.indexOf('db_row#1')
    expect(names[i + 1]).toBe('calf_raise#1')
    expect(names[i + 2]).toBe('db_row#2')
    const c = names.indexOf('pallof_press#1')
    expect(names.slice(c, c + 3)).toEqual(['pallof_press#1', 'dead_bug#1', 'side_plank#1'])
    expect(names.at(-1)).toBe('cooldown_stretch#1')
    const total = a.items.reduce((n, it) => n + (typeof it.rx.sets === 'number' ? it.rx.sets : 1), 0)
    expect(seq).toHaveLength(total)
  })
})
