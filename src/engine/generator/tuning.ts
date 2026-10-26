import { z } from 'zod'
import { WEEKDAYS, type Weekday } from '../dates'
import type { PlanInputs } from '../onboarding'
import { allowedTemplates, templateById, templateText, TEMPLATE_IDS, type TemplateId } from './templates'
import { t as tr } from '../../i18n'
import { WEEKDAY_LONG } from '../../lib/labels'

/**
 * Dopasowanie planu (docs/33 § 8.2): model wybiera szablon i stroi parametry generatora, kod pilnuje granic.
 * `defaultTuning` daje dokładnie plan sprzed szablonów (test), `clampTuning` przyjmuje cokolwiek (odpowiedź modelu,
 * wybór zawodnika) i zwraca poprawny zestaw z listą poprawek. Generator nie dostaje nic, co nie przeszło przez clamp.
 */

const weekday = z.enum(WEEKDAYS)
const why = z.string().max(400)

export const planTuningSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  /** % dostępnych godzin tygodnia (granica: nigdy ponad dostępny czas) */
  volume_pct: z.number().int().min(70).max(100),
  /** wzrost objętości tydzień do tygodnia w % */
  ramp_pct: z.number().int().min(3).max(10),
  block_weeks: z.union([z.literal(3), z.literal(4)]),
  key_sessions: z.number().int().min(0).max(2),
  long_day: weekday.nullable(),
  key_days: z.array(weekday).max(2).nullable(),
  /** test co ile bloków */
  test_every_blocks: z.number().int().min(1).max(3),
  why: z.object({ template: why, volume: why, ramp: why, blocks: why, keys: why, days: why }),
})
export type PlanTuning = z.infer<typeof planTuningSchema>
export type TuningKey = keyof PlanTuning['why']

export const WHY_MAX = 180

/** Najwięcej akcentów, na które pozwala kod (dni, zdrowie, doświadczenie, godziny) – jak przed szablonami. */
export function maxKeySessions(inp: PlanInputs): number {
  if (!inp.intensity_allowed) return 0
  const days = WEEKDAYS.filter((d) => inp.day_caps_min[d] > 0 && !inp.fixed.some((f) => f.day === d && f.kind === 'commute'))
  if (days.length <= 2) return days.length === 2 ? 1 : 0
  if (inp.cautious || inp.experience === 'novice' || inp.weekly_hours < 4) return 1
  return inp.weekly_hours >= 6 && days.length >= 4 ? 2 : 1
}

const gentle = (inp: PlanInputs) => inp.experience === 'novice' || inp.cautious

/** Granice, które dostaje też model (w promptcie) – te same liczby co w `clampTuning`. */
export function tuningBounds(inp: PlanInputs) {
  return {
    templates: allowedTemplates(inp).map((t) => t.id),
    volume_pct: [70, 100] as const,
    ramp_pct: [3, gentle(inp) ? 7 : 10] as const,
    block_weeks: gentle(inp) ? [3] : [3, 4],
    key_sessions: [0, maxKeySessions(inp)] as const,
    days: WEEKDAYS.filter((d) => inp.day_caps_min[d] > 0 && !inp.fixed.some((f) => f.day === d && f.kind === 'commute')),
    test_every_blocks: [1, 3] as const,
  }
}

/** Uzasadnienia z reguł – gdy model milczy, zmyśla liczby albo zawodnik sam zmienił parametr. Teksty w bieżącym języku (docs/34). */
export function ruleWhy(inp: PlanInputs, t: Omit<PlanTuning, 'why'>): PlanTuning['why'] {
  const tpl = templateText(templateById(t.template))
  const h = Math.round(inp.weekly_hours * t.volume_pct) / 100
  const W = tr().engine.generator.why
  const day = (d: Weekday) => (WEEKDAY_LONG[d] ?? d).toLowerCase()
  return {
    template: `${tpl.name}: ${tpl.summary}`,
    volume: t.volume_pct === 100 ? W.volumeAll(h) : W.volumePart(t.volume_pct, h),
    ramp: W.ramp(t.ramp_pct, gentle(inp)),
    blocks: W.blocks(t.block_weeks, t.test_every_blocks),
    keys: t.key_sessions === 0 ? W.keys0 : t.key_sessions === 1 ? W.keys1 : W.keys2,
    days: t.long_day ? W.days(day(t.long_day), (t.key_days ?? []).map(day)) : W.daysAuto,
  }
}

/** Domyślny zestaw = generator sprzed szablonów, bit w bit (test `generator.test.ts`). */
export function defaultTuning(inp: PlanInputs): PlanTuning {
  const base = {
    template: 'pyramidal' as TemplateId,
    volume_pct: 100,
    ramp_pct: gentle(inp) ? 7 : 10,
    block_weeks: (gentle(inp) ? 3 : 4) as 3 | 4,
    key_sessions: maxKeySessions(inp),
    long_day: null,
    key_days: null,
    test_every_blocks: 2,
  }
  return { ...base, why: ruleWhy(inp, base) }
}

const adjacent = (a: Weekday, b: Weekday) => {
  const d = Math.abs(WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
  return d === 1 || d === 6
}
const nextDay = (d: Weekday) => WEEKDAYS[(WEEKDAYS.indexOf(d) + 1) % 7]!

/** Liczby w tekście muszą być w parametrach albo w wejściu (jak `numbersOk` notatek) – inaczej tekst z reguł. */
function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'))
}
function allowedNumbers(inp: PlanInputs, t: Omit<PlanTuning, 'why'>): Set<string> {
  const out = new Set<string>()
  const add = (v: number | null | undefined) => {
    if (v == null || !Number.isFinite(v)) return
    out.add(String(v))
    out.add(String(Math.round(v)))
    out.add(String(Math.round(v * 10) / 10))
  }
  for (const v of [t.volume_pct, t.ramp_pct, t.block_weeks, t.key_sessions, t.test_every_blocks, inp.weekly_hours, inp.start_weekly_hours, inp.weeks_to_goal, inp.ftp_w, inp.lthr_bpm, (inp.weekly_hours * t.volume_pct) / 100, 80, 85]) add(v)
  for (const m of Object.values(inp.day_caps_min)) add(m)
  const g = inp.goal as Record<string, unknown>
  for (const k of ['kmh', 'hours', 'distance_km', 'elevation_m', 'watts', 'weeks', 'weeks_off', 'kg']) add(typeof g[k] === 'number' ? (g[k] as number) : null)
  return out
}

export interface ClampResult {
  tuning: PlanTuning
  /** co kod poprawił w propozycji (dla dziennika i dla zawodnika przy jego własnej zmianie) */
  adjustments: string[]
}

const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback)

/** Dowolna propozycja → poprawny zestaw w granicach kodu. Brak pola = wartość domyślna. */
export function clampTuning(inp: PlanInputs, raw: unknown): ClampResult {
  const d = defaultTuning(inp)
  const b = tuningBounds(inp)
  const adj: string[] = []
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const clamp = (key: string, v: number, lo: number, hi: number) => {
    const c = Math.min(hi, Math.max(lo, v))
    if (c !== v) adj.push(`${key}: ${v} → ${c}`)
    return c
  }

  let template = (TEMPLATE_IDS as readonly string[]).includes(r.template as string) ? (r.template as TemplateId) : d.template
  if (!b.templates.includes(template)) {
    adj.push(`template: ${template} niedozwolony → ${b.templates.includes('pyramidal') ? 'pyramidal' : b.templates[0]}`)
    template = b.templates.includes('pyramidal') ? 'pyramidal' : (b.templates[0] ?? 'pyramidal')
  }
  const volume_pct = clamp('volume_pct', int(r.volume_pct, d.volume_pct), b.volume_pct[0], b.volume_pct[1])
  const ramp_pct = clamp('ramp_pct', int(r.ramp_pct, d.ramp_pct), b.ramp_pct[0], b.ramp_pct[1])
  let block_weeks = int(r.block_weeks, d.block_weeks) as 3 | 4
  if (!b.block_weeks.includes(block_weeks)) {
    adj.push(`block_weeks: ${block_weeks} → ${b.block_weeks[0]}`)
    block_weeks = b.block_weeks[0] as 3 | 4
  }
  const key_sessions = clamp('key_sessions', int(r.key_sessions, d.key_sessions), b.key_sessions[0], b.key_sessions[1])
  const test_every_blocks = clamp('test_every_blocks', int(r.test_every_blocks, d.test_every_blocks), b.test_every_blocks[0], b.test_every_blocks[1])

  // dni: tylko dostępne, bez dojazdów; akcenty nigdy obok siebie i nigdy dzień po długiej
  const long_day = typeof r.long_day === 'string' && (b.days as string[]).includes(r.long_day) ? (r.long_day as Weekday) : null
  if (r.long_day != null && !long_day) adj.push(`long_day: ${String(r.long_day)} niedostępny → generator`)
  let key_days: Weekday[] | null = null
  if (Array.isArray(r.key_days) && r.key_days.length) {
    const want = [...new Set(r.key_days.filter((x): x is Weekday => typeof x === 'string' && (b.days as string[]).includes(x)))]
    const ok = key_sessions > 0 && want.length === key_sessions && want.every((k) => k !== long_day && (!long_day || nextDay(long_day) !== k)) && !(want.length === 2 && adjacent(want[0]!, want[1]!))
    if (ok) key_days = want
    else adj.push(`key_days: ${JSON.stringify(r.key_days)} łamie zasady → generator`)
  }
  if (key_days && !long_day) {
    adj.push('key_days bez long_day → generator')
    key_days = null
  }

  const base = { template, volume_pct, ramp_pct, block_weeks, key_sessions, long_day, key_days, test_every_blocks }
  const rules = ruleWhy(inp, base)
  const nums = allowedNumbers(inp, base)
  const rw = (r.why && typeof r.why === 'object' ? r.why : {}) as Record<string, unknown>
  const whyOut = {} as PlanTuning['why']
  for (const k of Object.keys(rules) as TuningKey[]) {
    const text = typeof rw[k] === 'string' ? (rw[k] as string).trim() : ''
    const bad = !text || text.length > WHY_MAX || numbersIn(text).some((n) => !nums.has(n))
    whyOut[k] = bad ? rules[k] : text
  }
  return { tuning: { ...base, why: whyOut }, adjustments: adj }
}

/** Czy zestaw jest domyślnym (plan identyczny jak bez dopasowania). */
export function isDefaultTuning(inp: PlanInputs, t: PlanTuning | null | undefined): boolean {
  if (!t) return true
  const d = defaultTuning(inp)
  return t.template === d.template && t.volume_pct === d.volume_pct && t.ramp_pct === d.ramp_pct && t.block_weeks === d.block_weeks && t.key_sessions === d.key_sessions && t.long_day == null && t.key_days == null && t.test_every_blocks === d.test_every_blocks
}
