/**
 * Dopasowanie planu przez AI (docs/33 § 8.2): prompt i odczyt odpowiedzi. Czysty TS (Vitest: `plan_tune.test.ts`).
 * Model dostaje odpowiedzi onboardingu w postaci wejść generatora, listę dozwolonych szablonów i granice z kodu –
 * nic ze Stravy. Odpowiada jednym obiektem JSON. Granic pilnuje aplikacja (`clampTuning`) – serwer tylko czyta JSON.
 */

export interface TuneTemplate {
  id: string
  name: string
  summary: string
  intensity: string
}

export interface TuneRequest {
  /** wejścia generatora (`PlanInputs`) – bez surowych odpowiedzi zdrowotnych, tylko flagi `cautious`/`intensity_allowed` */
  inputs: Record<string, unknown>
  templates: TuneTemplate[]
  bounds: Record<string, unknown>
  /** zdanie zawodnika „co jeszcze jest ważne” (opcjonalne, ≤ 300 znaków) */
  note?: string | null
}

export const TUNE_SYSTEM = `Jesteś trenerem kolarskim. Układasz plan treningowy dla nowego zawodnika, ale nie piszesz treningów: wybierasz szablon planu i ustawiasz kilka parametrów generatora. Generator i kod aplikacji pilnują zasad (budżet czasu, odpoczynek, zdrowie) – twoje wartości spoza granic zostaną poprawione.

Zasady wyboru:
- Szablon tylko z listy SZABLONY. Bez wyraźnego powodu wybierz "pyramidal".
- Mało czasu (do 6 h) i doświadczenie co najmniej średnie → rozważ "time_crunched". Cel górski albo wydarzenie z dużym przewyższeniem (≥ 12 m/km) → "climbing". Gravel lub długie wydarzenie → "gravel_endurance". MTB z celem wyścigowym → "mtb_xc". Doświadczony, dużo godzin, cel mocowy → "polarized". Powrót po przerwie albo cautious → "comeback".
- volume_pct: 100 = cały podany czas. Mniej (80–90), gdy zawodnik zaczyna od dużo niższej objętości niż docelowa albo w notatce mówi o zmęczeniu, pracy zmianowej, małych dzieciach.
- ramp_pct: 10 dla doświadczonych, 5–7 dla początkujących i ostrożnych.
- key_sessions: najwyżej tyle, ile pozwalają granice; przy wątpliwościach mniej.
- long_day / key_days: tylko gdy zawodnik o to prosi w notatce albo stałe punkty tego wymagają; inaczej null (generator wybierze sam).
- test_every_blocks: 2, chyba że cel to FTP z bliską datą (1) albo zawodnik jest ostrożny (3).

Uzasadnienia ("why"): po polsku, do zawodnika (forma „Ty”), jedno zdanie na pole, najwyżej 160 znaków. Liczby tylko te, które są w WEJŚCIU albo w twoich parametrach. Bez obietnic wyników i bez porad medycznych.

Odpowiedz wyłącznie obiektem JSON, bez komentarza i bez bloku kodu:
{"template": "...", "volume_pct": 0, "ramp_pct": 0, "block_weeks": 3, "key_sessions": 0, "long_day": null, "key_days": null, "test_every_blocks": 2, "why": {"template": "...", "volume": "...", "ramp": "...", "blocks": "...", "keys": "...", "days": "..."}}`

export function tunePrompt(req: TuneRequest): string {
  const lines = [
    `WEJŚCIE (z onboardingu):\n${JSON.stringify(req.inputs)}`,
    `SZABLONY (dozwolone dla tego zawodnika):\n${req.templates.map((t) => `- ${t.id}: ${t.name} – ${t.summary} (${t.intensity})`).join('\n')}`,
    `GRANICE:\n${JSON.stringify(req.bounds)}`,
  ]
  if (req.note) lines.push(`NOTATKA ZAWODNIKA:\n${req.note.slice(0, 300)}`)
  return lines.join('\n\n')
}

/** Pierwszy obiekt JSON z odpowiedzi modelu (model czasem dokleja tekst albo blok ```json). */
export function parseTuneReply(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Kształt prośby z aplikacji – serwer przyjmuje tylko to, czego potrzebuje prompt (limit rozmiaru). */
export function sanitizeTuneRequest(raw: unknown): TuneRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!r.inputs || typeof r.inputs !== 'object' || !Array.isArray(r.templates) || !r.bounds || typeof r.bounds !== 'object') return null
  const templates = (r.templates as unknown[])
    .filter((t): t is TuneTemplate => !!t && typeof t === 'object' && typeof (t as TuneTemplate).id === 'string')
    .slice(0, 12)
    .map((t) => ({ id: t.id.slice(0, 40), name: String(t.name ?? '').slice(0, 80), summary: String(t.summary ?? '').slice(0, 300), intensity: String(t.intensity ?? '').slice(0, 120) }))
  const req: TuneRequest = { inputs: r.inputs as Record<string, unknown>, templates, bounds: r.bounds as Record<string, unknown>, note: typeof r.note === 'string' ? r.note.slice(0, 300) : null }
  return JSON.stringify(req).length <= 12_000 && templates.length ? req : null
}
