import { describe, expect, it } from 'vitest'
import { parseTuneReply, sanitizeTuneRequest, tunePrompt } from '../../../supabase/functions/_shared/plan_tune'
import { assertAiSafe } from '../../../supabase/functions/_shared/provenance'

const req = { inputs: { weekly_hours: 6, discipline: 'gravel', cautious: false }, templates: [{ id: 'pyramidal', name: 'Piramida', summary: 'Baza, próg, specyfika.', intensity: '80 % spokojnie' }], bounds: { volume_pct: [70, 100] } }

describe('plan-tune: prompt i odpowiedź modelu (docs/33 § 8.2)', () => {
  it('prompt ma wejście, szablony, granice i notatkę zawodnika – bez danych Stravy', () => {
    const r = sanitizeTuneRequest({ ...req, note: 'Nie mogę w środy.' })!
    const p = tunePrompt(r)
    expect(p).toMatch(/WEJŚCIE[\s\S]*SZABLONY[\s\S]*pyramidal[\s\S]*GRANICE[\s\S]*Nie mogę w środy/)
    expect(() => assertAiSafe(r)).not.toThrow()
    expect(() => assertAiSafe({ ...r, inputs: { strava_rides: 12 } })).toThrow()
  })

  it('odczyt JSON z odpowiedzi, także z tekstem dookoła; śmieci → null', () => {
    expect(parseTuneReply('Proszę:\n```json\n{"template":"climbing","volume_pct":90}\n```')).toEqual({ template: 'climbing', volume_pct: 90 })
    expect(parseTuneReply('brak')).toBeNull()
    expect(parseTuneReply('[1,2]')).toBeNull()
  })

  it('prośba bez wymaganych pól albo za duża jest odrzucana', () => {
    expect(sanitizeTuneRequest({ inputs: {} })).toBeNull()
    expect(sanitizeTuneRequest({ ...req, inputs: { x: 'a'.repeat(20_000) } })).toBeNull()
  })
})
