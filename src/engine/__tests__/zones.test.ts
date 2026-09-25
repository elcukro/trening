import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '../schema'
import { computeZones, zoneDistribution } from '../zones'

const program = parseProgram(programJson)
const zones = program.hr_zones_lthr_fraction

describe('czas w strefach z histogramu tętna', () => {
  it('tętno z dziury między strefami trafia do niższej strefy, nie do ostatniej', () => {
    const bpm = computeZones(zones, 150)
    // LTHR 150: Z2 122–134 (górna granica otwarta), Z3 od 135 – 134 bpm nie pasuje do żadnej strefy
    const z2 = bpm.find((z) => z.id === 'Z2')!
    const z3 = bpm.find((z) => z.id === 'Z3')!
    expect(z3.low_bpm).toBeGreaterThan(z2.high_bpm)
    const hist: number[] = []
    hist[z2.high_bpm] = 60
    hist[125] = 540
    const d = zoneDistribution(hist, zones, 150)
    expect(d.find((z) => z.id === 'Z5c')!.seconds).toBe(0)
    expect(d.find((z) => z.id === 'Z2')!.seconds).toBe(600)
  })
  it('poniżej pierwszej strefy – pierwsza strefa; powyżej ostatniej – ostatnia', () => {
    const hist: number[] = []
    hist[60] = 30
    hist[220] = 30
    const d = zoneDistribution(hist, zones, 150)
    expect(d[0]!.seconds).toBe(30)
    expect(d.at(-1)!.seconds).toBe(30)
  })
})
