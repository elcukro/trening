import { describe, expect, it } from 'vitest'
import { fix, langFromRequest, langOf, strings, weekRange, weekdayOf, type Dict } from '../../../supabase/functions/_shared/i18n'
import { morningEmail, weeklyEmail, workoutEmail, type MorningView, type WeeklyView } from '../../../supabase/functions/_shared/email_templates'
import { buildWorkoutView, type RideLite } from '../../../supabase/functions/_shared/email_views'
import { numbersOk } from '../../../supabase/functions/_shared/ride_facts'
import { parseDraft, signatureFor, withSignature, SIGNATURE } from '../../../supabase/functions/_shared/strava_title'
import { COACH_SYSTEM, coachSystem } from '../../../supabase/functions/_shared/coach_chat'
import { userPrompt as checkinPrompt } from '../../../supabase/functions/_shared/checkin_parse'
import { userPrompt as mealPrompt } from '../../../supabase/functions/_shared/meal_parse'

const PL_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/
const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) })

describe('język zawodnika na serwerze', () => {
  it('langOf: locale → language (pl/en) → pl', () => {
    expect(langOf({ locale: 'en', language: 'pl' })).toBe('en')
    expect(langOf({ locale: null, language: 'en' })).toBe('en')
    expect(langOf({ locale: null, language: 'system' })).toBe('pl')
    expect(langOf({})).toBe('pl')
    expect(langOf(null)).toBe('pl')
  })
  it('langFromRequest: x-app-lang ma pierwszeństwo, bez profilu Accept-Language', () => {
    expect(langFromRequest(req({ 'x-app-lang': 'en' }), { locale: 'pl' })).toBe('en')
    expect(langFromRequest(req({ 'x-app-lang': 'de' }), { locale: 'en' })).toBe('en')
    expect(langFromRequest(req({ 'accept-language': 'en-GB,pl;q=0.8' }), { language: 'pl' })).toBe('pl')
    expect(langFromRequest(req({ 'accept-language': 'en-GB,pl;q=0.8' }))).toBe('en')
    expect(langFromRequest(req({}))).toBe('pl')
  })
  it('formatery: separator dziesiętny, tydzień, dzień tygodnia', () => {
    expect(fix(8.66, 1, 'pl')).toBe('8,7')
    expect(fix(8.66, 1, 'en')).toBe('8.7')
    expect(weekRange('2026-10-12', 'pl')).toBe('12–18.10')
    expect(weekRange('2026-10-26', 'pl')).toBe('26.10–1.11')
    expect(weekRange('2026-10-12', 'en')).toBe('12–18 Oct')
    expect(weekdayOf('2026-10-26', 'en')).toBe('Monday')
    expect(weekdayOf('2026-10-26', 'pl')).toBe('poniedziałek')
  })
  it('słownik angielski nie ma polskich liter (poza kluczami tłumaczenia flag)', () => {
    const leaves: string[] = []
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'string') leaves.push(`${path}=${v}`)
      else if (typeof v === 'function') leaves.push(`${path}=${String((v as (...a: unknown[]) => unknown)(3, '3', '3', 3, 3, 3))}`)
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (path !== '.letter.flags') walk(x, `${path}.${k}`)
    }
    walk(strings('en') satisfies Dict, '')
    expect(leaves.filter((l) => PL_LETTERS.test(l))).toEqual([])
    expect(Object.values(strings('en').letter.flags).every((t) => !PL_LETTERS.test(t))).toBe(true)
  })
})

const ride: RideLite = {
  date: '2026-10-26',
  name: 'Morning Ride',
  moving_time_s: 95 * 60,
  distance_m: 42_300,
  elevation_m: 310,
  avg_hr: 138,
  avg_cadence: 84,
  avg_watts: 180,
  np_w: 186,
  device_watts: true,
  decoupling_pct: 3.4,
  hr_histogram: null,
}

describe('maile po angielsku', () => {
  it('podsumowanie jazdy: temat, treść i stopka bez polskich liter, nazwa Bicycle Coach', () => {
    const v = buildWorkoutView(ride, null, { athlete: 'Luke', appUrl: 'https://x.test', rideDateLabel: 'Monday, 26 October', lang: 'en' })
    expect(v.verdict.text).toMatch(/^Unplanned ride/)
    expect(v.stats.map((s) => s.value)).toContain('42.3')
    const m = workoutEmail({ ...v, rpe: { links: [{ value: 1, href: 'https://f.test/r1' }], current: null } }, { lang: 'en', unsubscribeUrl: 'https://f.test/u' })
    expect(m.subject).toBe('Done: Morning Ride · 1:35 h')
    expect(PL_LETTERS.test(m.subject)).toBe(false)
    expect(PL_LETTERS.test(m.text)).toBe(false)
    expect(PL_LETTERS.test(m.html)).toBe(false)
    expect(m.html).toContain('<html lang="en">')
    expect(m.html).toContain('Bicycle Coach · <a')
    expect(m.html).toContain('turn off these emails')
    expect(m.html).toContain('How hard was it? (RPE)')
  })
  it('podsumowanie po polsku bez zmian (domyślny język) i z nową nazwą w stopce', () => {
    const v = buildWorkoutView(ride, null, { athlete: 'Luke', appUrl: 'https://x.test', rideDateLabel: 'poniedziałek, 26 października' })
    const m = workoutEmail(v, { unsubscribeUrl: 'https://f.test/u' })
    expect(v.stats.map((s) => s.value)).toContain('42,3')
    expect(m.subject).toBe('Zrobione: Morning Ride · 1:35 h')
    expect(m.html).toContain('Bicycle Coach · <a')
    expect(m.html).toContain('wyłącz te maile')
  })
  it('poranna odprawa i list tygodnia po angielsku', () => {
    const mv: MorningView = {
      athlete: 'Luke',
      appUrl: 'https://x.test',
      dateLabel: 'Tuesday, 27 October',
      weekLabel: 'Week 6 · Base',
      workout: { name: 'Endurance Z2', minutes: 90, key: true, bike: 'Roubaix', description: 'Steady.', steps: [{ name: 'Z2', minutes: 80, zone: 'Z2', hr: '130–142 bpm', cadence: '80–95' }] },
      nutrition: { label: 'Training day', carbs: '60 g/h', protein: '180 g', after: null },
      legs: { links: [{ value: 3, href: 'https://f.test/l3' }], current: null },
    }
    const m = morningEmail(mv, { lang: 'en' })
    expect(m.subject).toBe('Today: Endurance Z2 · 1 h 30 min')
    expect(m.preheader).toContain('key session')
    expect(PL_LETTERS.test(m.html + m.text)).toBe(false)
    expect(m.html).toContain('How are your legs today?')

    const wv: WeeklyView = {
      athlete: 'Luke',
      appUrl: 'https://x.test',
      reportUrl: 'https://x.test/r',
      weekLabel: weekRange('2026-10-19', 'en'),
      letter: ['A good week.'],
      days: [{ weekday: 'Tuesday', planned: 'Endurance Z2 · 1 h 30 min', outcome: 'done', summary: null }],
      totals: { done: '5 h', planned: '6 h', pct: 83, rides: 1, km: 140, tss: 300 },
      body: [{ weight: '96.1 kg', rhr: null, legs: '3.5/5' }],
      next: { label: strings('en').mail.weekly.next('6 h', true), days: [] },
    }
    const w = weeklyEmail(wv, { lang: 'en' })
    expect(w.subject).toBe('Week 19–25 Oct: 5 h of 6 h · 83 % · TSS 300')
    expect(w.text).toContain('Total: 5 h of 6 h, 1 ride, 140 km')
    expect(PL_LETTERS.test(w.html + w.text)).toBe(false)
  })
})

describe('AI i Strava wg języka', () => {
  it('numbersOk przyjmuje kropkę i przecinek dziesiętny', () => {
    const facts = { ride: { decoupling_pct: 8.7, if: 0.72 } }
    expect(numbersOk('Drift 8.7 %, IF 0.72.', facts).ok).toBe(true)
    expect(numbersOk('Dryf 8,7 %, IF 0,72.', facts).ok).toBe(true)
    expect(numbersOk('Drift 9.7 %.', facts).ok).toBe(false)
  })
  it('podpis na Stravie: Notatki / Notes: Bicycle Coach', () => {
    expect(SIGNATURE).toBe('Notatki: Bicycle Coach')
    expect(signatureFor('en')).toBe('Notes: Bicycle Coach')
    expect(withSignature('Steady ride', 'en')).toBe('Steady ride.\n\nNotes: Bicycle Coach')
    expect(parseDraft('Title: Long ride 140 km\nDescription: Even pacing.')).toEqual({ title: 'Long ride 140 km', description: 'Even pacing.' })
  })
  it('prompty: polski bez zmian, angielski z instrukcją języka', () => {
    expect(coachSystem('pl')).toBe(COACH_SYSTEM)
    expect(coachSystem('en')).toMatch(/wyłącznie po angielsku/)
    expect(checkinPrompt('legs heavy', {}, 'en')).toMatch(/po angielsku[\s\S]*Zdanie: legs heavy$/)
    expect(checkinPrompt('nogi ciężkie', {})).toBe('Zdanie: nogi ciężkie')
    expect(mealPrompt(null, {}, 'en')).toMatch(/po angielsku/)
    expect(mealPrompt(null, {})).not.toMatch(/angielsku/)
  })
})
