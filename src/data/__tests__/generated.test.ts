import { describe, expect, it } from 'vitest'
import type { PlanRow } from '@/db'
import { GENERATOR_VERSION, generateProgram } from '@/engine/generator'
import { planInputs, type AthleteProfile } from '@/engine/onboarding'
import { generatedProgram, planOutdated, resolveProgram } from '../generated'
import { loadProgram } from '../program'

const TODAY = '2026-10-26'

const profile: AthleteProfile = {
  version: 1,
  time: { hours_per_week: 6, days: ['tue', 'thu', 'sat'], weekday_max_min: 90, weekend_max_min: 180, fixed: [] },
  current: { hours_4w: 4, longest_ride_min: 120, years: '1to3' },
  measure: { level: 'hr', ftp_w: null, lthr_bpm: 160, hr_max_bpm: 185 },
  gear: { disciplines: ['gravel'], bikes: ['gravel'], trainer: 'none', devices: [] },
  consent: { health_data: true, at: '2026-10-26T10:00:00Z', version: '2026-10-26' },
  body: { height_cm: 175, weight_kg: 70, birth_date: null, sex: null },
  health: { heart: false, chest_pain: false, dizziness: false, supervised: false, chronic: false, meds: false, injury: false },
  goal: { type: 'fitness', weekly_hours: 6, weeks: 12, date: null },
}

const row: PlanRow = {
  id: 'current',
  updated_at: '2026-10-26T12:00:00Z',
  inputs: planInputs(profile, TODAY),
  extras: { weight_kg: 70, hr_max_bpm: 185, longest_ride_min: 120 },
  generator_version: GENERATOR_VERSION,
  program_start: TODAY,
  generated_for: TODAY,
  source: 'onboarding',
}

describe('program z wiersza plans (docs/32 § 7)', () => {
  it('regeneruje ten sam program co generator z profilu i trzyma go w pamięci podręcznej', () => {
    const a = generatedProgram(row)
    expect(JSON.stringify(a)).toBe(JSON.stringify(generateProgram(profile, TODAY).program))
    expect(generatedProgram(row)).toBe(a)
    expect(generatedProgram({ ...row, updated_at: '2026-10-27T00:00:00Z' })).not.toBe(a)
  })

  it('identyfikator generated bez wiersza albo z usuniętym wierszem spada na program domyślny', () => {
    expect(resolveProgram('generated', row).default_settings.program_id).toBe('generated')
    expect(resolveProgram('generated', null)).toBe(loadProgram())
    expect(resolveProgram('generated', { ...row, deleted_at: '2026-10-27T00:00:00Z' })).toBe(loadProgram())
    expect(resolveProgram('ftp300', row)).toBe(loadProgram('ftp300'))
    expect(resolveProgram(undefined, null)).toBe(loadProgram())
  })

  it('plan liczony inną wersją generatora jest oznaczony do przeliczenia', () => {
    expect(planOutdated(row)).toBe(false)
    expect(planOutdated({ ...row, generator_version: '0.9.0' })).toBe(true)
    expect(planOutdated(null)).toBe(false)
  })
})
