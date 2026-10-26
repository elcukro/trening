import { describe, expect, it } from 'vitest'
import type { OnboardingRow } from '@/db'
import { bodyFromHealth, onboardingDue, prefill, startFrom } from '../onboarding'

const row = (patch: Partial<OnboardingRow>): OnboardingRow => ({ id: 'v1', updated_at: '2026-10-26T10:00:00Z', status: 'draft', step: null, draft: null, data: null, schema_version: 1, consent_health_at: null, consent_version: null, completed_at: null, ...patch })

describe('onboardingDue', () => {
  const base = { signedIn: true, synced: true, later: false }
  it('nowe konto i przerwany szkic – tak; skończony i legacy – nie', () => {
    expect(onboardingDue({ ...base, row: null })).toBe(true)
    expect(onboardingDue({ ...base, row: row({}) })).toBe(true)
    expect(onboardingDue({ ...base, row: row({ status: 'done' }) })).toBe(false)
    expect(onboardingDue({ ...base, row: row({ status: 'legacy' }) })).toBe(false)
    expect(onboardingDue({ ...base, row: row({ status: 'legacy', deleted_at: '2026-10-26T11:00:00Z' }) })).toBe(true)
  })
  it('bez konta, przed pełnym pobraniem, w trakcie ładowania i po „Później” – nie', () => {
    expect(onboardingDue({ ...base, signedIn: false, row: null })).toBe(false)
    expect(onboardingDue({ ...base, synced: false, row: null })).toBe(false)
    expect(onboardingDue({ ...base, row: undefined })).toBe(false)
    expect(onboardingDue({ ...base, later: true, row: null })).toBe(false)
  })
})

describe('startFrom', () => {
  it('nowe konto: powitanie, ciało z profilu, bez progów programu', () => {
    const s = startFrom(null, { height_cm: 181, birth_date: null, power_meter: true, ftp_w_estimate: 220 })
    expect(s).toEqual({ step: 'intro', draft: { body: { height_cm: 181 } } })
  })

  it('konto sprzed onboardingu: progi z profilu', () => {
    expect(startFrom(row({ status: 'legacy' }), { power_meter: true, ftp_w_estimate: 290, lthr_bpm: 165, hr_max_bpm: 185, birth_date: '1980-02-03' }).draft).toEqual({
      body: { birth_date: '1980-02-03' },
      measure: { level: 'power', ftp_w: 290, lthr_bpm: 165, hr_max_bpm: 185 },
    })
    expect(prefill({ power_meter: false, lthr_bpm: 160 }, true).measure).toEqual({ level: 'hr', lthr_bpm: 160 })
    expect(prefill({ power_meter: false }, true).measure).toEqual({ level: 'rpe' })
  })

  it('szkic: zapisany krok, chyba że wcześniejszy jest niewypełniony', () => {
    const draft = { time: { hours_per_week: 6, days: ['sat' as const] } }
    expect(startFrom(row({ draft, step: 'time_detail' }), {}).step).toBe('time_detail')
    expect(startFrom(row({ draft, step: 'gear' }), {}).step).toBe('time_detail')
    expect(startFrom(row({ draft, step: 'bogus' }), {}).step).toBe('time_detail')
  })

  it('skończony: podsumowanie z danymi bez wersji', () => {
    const data = { version: 1, time: { hours_per_week: 5 } } as unknown as OnboardingRow['data']
    expect(startFrom(row({ status: 'done', data }), {})).toEqual({ step: 'summary', draft: { time: { hours_per_week: 5 } } })
  })
})

describe('bodyFromHealth', () => {
  const today = '2026-10-26'
  it('wypełnia puste pola, zaokrągla jak listy', () => {
    expect(bodyFromHealth(undefined, { height_cm: 181.6, weight_kg: 82.37, birth_date: '1985-05-01', sex: 'male' }, today)).toEqual({
      body: { height_cm: 182, weight_kg: 82.5, birth_date: '1985-05-01', sex: 'male' },
      filled: ['height_cm', 'weight_kg', 'birth_date', 'sex'],
    })
  })
  it('nie nadpisuje wartości z profilu ani wyboru; puste (także null po pominięciu) wypełnia', () => {
    const r = bodyFromHealth({ height_cm: 175, weight_kg: null, sex: 'male' }, { height_cm: 181, weight_kg: 80, sex: 'female' }, today)
    expect(r).toEqual({ body: { height_cm: 175, weight_kg: 80, sex: 'male' }, filled: ['weight_kg'] })
  })
  it('odrzuca wartości spoza zakresów i brak danych', () => {
    expect(bodyFromHealth({}, { height_cm: 90, weight_kg: 400, birth_date: '2015-01-01', sex: null }, today).filled).toEqual([])
    expect(bodyFromHealth({}, { birth_date: '01.05.1985' }, today).filled).toEqual([])
    expect(bodyFromHealth({ height_cm: 170 }, null, today)).toEqual({ body: { height_cm: 170 }, filled: [] })
  })
})
