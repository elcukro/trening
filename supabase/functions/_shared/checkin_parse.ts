// Check-in jednym zdaniem (docs/21 § 2 pkt 2): tekst zawodnika („104,8, tętno 52, spałem słabo, nogi 3”) → pola check-inu.
// Czysty TS: prompt, parsowanie odpowiedzi i walidacja zakresów – testy w src/engine/__tests__/checkin_parse.test.ts.

import type { Lang } from './i18n.ts'

export interface CheckinFields {
  weight_kg: number | null
  resting_hr: number | null
  sleep: number | null
  legs: number | null
  motivation: number | null
  sick: boolean | null
  notes: string | null
}

export const EMPTY: CheckinFields = { weight_kg: null, resting_hr: null, sleep: null, legs: null, motivation: null, sick: null, notes: null }

export const SYSTEM = `Wyciągasz dane porannego check-inu kolarza z jednego zdania po polsku. Odpowiadasz wyłącznie JSON-em o kluczach:
weight_kg (liczba, kg, przecinek dziesiętny zamień na kropkę), resting_hr (liczba, tętno spoczynkowe w bpm),
sleep, legs, motivation (liczby 1–5; 1 = fatalnie/ciężkie/żadna, 5 = świetnie/lekkie/pełna), sick (true/false),
notes (krótki tekst z resztą informacji, np. ból, stres, objawy; bez powtarzania liczb).
Słowa na skalę 1–5: fatalnie/tragicznie=1, słabo/kiepsko=2, średnio/ok/normalnie=3, dobrze=4, świetnie/super/rewelacyjnie=5.
„Nogi ciężkie”=2, „nogi lekkie”=4, „nogi jak z waty”=1. Liczba bez jednostki od 40 do 200 z dziesiątkami to waga; liczba 30–120 przy słowach tętno/puls/HR to tętno.
Pole, o którym zdanie nie mówi, ma wartość null. Nie zgaduj. Żadnego tekstu poza JSON-em.`

/** Dla zawodnika z aplikacją po angielsku: zdanie jest po angielsku, a `notes` ma wrócić po angielsku. */
const EN_HINT = 'Zdanie jest po angielsku (np. terrible=1, poor/heavy legs=2, ok/normal=3, good/fresh legs=4, great=5; „legs like jelly”=1). Pole notes napisz po angielsku.'

const inRange = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null
}

/** Podpowiedź do promptu tylko jako liczby w sensownym zakresie – nic innego z klienta nie trafia do modelu. */
export function userPrompt(text: string, hint: { last_weight_kg?: unknown; last_resting_hr?: unknown }, lang: Lang = 'pl'): string {
  const h: string[] = []
  const w = inRange(hint.last_weight_kg, 30, 300)
  const hr = inRange(hint.last_resting_hr, 20, 200)
  if (w != null) h.push(`ostatnia waga ${w} kg`)
  if (hr != null) h.push(`ostatnie tętno spoczynkowe ${Math.round(hr)} bpm`)
  return `${h.length ? `Kontekst (do rozstrzygania, która liczba jest czym): ${h.join(', ')}.\n` : ''}${lang === 'en' ? `${EN_HINT}\n` : ''}Zdanie: ${text.trim().slice(0, 500)}`
}

const int15 = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v) : null)

/** JSON z odpowiedzi modelu (także w bloku kodu) → pola w sensownych zakresach; wszystko inne = null. */
export function parseReply(text: string): CheckinFields | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return null
  }
  const w = typeof raw.weight_kg === 'number' ? raw.weight_kg : typeof raw.weight_kg === 'string' ? Number(raw.weight_kg.replace(',', '.')) : NaN
  const hr = typeof raw.resting_hr === 'number' ? raw.resting_hr : typeof raw.resting_hr === 'string' ? Number(raw.resting_hr) : NaN
  const notes = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim().slice(0, 300) : null
  return {
    weight_kg: Number.isFinite(w) && w >= 40 && w <= 200 ? Math.round(w * 10) / 10 : null,
    resting_hr: Number.isFinite(hr) && hr >= 30 && hr <= 120 ? Math.round(hr) : null,
    sleep: int15(raw.sleep),
    legs: int15(raw.legs),
    motivation: int15(raw.motivation),
    sick: typeof raw.sick === 'boolean' ? raw.sick : null,
    notes,
  }
}

export function isEmpty(f: CheckinFields): boolean {
  return f.weight_kg == null && f.resting_hr == null && f.sleep == null && f.legs == null && f.motivation == null && f.sick == null && !f.notes
}
