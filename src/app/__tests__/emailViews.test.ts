import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '@/engine/schema'
import { buildCalendar } from '@/engine/calendar'
import { enrichDay } from '@/engine/plan'
import { morningEmail, workoutEmail } from '../../../supabase/functions/_shared/email_templates'
import { morningView, snapshotFor, workoutView, zonesFor } from '../emailViews'
import { hrZoneSeconds, rideLoadLite } from '../../../supabase/functions/_shared/email_views'
import { zoneDistribution } from '@/engine/zones'
import { rideLoad } from '@/engine/analysis'

const program = parseProgram(programJson)
const settings = { ...program.default_settings, lthr_bpm: 150, ftp_w_estimate: 200, power_meter: true }
const ctx = { program, settings }
const days = buildCalendar(ctx)
const plan = (d: string) => enrichDay(days.find((x) => x.date === d)!, ctx)

describe('maile', () => {
  it('poranna odprawa: temat, kroki z powtórzeniami zwiniętymi, pełna oś czasu', () => {
    const day = plan('2027-03-03') // THR 4×6 + Sesja A
    const v = morningView(day, program, { athlete: 'Luke', appUrl: 'https://x.test' })
    expect(v.workout!.steps.filter((s) => s.repeat === '×4')).toHaveLength(2) // interwał i przerwa – po jednym wierszu
    expect(v.workout!.timeline!.length).toBeGreaterThan(v.workout!.steps.length)
    expect(v.gym?.items.length).toBeGreaterThan(0)
    const m = morningEmail(v)
    expect(m.subject).toMatch(/^Dziś: Próg pod górę 4×6 min · 1 h \d+ min \+ siłownia$/)
    expect(m.html).toContain('https://x.test/i/dzien/2027-03-03')
    expect(m.text).toContain('Siłownia:')
  })
  it('po treningu: werdykt względem planu, strefy bez fałszywej Z5c, tekst escapowany', () => {
    const hist: number[] = []
    hist[125] = 1500
    hist[134] = 300 // dziura między Z2 a Z3 przy LTHR 150
    const ride = { date: '2026-09-22', name: 'Z2 <wieczór>', moving_time_s: 3000, distance_m: 18000, elevation_m: 40, avg_hr: 126, max_hr: 136, avg_cadence: 82, avg_watts: 130, np_w: 138, device_watts: true, decoupling_pct: 3.1, hr_histogram: hist }
    const v = workoutView(ride, plan('2026-09-22'), program, { athlete: 'Luke', appUrl: 'https://x.test', ftp: 200, lthr: 150 })
    expect(v.verdict.tone).toBe('good')
    expect(v.zones.some((z) => z.zone === 'Z5c')).toBe(false)
    expect(v.insights.join(' ')).toMatch(/IF 0,69 – spokojnie/)
    const e = workoutEmail(v)
    expect(e.html).toContain('Z2 &lt;wieczór&gt;')
    expect(e.html).not.toContain('<wieczór>')
  })
})

describe('migawka dnia i zgodność z silnikiem', () => {
  it('serwer liczy strefy i TSS tak samo jak silnik', () => {
    const hist: number[] = []
    for (let b = 100; b <= 175; b++) hist[b] = (b * 7) % 40
    for (const lthr of [150, 160, 170]) {
      const zones = zonesFor(program, lthr)
      expect(hrZoneSeconds(hist, zones).map((z) => z.seconds)).toEqual(zoneDistribution(hist, program.hr_zones_lthr_fraction, lthr).map((z) => z.seconds))
      const ride = { date: '2026-09-22', name: 'x', moving_time_s: 3600, distance_m: 30000, elevation_m: 0, avg_hr: 140, avg_cadence: 85, avg_watts: 180, np_w: 190, device_watts: false, decoupling_pct: null, hr_histogram: hist }
      const engine = rideLoad({ moving_s: 3600, device_watts: false, hr_histogram: hist, zones: program.hr_zones_lthr_fraction, lthr })
      expect(rideLoadLite(ride, null, zones)).toEqual(engine)
      expect(rideLoadLite({ ...ride, device_watts: true }, 250, zones)).toEqual(rideLoad({ moving_s: 3600, device_watts: true, np_w: 190, avg_watts: 180, ftp: 250 }))
    }
  })
  it('migawka: plan dnia, tydzień, następny trening, poranek tylko w dni z treningiem', () => {
    const window = days.filter((d) => d.date >= '2027-03-01' && d.date <= '2027-03-14').map((d) => enrichDay(d, ctx))
    const wed = snapshotFor(window.find((d) => d.date === '2027-03-03')!, window, program, { athlete: 'Luke', appUrl: 'https://x.test' })
    expect(wed.planned?.name).toBe('Próg pod górę 4×6 min')
    expect(wed.week_planned_min).toBeGreaterThan(0)
    expect(wed.next?.name).toBeTruthy()
    expect(wed.zones).toHaveLength(program.hr_zones_lthr_fraction.length)
    expect(wed.morning?.workout?.name).toBe('Próg pod górę 4×6 min')
    const rest = window.find((d) => !d.bike && !d.gym)!
    expect(snapshotFor(rest, window, program, { athlete: 'Luke', appUrl: 'https://x.test' }).morning).toBeNull()
  })
})
