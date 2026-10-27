// Dietetyk (docs/25 § 4.4): zdjęcie posiłku albo etykiety produktu → danie z kcal i białkiem do podglądu.
// Czysty TS: prompt, parsowanie odpowiedzi modelu i walidacja zakresów – testy w src/engine/__tests__/meal_parse.test.ts.
// Model rozpoznaje i przepisuje; kcal produktu z etykiety liczy aplikacja z ilości (`labelTotals` w src/engine/intake.ts).

import type { Lang } from './i18n.ts'

export interface ParsedItem {
  name: string
  grams: number | null
  kcal: number
  protein_g: number
}

export interface ParsedLabel {
  unit: 'g' | 'ml'
  per_100: { kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
  package: number | null
  serving: number | null
}

export interface ParsedMeal {
  kind: 'dish' | 'label'
  name: string
  items: ParsedItem[]
  total: { kcal: number; protein_g: number; carbs_g: number | null; fat_g: number | null }
  confidence: number
  question: string | null
  label: ParsedLabel | null
  /** uwagi z walidacji pokazywane w podglądzie (np. makro z etykiety nie zgadza się z kcal) */
  warnings: string[]
}

export const SYSTEM = `Jesteś dietetykiem w aplikacji treningowej kolarza. Dostajesz 1–2 zdjęcia: talerz z jedzeniem ALBO opakowanie produktu
(tabela wartości odżywczych, opcjonalnie przód opakowania). Odpowiadasz wyłącznie JSON-em, bez żadnego tekstu poza nim.

Najpierw rozstrzygnij "kind":
- "label" – na zdjęciu widać tabelę wartości odżywczych produktu. Wtedy NIE szacujesz: przepisujesz liczby z etykiety.
  "label": {"unit": "g" albo "ml", "per_100": {"kcal", "protein_g", "carbs_g", "fat_g"} – wartości na 100 g/ml (energia w kcal, nie kJ),
  "package": masa/objętość całego opakowania albo null, "serving": wielkość porcji z etykiety albo null}.
  Pole, którego nie widać albo nie da się odczytać, ma wartość null – nie zgaduj. Gdy etykieta podaje tylko wartości na porcję,
  przelicz je na 100 g/ml z wielkości porcji. "name": nazwa produktu z opakowania (marka + produkt), "items": [], "total" dla
  całego opakowania (albo porcji, gdy masy opakowania nie ma). Gdy nie widać wartości energetycznej: "question": "Nie widzę tabeli
  kalorii – zrób zdjęcie bliżej" i "confidence": 0.
- "dish" – zdjęcie jedzenia. Rozpoznaj każdą pozycję, oszacuj gramy po wskazówkach wizualnych (talerz ok. 27 cm, sztućce, kromka,
  łyżka), potem kcal i białko. Dolicz tłuszcz do smażenia i sosy, które widać albo są typowe. Polskie nazwy dań i porcje domowe.
  "items": [{"name", "grams", "kcal", "protein_g"}], "total": {"kcal", "protein_g", "carbs_g", "fat_g"} – suma pozycji, "label": null.

Zawsze: "name" – krótka polska nazwa (np. "Schabowy z ziemniakami i surówką"), "confidence" 0–1 dla sumy kcal,
"question": jedno krótkie pytanie, gdy pewność < 0,5 (np. "Jaki duży był talerz?", "Smażone na oleju?"), inaczej null.
Notatka zawodnika (np. "duża porcja", "bez sosu", "zjadłem połowę") ma pierwszeństwo przed tym, co widać.`

const numIn = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null
}
const round = (v: number | null): number | null => (v == null ? null : Math.round(v))
const round1 = (v: number | null): number | null => (v == null ? null : Math.round(v * 10) / 10)
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** Notatka i cel białka – jedyne, co z klienta trafia do modelu poza zdjęciami. */
export function userPrompt(note: string | null | undefined, hint: { protein_target?: unknown } = {}, lang: Lang = 'pl'): string {
  const lines = ['Rozpoznaj posiłek albo produkt ze zdjęcia.']
  // zawodnik z aplikacją po angielsku: nazwy i pytanie po angielsku (zamiast „krótka polska nazwa”), liczby w JSON bez zmian
  if (lang === 'en') lines.push('Zawodnik używa aplikacji po angielsku: "name", nazwy pozycji w "items" i "question" napisz po angielsku (np. "Pork cutlet with potatoes and slaw", "How big was the plate?").')
  const n = text(note, 200)
  if (n) lines.push(`Notatka zawodnika: ${n}`)
  const p = numIn(hint.protein_target, 30, 400)
  if (p != null) lines.push(`(Cel białka zawodnika: ${Math.round(p)} g/dzień – tylko kontekst, nie wpływa na szacunek.)`)
  return lines.join('\n')
}

/** Zdjęcia z klienta: 1–2 obrazy base64 (JPEG/PNG/WebP/HEIC jako data URL albo czysty base64), każdy ≤ ~1,5 MB. */
export function cleanImages(raw: unknown): { mime: string; data: string }[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 2) return null
  const out: { mime: string; data: string }[] = []
  for (const r of raw) {
    if (typeof r !== 'string') return null
    const m = r.match(/^data:(image\/(?:jpeg|png|webp|heic));base64,(.+)$/)
    const mime = m ? m[1]! : 'image/jpeg'
    const data = m ? m[2]! : r
    if (data.length < 100 || data.length > 2_000_000 || !/^[A-Za-z0-9+/=]+$/.test(data)) return null
    out.push({ mime, data })
  }
  return out
}

function parseLabel(raw: unknown, warnings: string[]): ParsedLabel | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  const p = (l.per_100 ?? {}) as Record<string, unknown>
  const kcal = numIn(p.kcal, 0, 900)
  if (kcal == null) return null
  const protein = numIn(p.protein_g, 0, 100)
  const carbs = numIn(p.carbs_g, 0, 100)
  const fat = numIn(p.fat_g, 0, 100)
  // kontrola Atwatera: 4·B + 4·W + 9·T ≈ kcal (±15 %, min. 15 kcal) – łapie źle przepisane cyfry albo kJ zamiast kcal
  if (protein != null && carbs != null && fat != null) {
    const atwater = 4 * protein + 4 * carbs + 9 * fat
    if (Math.abs(atwater - kcal) > Math.max(15, 0.15 * kcal)) warnings.push(`Makro z etykiety daje ok. ${Math.round(atwater)} kcal na 100, a odczytane ${Math.round(kcal)} – sprawdź etykietę.`)
  }
  return {
    unit: l.unit === 'ml' ? 'ml' : 'g',
    per_100: { kcal: round1(kcal)!, protein_g: round1(protein), carbs_g: round1(carbs), fat_g: round1(fat) },
    package: round(numIn(l.package, 1, 10000)),
    serving: round(numIn(l.serving, 1, 5000)),
  }
}

/** JSON z odpowiedzi modelu (także w bloku kodu) → podgląd w sensownych zakresach; null = nie do użycia (ponów albo błąd). */
export function parseReply(reply: string): ParsedMeal | null {
  const m = reply.match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(m[0]) as Record<string, unknown>
  } catch {
    return null
  }
  const warnings: string[] = []
  const confidence = numIn(raw.confidence, 0, 1) ?? 0.5
  const question = text(raw.question, 200)
  const name = text(raw.name, 80) ?? 'Posiłek'

  if (raw.kind === 'label') {
    const label = parseLabel(raw.label, warnings)
    if (!label) return { kind: 'label', name, items: [], total: { kcal: 0, protein_g: 0, carbs_g: null, fat_g: null }, confidence: 0, question: question ?? 'Nie widzę tabeli kalorii – zrób zdjęcie bliżej', label: null, warnings }
    const amount = label.package ?? label.serving ?? 100
    const f = amount / 100
    const r = (v: number | null) => (v == null ? null : Math.round(v * f))
    return { kind: 'label', name, items: [], total: { kcal: Math.round(label.per_100.kcal * f), protein_g: r(label.per_100.protein_g) ?? 0, carbs_g: r(label.per_100.carbs_g), fat_g: r(label.per_100.fat_g) }, confidence, question, label, warnings }
  }

  const items: ParsedItem[] = []
  for (const it of Array.isArray(raw.items) ? raw.items.slice(0, 15) : []) {
    const o = (it ?? {}) as Record<string, unknown>
    const kcal = numIn(o.kcal, 0, 3000)
    const n = text(o.name, 60)
    if (kcal == null || !n) continue
    items.push({ name: n, grams: round(numIn(o.grams, 0, 3000)), kcal: Math.round(kcal), protein_g: Math.round(numIn(o.protein_g, 0, 300) ?? 0) })
  }
  const t = (raw.total ?? {}) as Record<string, unknown>
  let kcal = numIn(t.kcal, 0, 5000)
  const itemsKcal = items.reduce((s, i) => s + i.kcal, 0)
  // suma pozycji jest dokładniejsza niż „total” wpisany przez model – przy rozjeździe > 15 % bierzemy sumę
  if (items.length && (kcal == null || Math.abs(itemsKcal - kcal) > 0.15 * Math.max(kcal, itemsKcal))) kcal = itemsKcal
  if (kcal == null || kcal < 20 || kcal > 3000) return null
  let protein = numIn(t.protein_g, 0, 300) ?? items.reduce((s, i) => s + i.protein_g, 0)
  // białko nie może dawać więcej niż ok. całe kcal (1 g = 4 kcal)
  if (protein * 4 > kcal) protein = Math.floor(kcal / 4)
  return {
    kind: 'dish',
    name,
    items,
    total: { kcal: Math.round(kcal), protein_g: Math.round(protein), carbs_g: round(numIn(t.carbs_g, 0, 600)), fat_g: round(numIn(t.fat_g, 0, 300)) },
    confidence,
    question: confidence < 0.5 ? question : null,
    label: null,
    warnings,
  }
}
