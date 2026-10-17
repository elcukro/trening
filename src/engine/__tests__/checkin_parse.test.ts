import { describe, expect, it } from 'vitest'
import { isEmpty, parseReply, userPrompt } from '../../../supabase/functions/_shared/checkin_parse'

describe('check-in jednym zdaniem', () => {
  it('czyta JSON modelu, także w bloku kodu, i pilnuje zakresów', () => {
    const f = parseReply('```json\n{"weight_kg":"104,8","resting_hr":52,"sleep":2,"legs":3,"motivation":5,"sick":false,"notes":"lekki ból kolana"}\n```')
    expect(f).toEqual({ weight_kg: 104.8, resting_hr: 52, sleep: 2, legs: 3, motivation: 5, sick: false, notes: 'lekki ból kolana' })
    const bad = parseReply('{"weight_kg":12,"resting_hr":300,"sleep":9,"legs":0,"motivation":"dużo","sick":"tak","notes":""}')
    expect(bad).toEqual({ weight_kg: null, resting_hr: null, sleep: null, legs: null, motivation: null, sick: null, notes: null })
    expect(isEmpty(bad!)).toBe(true)
    expect(parseReply('nie wiem')).toBeNull()
  })
  it('podpowiedź z ostatnimi wartościami trafia do promptu', () => {
    expect(userPrompt('52 i 104,8', { last_weight_kg: 105.1, last_resting_hr: 54 })).toMatch(/ostatnia waga 105.1 kg, ostatnie tętno spoczynkowe 54 bpm/)
    expect(userPrompt('nogi ciężkie', {})).toBe('Zdanie: nogi ciężkie')
  })
})
