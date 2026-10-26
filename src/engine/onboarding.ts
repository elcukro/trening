import { z } from 'zod'
import { WEEKDAYS, diffDays, type ISODate, type Weekday } from './dates'
import { intlLocale, t as msg } from '@/i18n'

/**
 * Onboarding (docs/31, etapy 1–2 z docs/30): kim jest zawodnik i jaki ma cel – w formie gotowej dla przyszłego
 * generatora planów. Czysty TS bez UI: schemat Zod, kolejność kroków, walidacja kroku, przesiew zdrowotny,
 * ostrzeżenia spójności i `planInputs` (to, co generator dostanie na wejściu).
 *
 * Zasada jak w całym projekcie: kod liczy, model opowiada. Dane są ustrukturyzowane (wybory z list, liczby
 * z zakresów), żeby generator nie musiał niczego zgadywać z tekstu.
 */

export const ONBOARDING_ID = 'v1'
export const ONBOARDING_SCHEMA_VERSION = 1
/** Wersja treści zgody na dane o zdrowiu – zmiana tekstu = nowa wersja i ponowna zgoda. */
export const CONSENT_VERSION = '2026-10-26'

const weekday = z.enum(WEEKDAYS)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const unique = <T>(a: readonly T[]) => new Set(a).size === a.length

export const DISCIPLINES = ['road', 'gravel', 'mtb'] as const
export type Discipline = (typeof DISCIPLINES)[number]
export const FIXED_KINDS = ['group_ride', 'commute', 'race', 'other'] as const
export const YEARS = ['lt1', '1to3', '3to5', '5to10', '10plus'] as const
export const MEASURE_LEVELS = ['power', 'hr', 'rpe'] as const
export type MeasureLevel = (typeof MEASURE_LEVELS)[number]
export const TRAINERS = ['none', 'smart', 'classic', 'rollers'] as const
export const DEVICES = ['wahoo', 'garmin', 'hammerhead', 'coros', 'polar', 'suunto', 'apple', 'phone'] as const
export const GOAL_TYPES = ['event', 'ftp', 'speed', 'weight', 'fitness', 'comeback'] as const
export type GoalType = (typeof GOAL_TYPES)[number]
export const HEALTH_QUESTIONS = ['heart', 'chest_pain', 'dizziness', 'supervised', 'chronic', 'meds', 'injury'] as const
export type HealthQuestion = (typeof HEALTH_QUESTIONS)[number]

/* ------------------------------------------------------------------ sekcje */

/** Czas: najmocniej zmienia plan (docs/30, etap 1 pkt 1). Limity w minutach na jedną jazdę; 0 = w te dni nie jeżdżę. */
export const timeSchema = z.object({
  hours_per_week: z.number().min(1).max(30),
  days: z.array(weekday).min(1).max(7).refine(unique, 'dni się powtarzają'),
  weekday_max_min: z.number().int().min(0).max(480),
  weekend_max_min: z.number().int().min(0).max(720),
  /** stałe punkty tygodnia, np. sobotnia jazda z grupą – generator ich nie przesuwa */
  fixed: z
    .array(z.object({ day: weekday, kind: z.enum(FIXED_KINDS) }))
    .max(7)
    .refine((a) => unique(a.map((f) => f.day)), 'jeden stały punkt na dzień')
    .default([]),
})

/** Gdzie jest teraz: punkt startu objętości i doświadczenie. */
export const currentSchema = z.object({
  /** średnio godzin tygodniowo w ostatnich 4 tygodniach */
  hours_4w: z.number().min(0).max(30),
  longest_ride_min: z.number().int().min(0).max(900),
  years: z.enum(YEARS),
})

/** Poziom pomiaru (docs/30 § 3) decyduje o języku planu; progi opcjonalne – kalibracja i tak je sprawdzi. */
export const measureSchema = z.object({
  level: z.enum(MEASURE_LEVELS),
  ftp_w: z.number().int().min(80).max(500).nullable().default(null),
  lthr_bpm: z.number().int().min(100).max(210).nullable().default(null),
  hr_max_bpm: z.number().int().min(120).max(230).nullable().default(null),
})

export const gearSchema = z.object({
  disciplines: z.array(z.enum(DISCIPLINES)).min(1).refine(unique),
  bikes: z.array(z.enum(DISCIPLINES)).min(1).refine(unique),
  trainer: z.enum(TRAINERS),
  /** komputer albo zegarek – do wyboru integracji; pusta lista = bez urządzenia */
  devices: z.array(z.enum(DEVICES)).refine(unique).default([]),
})

/** Ciało (do budżetu kcal) – wszystko opcjonalne. */
export const bodySchema = z.object({
  height_cm: z.number().int().min(120).max(230).nullable().default(null),
  weight_kg: z.number().min(35).max(200).nullable().default(null),
  birth_date: isoDate.nullable().default(null),
  sex: z.enum(['female', 'male']).nullable().default(null),
})

/** Pytania przesiewowe (na wzór PAR-Q) – odpowiedź na każde jest wymagana. */
export const healthSchema = z.object(Object.fromEntries(HEALTH_QUESTIONS.map((q) => [q, z.boolean()])) as Record<HealthQuestion, z.ZodBoolean>)
export type HealthAnswers = z.infer<typeof healthSchema>

/** Wyraźna zgoda na przetwarzanie danych o zdrowiu (art. 9 ust. 2 lit. a RODO, docs/29 § 1). */
export const consentSchema = z.object({
  health_data: z.literal(true),
  at: z.string().min(10),
  version: z.string().min(1),
})

/** Cel z mierzalnym kryterium (docs/30, etap 2). Data opcjonalna tam, gdzie cel nie ma naturalnego terminu. */
export const goalSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('event'),
    date: isoDate,
    name: z.string().trim().max(80).nullable().default(null),
    discipline: z.enum(DISCIPLINES),
    distance_km: z.number().int().min(10).max(2000),
    elevation_m: z.number().int().min(0).max(40000),
    /** null = ukończyć; liczba = docelowy czas w minutach */
    target_time_min: z.number().int().min(30).max(6000).nullable().default(null),
  }),
  z.object({ type: z.literal('ftp'), target_w: z.number().int().min(100).max(500), date: isoDate.nullable().default(null) }),
  z.object({ type: z.literal('speed'), kmh: z.number().min(15).max(45), hours: z.number().min(0.5).max(8), date: isoDate.nullable().default(null) }),
  z.object({ type: z.literal('weight'), target_kg: z.number().min(40).max(160), date: isoDate }),
  z.object({ type: z.literal('fitness'), weekly_hours: z.number().min(1).max(30), weeks: z.number().int().min(4).max(52), date: isoDate.nullable().default(null) }),
  z.object({
    type: z.literal('comeback'),
    weeks_off: z.number().int().min(1).max(520),
    reason: z.enum(['illness', 'injury', 'life', 'other']),
    weekly_hours: z.number().min(1).max(30),
    date: isoDate.nullable().default(null),
  }),
])
export type Goal = z.infer<typeof goalSchema>

export const athleteProfileSchema = z.object({
  version: z.literal(ONBOARDING_SCHEMA_VERSION),
  time: timeSchema,
  current: currentSchema,
  measure: measureSchema,
  gear: gearSchema,
  consent: consentSchema,
  body: bodySchema.default({ height_cm: null, weight_kg: null, birth_date: null, sex: null }),
  health: healthSchema,
  goal: goalSchema,
})
export type AthleteProfile = z.infer<typeof athleteProfileSchema>

/** Szkic w trakcie wypełniania: każde pole może jeszcze nie istnieć. */
export type Draft = {
  [K in Exclude<keyof AthleteProfile, 'version' | 'goal'>]?: Partial<AthleteProfile[K]>
} & { goal?: Partial<Goal> & { type?: GoalType } }

/* ------------------------------------------------------------------ kroki */

/**
 * Kolejność kroków: czas, forma, pomiar, sprzęt (bez wrażliwych danych), potem zgoda – przed ciałem i zdrowiem –
 * i na końcu cel. Podsumowanie (`summary`) nie liczy się do „krok n z N”.
 */
export const STEPS = ['time', 'time_detail', 'current', 'measure', 'gear', 'consent', 'body', 'health', 'goal', 'goal_detail'] as const
export type Step = (typeof STEPS)[number]
export type StepOrSummary = Step | 'summary'

/** Kroki, które można pominąć w całości (same pola opcjonalne). */
export const SKIPPABLE: readonly Step[] = ['body']

const STEP_CHECK: Record<Step, z.ZodType> = {
  time: z.object({ time: timeSchema.pick({ hours_per_week: true, days: true }) }),
  time_detail: z.object({ time: timeSchema.pick({ weekday_max_min: true, weekend_max_min: true, fixed: true }) }),
  current: z.object({ current: currentSchema }),
  measure: z.object({ measure: measureSchema }),
  gear: z.object({ gear: gearSchema }),
  consent: z.object({ consent: consentSchema }),
  body: z.object({ body: bodySchema.optional() }),
  health: z.object({ health: healthSchema }),
  goal: z.object({ goal: z.object({ type: z.enum(GOAL_TYPES) }) }),
  goal_detail: z.object({ goal: goalSchema }),
}

export function stepValid(step: Step, draft: Draft): boolean {
  if (step === 'time_detail' && !detailConsistent(draft)) return false
  return STEP_CHECK[step].safeParse(draft).success
}

/** Limit w dzień roboczy/weekend potrzebny tylko wtedy, gdy zawodnik w takie dni jeździ; stałe punkty – w dni dostępne. */
function detailConsistent(d: Draft): boolean {
  const days = d.time?.days ?? []
  const hasWeekday = days.some((x) => !isWeekend(x))
  const hasWeekend = days.some(isWeekend)
  if (hasWeekday && !d.time?.weekday_max_min) return false
  if (hasWeekend && !d.time?.weekend_max_min) return false
  return (d.time?.fixed ?? []).every((f) => days.includes(f.day))
}

export const isWeekend = (d: Weekday) => d === 'sat' || d === 'sun'

export function stepNumber(step: Step): number {
  return STEPS.indexOf(step) + 1
}

export function nextStep(step: Step): StepOrSummary {
  return STEPS[STEPS.indexOf(step) + 1] ?? 'summary'
}

export function prevStep(step: StepOrSummary): Step | null {
  if (step === 'summary') return STEPS[STEPS.length - 1]!
  return STEPS[STEPS.indexOf(step) - 1] ?? null
}

/** Pierwszy niewypełniony krok – od niego wznawiamy po powrocie. */
export function firstIncomplete(draft: Draft): StepOrSummary {
  return STEPS.find((s) => !stepValid(s, draft)) ?? 'summary'
}

/** Zmiana typu celu czyści pola poprzedniego typu (inne kryterium, inna data). */
export function withGoalType(draft: Draft, type: GoalType): Draft {
  if (draft.goal?.type === type) return draft
  return { ...draft, goal: { type } }
}

/** Dni spoza listy dostępnych wypadają ze stałych punktów. */
export function withDays(draft: Draft, days: Weekday[]): Draft {
  const sorted = WEEKDAYS.filter((d) => days.includes(d))
  return { ...draft, time: { ...draft.time, days: sorted, fixed: (draft.time?.fixed ?? []).filter((f) => sorted.includes(f.day)) } }
}

/** Pełny profil ze szkicu albo lista błędów (ścieżki Zod) – zapis końcowy przechodzi tylko przez to. */
export function finalize(draft: Draft): { ok: true; profile: AthleteProfile } | { ok: false; issues: string[] } {
  const r = athleteProfileSchema.safeParse({ ...draft, version: ONBOARDING_SCHEMA_VERSION })
  if (r.success) return { ok: true, profile: r.data }
  return { ok: false, issues: r.error.issues.map((i) => i.path.join('.') || i.message) }
}

/* ------------------------------------------------------------------ zdrowie */

/**
 * Przesiew (docs/30 § 5 pkt 6 – granica do potwierdzenia z prawnikiem): objawy sercowe, ból w klatce, omdlenia
 * i zalecenie nadzoru lekarskiego blokują plan intensywny („najpierw lekarz”); choroba przewlekła, leki i świeża
 * kontuzja tylko ostrzegają (plan zachowawczy, bez testów maksymalnych do czasu konsultacji).
 */
const RED: readonly HealthQuestion[] = ['heart', 'chest_pain', 'dizziness', 'supervised']
const YELLOW: readonly HealthQuestion[] = ['chronic', 'meds', 'injury']

export type HealthLevel = 'ok' | 'caution' | 'doctor'

export function healthScreen(a: Partial<HealthAnswers> | undefined): { level: HealthLevel; flags: HealthQuestion[] } {
  const red = RED.filter((q) => a?.[q] === true)
  if (red.length) return { level: 'doctor', flags: red }
  const yellow = YELLOW.filter((q) => a?.[q] === true)
  return { level: yellow.length ? 'caution' : 'ok', flags: yellow }
}

/* ------------------------------------------------------------------ spójność */

export type Check = { id: string; level: 'info' | 'warn'; text: string }

/** 6,5 – liczba w języku zawodnika (przecinek / kropka) */
const fmtH = (h: number) => (Math.round(h * 10) / 10).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })

/**
 * Ostrzeżenia spójności liczone kodem (model może je potem opowiedzieć). Nie blokują zapisu – podsumowanie
 * pokazuje je przy sekcji, której dotyczą.
 */
export function checks(d: Draft, today: ISODate): Check[] {
  const out: Check[] = []
  const L = msg().onboarding.checks
  const t = d.time
  if (t?.days?.length && t.hours_per_week) {
    const cap = t.days.reduce((s, x) => s + ((isWeekend(x) ? t.weekend_max_min : t.weekday_max_min) ?? 0), 0) / 60
    if (cap > 0 && cap < t.hours_per_week) out.push({ id: 'time_cap', level: 'warn', text: L.timeCap(fmtH(cap), fmtH(t.hours_per_week)) })
  }
  const now = d.current?.hours_4w
  if (t?.hours_per_week && now != null && t.hours_per_week > Math.max(now * 1.5, now + 2)) {
    out.push({ id: 'ramp', level: 'info', text: L.ramp(fmtH(now), fmtH(t.hours_per_week)) })
  }
  const g = d.goal
  const date = g && 'date' in g ? g.date : null
  if (date) {
    const days = diffDays(date, today)
    if (days < 0) out.push({ id: 'goal_past', level: 'warn', text: L.goalPast })
    else if (days < 28) out.push({ id: 'goal_soon', level: 'warn', text: L.goalSoon })
  }
  if (g?.type === 'weight' && g.target_kg && g.date && d.body?.weight_kg) {
    const weeks = Math.max(diffDays(g.date, today) / 7, 0.1)
    const rate = (d.body.weight_kg - g.target_kg) / weeks
    // ok. 0,7 % masy tygodniowo to rozsądna górna granica przy rosnącym obciążeniu (docs/13 § 29.09.2026)
    if (rate > d.body.weight_kg * 0.007) out.push({ id: 'weight_rate', level: 'warn', text: L.weightRate(fmtH(rate), fmtH(d.body.weight_kg * 0.007)) })
    if (g.target_kg >= d.body.weight_kg) out.push({ id: 'weight_up', level: 'info', text: L.weightUp })
  }
  if (d.measure?.level === 'power' && d.gear && !(d.gear.devices?.length)) {
    out.push({ id: 'power_no_device', level: 'info', text: L.powerNoDevice })
  }
  if (healthScreen(d.health).level === 'doctor') out.push({ id: 'health_doctor', level: 'warn', text: L.healthDoctor })
  return out
}

/* ------------------------------------------------------------------ wejście generatora */

export type Experience = 'novice' | 'intermediate' | 'experienced'

/** Wejście przyszłego generatora planów (docs/29 § 1) – wyłącznie liczby i wybory, bez tekstu do interpretacji. */
export interface PlanInputs {
  /** godziny docelowe ograniczone limitem dni */
  weekly_hours: number
  /** od czego zacząć: obecna objętość z zapasem 10 %, nie więcej niż docelowa */
  start_weekly_hours: number
  /** minuty dostępne w każdy dzień tygodnia (0 = wolne) */
  day_caps_min: Record<Weekday, number>
  fixed: AthleteProfile['time']['fixed']
  measure: MeasureLevel
  ftp_w: number | null
  lthr_bpm: number | null
  discipline: Discipline
  indoor: boolean
  experience: Experience
  intensity_allowed: boolean
  cautious: boolean
  goal: Goal
  /** pełne tygodnie do daty celu; null = cel bez daty (generator przyjmie horyzont kroczący) */
  weeks_to_goal: number | null
}

export function experienceOf(p: Pick<AthleteProfile, 'current'>): Experience {
  const { years, hours_4w, longest_ride_min } = p.current
  if (years === 'lt1' || (hours_4w < 3 && longest_ride_min < 90)) return 'novice'
  if ((years === '5to10' || years === '10plus') && hours_4w >= 6) return 'experienced'
  return 'intermediate'
}

export function planInputs(p: AthleteProfile, today: ISODate): PlanInputs {
  const day_caps_min = Object.fromEntries(WEEKDAYS.map((d) => [d, p.time.days.includes(d) ? (isWeekend(d) ? p.time.weekend_max_min : p.time.weekday_max_min) : 0])) as Record<Weekday, number>
  const cap = Object.values(day_caps_min).reduce((s, x) => s + x, 0) / 60
  const weekly = Math.min(p.time.hours_per_week, cap)
  const start = Math.min(weekly, Math.max(1, Math.round(p.current.hours_4w * 1.1 * 2) / 2))
  const health = healthScreen(p.health)
  const date = 'date' in p.goal ? p.goal.date : null
  return {
    weekly_hours: weekly,
    start_weekly_hours: start,
    day_caps_min,
    fixed: p.time.fixed,
    measure: p.measure.level,
    ftp_w: p.measure.ftp_w,
    lthr_bpm: p.measure.lthr_bpm,
    discipline: p.goal.type === 'event' ? p.goal.discipline : p.gear.disciplines[0]!,
    indoor: p.gear.trainer !== 'none',
    experience: experienceOf(p),
    intensity_allowed: health.level !== 'doctor',
    cautious: health.level !== 'ok' || p.goal.type === 'comeback',
    goal: p.goal,
    weeks_to_goal: date ? Math.max(0, Math.floor(diffDays(date, today) / 7)) : null,
  }
}
