import { describe, expect, it } from 'vitest'
import { cleanImages, parseReply, userPrompt } from '../../../supabase/functions/_shared/meal_parse'

const dish = (o: Record<string, unknown>) => JSON.stringify({ kind: 'dish', name: 'Kurczak z ryżem', confidence: 0.8, question: null, label: null, ...o })

describe('meal-parse – walidacja odpowiedzi modelu (docs/25 § 4.4)', () => {
  it('danie: czyta JSON także z bloku kodu', () => {
    const r = parseReply('```json\n' + dish({ items: [{ name: 'kurczak', grams: 150, kcal: 250, protein_g: 45 }, { name: 'ryż', grams: 200, kcal: 260, protein_g: 5 }], total: { kcal: 510, protein_g: 50, carbs_g: 60, fat_g: 8 } }) + '\n```')
    expect(r?.kind).toBe('dish')
    expect(r?.total).toEqual({ kcal: 510, protein_g: 50, carbs_g: 60, fat_g: 8 })
    expect(r?.items).toHaveLength(2)
    expect(r?.question).toBeNull()
  })

  it('danie: przy rozjeździe sumy pozycji i total > 15 % bierze sumę pozycji', () => {
    const r = parseReply(dish({ items: [{ name: 'a', grams: 100, kcal: 400, protein_g: 10 }, { name: 'b', grams: 100, kcal: 400, protein_g: 10 }], total: { kcal: 500, protein_g: 20 } }))
    expect(r?.total.kcal).toBe(800)
  })

  it('danie: kcal poza 20–3000 albo zepsuty JSON = null', () => {
    expect(parseReply(dish({ items: [], total: { kcal: 5 } }))).toBeNull()
    expect(parseReply(dish({ items: [], total: { kcal: 4800 } }))).toBeNull()
    expect(parseReply('{"kind": "dish", "name": "x" "total": {}}')).toBeNull()
    expect(parseReply('nie wiem')).toBeNull()
  })

  it('danie: białko nie może przekroczyć kcal/4, pytanie tylko przy niskiej pewności', () => {
    const r = parseReply(dish({ items: [], total: { kcal: 200, protein_g: 90 }, confidence: 0.9, question: 'Jaki talerz?' }))
    expect(r?.total.protein_g).toBe(50)
    expect(r?.question).toBeNull()
    expect(parseReply(dish({ items: [], total: { kcal: 600, protein_g: 30 }, confidence: 0.3, question: 'Smażone na oleju?' }))?.question).toBe('Smażone na oleju?')
  })

  it('etykieta: wartości na 100 g, total dla opakowania', () => {
    const r = parseReply(JSON.stringify({ kind: 'label', name: 'Haribo Złote Misie', confidence: 0.95, label: { unit: 'g', per_100: { kcal: 343, protein_g: 6.9, carbs_g: 77, fat_g: 0.5 }, package: 200, serving: 25 } }))
    expect(r?.kind).toBe('label')
    expect(r?.label).toEqual({ unit: 'g', per_100: { kcal: 343, protein_g: 6.9, carbs_g: 77, fat_g: 0.5 }, package: 200, serving: 25 })
    expect(r?.total.kcal).toBe(686)
    expect(r?.warnings).toEqual([])
  })

  it('etykieta: makro niezgodne z kcal (np. kJ zamiast kcal) daje ostrzeżenie', () => {
    const r = parseReply(JSON.stringify({ kind: 'label', name: 'Napój', label: { unit: 'ml', per_100: { kcal: 180, protein_g: 0, carbs_g: 10.6, fat_g: 0 }, package: 500, serving: null } }))
    expect(r?.label?.unit).toBe('ml')
    expect(r?.warnings[0]).toContain('sprawdź etykietę')
  })

  it('etykieta bez kcal: pytanie o lepsze zdjęcie zamiast szacunku', () => {
    const r = parseReply(JSON.stringify({ kind: 'label', name: 'Baton', label: { unit: 'g', per_100: { kcal: null }, package: 50 } }))
    expect(r?.label).toBeNull()
    expect(r?.confidence).toBe(0)
    expect(r?.question).toContain('zdjęcie bliżej')
  })

  it('zdjęcia: 1–2 obrazy base64, nic innego', () => {
    const b = 'A'.repeat(200)
    expect(cleanImages([b])).toEqual([{ mime: 'image/jpeg', data: b }])
    expect(cleanImages([`data:image/png;base64,${b}`, b])?.[0]?.mime).toBe('image/png')
    expect(cleanImages([])).toBeNull()
    expect(cleanImages([b, b, b])).toBeNull()
    expect(cleanImages(['data:text/html;base64,' + b])).toBeNull()
    expect(cleanImages(['<script>' + b])).toBeNull()
    expect(cleanImages('x')).toBeNull()
  })

  it('prompt: notatka i cel białka, bez śmieci z klienta', () => {
    expect(userPrompt('  duża porcja ', { protein_target: 180 })).toContain('Notatka zawodnika: duża porcja')
    expect(userPrompt('', { protein_target: 'x' })).toBe('Rozpoznaj posiłek albo produkt ze zdjęcia.')
  })
})
