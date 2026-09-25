import { describe, expect, it } from 'vitest'
import programJson from '../../../data/program.json'
import { parseProgram } from '@/engine/schema'
import { buildCalendar } from '@/engine/calendar'
import { enrichDay } from '@/engine/plan'
import { morningEmail, workoutEmail } from '../../../supabase/functions/_shared/email_templates'
import { morningView, workoutView } from '../emailViews'

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
    expect(v.zones.find((z) => z.zone === 'Z5c')!.pct).toBe(0)
    expect(v.insights.join(' ')).toMatch(/IF 0,69 – spokojnie/)
    const e = workoutEmail(v)
    expect(e.html).toContain('Z2 &lt;wieczór&gt;')
    expect(e.html).not.toContain('<wieczór>')
  })
})
