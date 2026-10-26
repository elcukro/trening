import { describe, expect, it } from 'vitest'
import { rideFacts, type History, type RideRowLite, type StoredSamples } from '../../../supabase/functions/_shared/ride_facts'
import { checkDraft, isDefaultTitle, parseDraft, ruleDraft, SIGNATURE, titlePrompt, withSignature } from '../../../supabase/functions/_shared/strava_title'
import type { DaySnapshot } from '../../../supabase/functions/_shared/email_views'

const DT = 5
const seg = (min: number, w: number, hr: number) => Array.from({ length: (min * 60) / DT }, () => ({ w, hr }))
const build = (parts: { w: number; hr: number }[]): StoredSamples => ({ dt: DT, watts: parts.map((p) => p.w), hr: parts.map((p) => p.hr), cadence: parts.map(() => 85), moving: parts.map(() => 1 as const) })
const row = (s: StoredSamples, over: Partial<RideRowLite> = {}): RideRowLite => {
  const n = s.watts!.length
  const avg = s.watts!.reduce<number>((a, b) => a + (b ?? 0), 0) / n
  return { id: 1, date: '2026-09-30', name: 'Morning Ride', moving_time_s: n * DT, elapsed_time_s: n * DT + 120, distance_m: 30000, elevation_m: 40, avg_hr: 140, max_hr: 165, avg_cadence: 85, avg_watts: Math.round(avg), np_w: null, device_watts: true, decoupling_pct: 3.2, mmp_w: null, ...over }
}
const snap = (): DaySnapshot => ({
  date: '2026-09-30',
  dateLabel: 'środa, 30 września 2026',
  planned: { name: 'Baza tlenowa Z2', minutes: 90, day_type: 'easy' },
  context: { workout_id: 'Z2', category: 'endurance', description: 'Spokojnie.', work: [{ name: 'Z2', zone: 'Z2', minutes: 80, reps: 1, watts: [130, 175], bpm: [130, 143] }], phase: 'Faza I', phase_goal: 'Baza', week_type: 'build', flags: [], goal: '30 km/h', coach_notes: [] },
  ftp: 235,
  lthr: 160,
  zones: [{ id: 'Z2', name: 'Wytrzymałość', low_bpm: 130, high_bpm: 143 }],
  cadence_floor: 75,
  week_planned_min: 300,
  next: null,
  morning: null,
})
const HIST: History = { mmp90: { '60': 300, '300': 260, '1200': 247 }, previous_same: null, week: { done_min: 120, planned_min: 300, rides: 2 }, checkin: null, rpe: null }

const samples = build([...seg(30, 150, 135), ...seg(30, 152, 137), ...seg(30, 155, 139)])
const facts = rideFacts(row(samples), samples, snap(), HIST)

describe('isDefaultTitle', () => {
  it('rozpoznaje domyślne nazwy Stravy i nazwy z Bolta', () => {
    expect(isDefaultTitle('Morning Ride', null)).toBe(true)
    expect(isDefaultTitle('Evening Gravel Ride', null)).toBe(true)
    expect(isDefaultTitle('Poranna jazda', null)).toBe(true)
    expect(isDefaultTitle('Indoor Cycling', null)).toBe(true)
    expect(isDefaultTitle('Baza tlenowa Z2', 'Baza tlenowa Z2')).toBe(true)
    expect(isDefaultTitle('Baza tlenowa Z2 (pod dachem)', null, ['Baza tlenowa Z2'])).toBe(true)
    expect(isDefaultTitle('Endurance Z2 (indoors)', null, ['Endurance Z2'])).toBe(true)
    expect(isDefaultTitle('Sweet spot 2×15 min', null, ['Sweet spot 2×15 min'])).toBe(true)
  })
  it('zostawia własne tytuły zawodnika', () => {
    expect(isDefaultTitle('Zwiększamy progi 💪', 'Baza tlenowa Z2')).toBe(false)
    expect(isDefaultTitle('Szosa obczajka DELL', null, ['Długa jazda'])).toBe(false)
    expect(isDefaultTitle('Night ride powroty', null)).toBe(false)
  })
})

describe('parseDraft i checkDraft', () => {
  it('czyta dwie linie i przyjmuje liczby z faktów', () => {
    const d = parseDraft('Tytuł: „Z2 spokojnie · 30 km”\nOpis: Plan: 90 min w Z2. Wyszło 90 min przy 140 bpm.')
    expect(d).toEqual({ title: 'Z2 spokojnie · 30 km', description: 'Plan: 90 min w Z2. Wyszło 90 min przy 140 bpm.' })
    expect(checkDraft(d!, facts).ok).toBe(true)
  })
  it('odrzuca liczby spoza faktów, podpis od modelu i za długi tytuł', () => {
    const bad = checkDraft({ title: 'Z2 · 999 W', description: 'Ładna jazda.' }, facts)
    expect(bad.ok).toBe(false)
    expect(bad.problems.join()).toMatch(/999/)
    expect(checkDraft({ title: 'Z2 · Notatki: Bicycle Coach', description: 'Ok.' }, facts).ok).toBe(false)
    expect(checkDraft({ title: 'x'.repeat(61), description: 'Ok.' }, facts).ok).toBe(false)
    expect(checkDraft({ title: 'Z2 spokojnie', description: 'Raz. Dwa. Trzy. Cztery.' }, facts).ok).toBe(false)
  })
  it('zwraca null przy złym formacie', () => {
    expect(parseDraft('Fajna jazda, 30 km.')).toBeNull()
  })
})

describe('ruleDraft i podpis', () => {
  it('tytuł z reguł przechodzi własną weryfikację i ma podpis z kodu', () => {
    const d = ruleDraft(facts)
    expect(d.title).toMatch(/^Baza tlenowa Z2 · 30 km · 152 W$/)
    expect(checkDraft(d, facts).ok).toBe(true)
    const full = withSignature(d.description)
    expect(full.endsWith(`\n\n${SIGNATURE}`)).toBe(true)
    expect(full.split(SIGNATURE).length).toBe(2)
  })
  it('prompt zawiera fakty i notatkę', () => {
    const p = titlePrompt(facts, 'Równa jazda.')
    expect(p).toContain('Tytuł:')
    expect(p).toContain('Równa jazda.')
    expect(p).toContain('"km":30')
  })
})
