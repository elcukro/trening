import { describe, expect, it } from 'vitest'
import templatesJson from '../../../data/gear_templates.json'
import programJson from '../../../data/program.json'
import ftpJson from '../../../data/program-ftp300.json'
import { parseProgram } from '../schema'
import { gearTasks, templateTaskId, type BikeLike, type GearTemplate } from '../gear'

const templates = templatesJson as GearTemplate[]
const GRAVEL: BikeLike = { id: 'g1', name: 'Gravel', kind: 'gravel', brakes: 'disc' }
const ROAD_RIM: BikeLike = { id: 'r1', name: 'Szosa', kind: 'road', brakes: 'rim' }

describe('zadania sprzętowe', () => {
  it('bez rowerów i bez zadań programu lista jest pusta – nikt nie dostaje cudzego sprzętu', () => {
    const ftp = parseProgram(ftpJson)
    expect(ftp.gear_tasks).toBeUndefined()
    expect(gearTasks({ programTasks: ftp.gear_tasks ?? [], templates, bikes: [], states: [], today: '2026-10-01' })).toEqual([])
  })

  it('szablon dobiera zadania do typu roweru i hamulców', () => {
    const list = gearTasks({ programTasks: [], templates, bikes: [GRAVEL, ROAD_RIM], states: [], today: '2026-10-01' })
    const forBike = (name: string) => list.filter((t) => t.bike_label === name).map((t) => t.id.split(':')[0])
    expect(forBike('Gravel')).toContain('pads_disc')
    expect(forBike('Gravel')).toContain('sealant')
    expect(forBike('Gravel')).not.toContain('pads_rim')
    expect(forBike('Szosa')).toContain('pads_rim')
    expect(forBike('Szosa')).not.toContain('sealant')
    expect(list.every((t) => t.status === 'todo' && t.due === '2026-10-01')).toBe(true)
  })

  it('zadanie cykliczne wraca po upływie okresu, „nie dotyczy” zostaje', () => {
    const id = templateTaskId('chain_wear', GRAVEL.id)
    const sealant = templateTaskId('sealant', GRAVEL.id)
    const states = [
      { task_id: id, status: 'done' as const, done_at: '2026-09-24' },
      { task_id: sealant, status: 'skipped' as const, done_at: null },
    ]
    const at = (today: string) => gearTasks({ programTasks: [], templates, bikes: [GRAVEL], states, today })
    expect(at('2026-10-10').find((t) => t.id === id)).toMatchObject({ status: 'done', due: '2026-10-24' })
    expect(at('2026-10-24').find((t) => t.id === id)).toMatchObject({ status: 'todo', done_at: '2026-09-24' })
    expect(at('2027-05-01').find((t) => t.id === sealant)!.status).toBe('skipped')
  })

  it('zadania z planu sezonu programu alpejskiego zachowują identyfikatory (stan odhaczeń z bazy pasuje)', () => {
    const alps = parseProgram(programJson)
    const ids = (alps.gear_tasks ?? []).map((t) => t.id)
    expect(ids).toContain('drivetrain_install')
    expect(ids).not.toContain('chain_wear_monthly')
    const list = gearTasks({ programTasks: alps.gear_tasks ?? [], templates, bikes: [], states: [{ task_id: 'drivetrain_install', status: 'done', done_at: '2026-09-21' }], today: '2026-10-01' })
    expect(list.find((t) => t.id === 'drivetrain_install')).toMatchObject({ status: 'done', bike_label: 'Checkpoint' })
  })
})
