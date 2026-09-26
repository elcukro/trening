import { describe, expect, it } from 'vitest'
import { numbersOk, rideFacts, type History, type RideRowLite, type StoredSamples } from '../../../supabase/functions/_shared/ride_facts'
import { compactFacts, ruleNote, userMessage } from '../../../supabase/functions/_shared/ride_note_prompt'
import type { DaySnapshot } from '../../../supabase/functions/_shared/email_views'

const DT = 5
const seg = (min: number, w: number, hr: number) => Array.from({ length: (min * 60) / DT }, () => ({ w, hr }))

function build(parts: { w: number; hr: number }[]): StoredSamples {
  return { dt: DT, watts: parts.map((p) => p.w), hr: parts.map((p) => p.hr), cadence: parts.map(() => 85), moving: parts.map(() => 1 as const) }
}

function row(s: StoredSamples, over: Partial<RideRowLite> = {}): RideRowLite {
  const n = s.watts!.length
  const avg = s.watts!.reduce<number>((a, b) => a + (b ?? 0), 0) / n
  return { id: 1, date: '2026-09-30', name: 'Sweet spot 2×12', moving_time_s: n * DT, elapsed_time_s: n * DT + 120, distance_m: 30000, elevation_m: 40, avg_hr: 140, max_hr: 165, avg_cadence: 85, avg_watts: Math.round(avg), np_w: null, device_watts: true, decoupling_pct: 3.2, mmp_w: null, ...over }
}

const ZONES = [
  { id: 'Z1', name: 'Regeneracja', low_bpm: 0, high_bpm: 130 },
  { id: 'Z2', name: 'Wytrzymałość', low_bpm: 130, high_bpm: 143 },
  { id: 'Z3', name: 'Tempo', low_bpm: 144, high_bpm: 150 },
  { id: 'SS', name: 'Sweet spot', low_bpm: 147, high_bpm: 154 },
]

function snap(workout_id: string, work: DaySnapshot['context'] extends infer C ? (C extends { work: infer W } ? W : never) : never, day_type = 'key'): DaySnapshot {
  return {
    date: '2026-09-30',
    dateLabel: 'środa, 30 września 2026',
    planned: { name: 'Sweet spot 2×12 min', minutes: 59, day_type },
    context: { workout_id, category: 'sweet_spot', description: 'Sweet spot: mocno, ale kontrolowanie.', work, phase: 'Faza I', phase_goal: 'Baza', week_type: 'build', flags: [], goal: '30 km/h przez 2–3 godziny', coach_notes: ['Naturalna kadencja ok. 80 rpm.'] },
    ftp: 235,
    lthr: 160,
    zones: ZONES,
    cadence_floor: 75,
    week_planned_min: 300,
    next: null,
    morning: null,
  }
}

const HIST: History = { mmp90: { '60': 300, '300': 260, '1200': 247 }, previous_same: { date: '2026-09-16', np_w: 180, avg_hr: 145, work_avg_w: 200, work_avg_hr: 152 }, week: { done_min: 120, planned_min: 300, rides: 2 }, checkin: null, rpe: null }

describe('fakty o jeździe', () => {
  it('2×12 sweet spot: dwa interwały w zakresie, bez spadku mocy, porównanie z poprzednim razem', () => {
    const s = build([...seg(15, 150, 128), ...seg(12, 212, 150), ...seg(5, 120, 125), ...seg(12, 214, 153), ...seg(10, 110, 120)])
    const f = rideFacts(row(s), s, snap('SS_2x12', [{ name: 'Interwał 12 min', zone: 'SS', minutes: 12, reps: 2, watts: [207, 221], bpm: [147, 154] }]), HIST)
    expect(f.efforts?.planned_reps).toBe(2)
    expect(f.efforts?.detected).toHaveLength(2)
    expect(f.efforts?.detected.every((e) => e.in_target)).toBe(true)
    expect(f.efforts?.detected[0]!.avg_w).toBeGreaterThanOrEqual(205)
    expect(f.efforts?.fade_pct).toBeGreaterThanOrEqual(0)
    expect(f.previous_same?.work_avg_w).toBe(200)
    expect(f.test).toBeNull()
    expect(f.ride.stopped_min).toBe(2)
  })

  it('interwały poniżej celu i słabnące – fakty to pokazują, notatka z reguł to nazywa', () => {
    const s = build([...seg(15, 150, 128), ...seg(12, 205, 150), ...seg(5, 120, 125), ...seg(12, 190, 155), ...seg(10, 110, 120)])
    const f = rideFacts(row(s), s, snap('SS_2x12', [{ name: 'Interwał 12 min', zone: 'SS', minutes: 12, reps: 2, watts: [207, 221], bpm: [147, 154] }]), HIST)
    expect(f.efforts?.detected.map((e) => e.in_target)).toEqual([true, false])
    expect(f.efforts?.fade_pct).toBeLessThan(-5)
    expect(ruleNote(f)).toMatch(/słabszy od pierwszego/)
  })

  it('test FTP: najlepsze 20 min, szacunek FTP i bloki 5-minutowe', () => {
    const s = build([...seg(20, 150, 125), ...seg(5, 200, 145), ...seg(10, 110, 120), ...seg(5, 249, 156), ...seg(5, 245, 166), ...seg(5, 241, 167), ...seg(5, 253, 170), ...seg(10, 100, 120)])
    const f = rideFacts(row(s, { name: 'Test FTP 20 min' }), s, snap('FTP_TEST', [{ name: 'TEST 20 min', zone: 'Z5a', minutes: 20, reps: 1, watts: [200, 212], bpm: null }]), HIST)
    expect(f.test?.best20_w).toBe(247)
    expect(f.test?.ftp_est).toBe(235)
    expect(f.test?.blocks_w).toEqual([249, 245, 241, 253])
    expect(f.efforts).toBeNull()
  })

  it('spokojna jazda bez planu: czas powyżej Z2, połowy, rekordy względem 90 dni', () => {
    const s = build([...seg(30, 150, 128), ...seg(30, 165, 138)])
    const f = rideFacts(row(s, { name: 'Z2' }), s, { ...snap('Z2', [], 'easy'), planned: { name: 'Baza tlenowa Z2', minutes: 60, day_type: 'easy' } }, { ...HIST, mmp90: { '60': 150 } })
    expect(f.above_z2_pct).toBe(0)
    expect(f.halves?.first.avg_w).toBe(150)
    expect(f.halves?.second.avg_hr).toBe(138)
    expect(f.records.find((r) => r.seconds === 60)?.previous_best).toBe(150)
    expect(f.hr_zones_pct.Z2).toBeGreaterThan(40)
  })
})

describe('weryfikacja notatki i prompt', () => {
  const s = build([...seg(15, 150, 128), ...seg(12, 212, 150), ...seg(5, 120, 125), ...seg(12, 214, 153), ...seg(10, 110, 120)])
  const f = rideFacts(row(s), s, snap('SS_2x12', [{ name: 'Interwał 12 min', zone: 'SS', minutes: 12, reps: 2, watts: [207, 221], bpm: [147, 154] }]), HIST)

  it('liczby z faktów, różnice i małe liczby przechodzą; zmyślone – nie', () => {
    const w0 = f.efforts!.detected[0]!.avg_w
    expect(f.derived.work_w_vs_previous).toBe(f.derived.work_avg_w! - 200)
    expect(numbersOk(`Oba interwały w zakresie 207–221 W, pierwszy ${w0} W, średnio o ${f.derived.work_w_vs_previous} W więcej niż 16 września.`, f).ok).toBe(true)
    const bad = numbersOk('Średnio 287 W przy tętnie 171 – rekord.', f)
    expect(bad.ok).toBe(false)
    expect(bad.unknown).toEqual([287, 171])
  })

  it('prompt nie zawiera pustych pól ani surowych próbek', () => {
    const c = compactFacts(f)
    expect(JSON.stringify(c)).not.toContain('null')
    expect(userMessage(f).length).toBeLessThan(4000)
  })
})
