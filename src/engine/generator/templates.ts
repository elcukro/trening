import { z } from 'zod'
import { DISCIPLINES, GOAL_TYPES } from '../onboarding'
import { getLang } from '../../i18n/core'
import plansJson from '../../../data/templates/plan_templates.json'
import workoutsJson from '../../../data/templates/workouts.json'

/**
 * Biblioteka szablonów (docs/33 § 8.1): treść w `data/templates/`, tu tylko schemat i walidacja przy imporcie.
 * Rodziny akcentów (`workouts.json`) to drabinki szczebli; szablony planu (`plan_templates.json`) mówią, która rodzina
 * jest pierwszym i drugim akcentem w każdej fazie i jak dzielić środek planu na fazy.
 */

export const LADDER_IDS = ['sweet_spot', 'threshold', 'vo2max', 'tempo', 'over_under', 'vo2_short', 'climb'] as const
export type LadderId = (typeof LADDER_IDS)[number]

const rung = z.tuple([z.string().regex(/^(SS_|THR_|VO2_|TEMPO_)/), z.number().int().min(1), z.number().min(1), z.number().min(1)])

const familySchema = z.object({
  label: z.string(),
  kind: z.enum(['intervals', 'over_under', 'sets']),
  category: z.string(),
  zone: z.enum(['Z3', 'SS', 'THR', 'Z5b']),
  zone_over: z.enum(['THR', 'Z5b']).optional(),
  cadence: z.tuple([z.number(), z.number()]),
  warmup_min: z.number().int(),
  description: z.string(),
  rungs: z.array(rung).min(1),
  /** wersja angielska (docs/34) – `familyText` wybiera wg języka */
  en: z.object({ label: z.string(), description: z.string() }).optional(),
})
export type WorkoutFamily = z.infer<typeof familySchema>

const workoutsSchema = z.object({
  version: z.number(),
  families: z.record(z.enum(LADDER_IDS), familySchema).refine((f) => LADDER_IDS.every((id) => id in f), 'brak rodziny akcentów'),
})

const pair = z.tuple([z.enum(LADDER_IDS), z.enum(LADDER_IDS)])
const EXPERIENCE = ['novice', 'intermediate', 'experienced'] as const

export const TEMPLATE_IDS = ['pyramidal', 'polarized', 'time_crunched', 'climbing', 'gravel_endurance', 'mtb_xc', 'comeback'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

const templateSchema = z.object({
  id: z.enum(TEMPLATE_IDS),
  name: z.string(),
  summary: z.string(),
  intensity: z.string(),
  /** wersja angielska (docs/34) – `templateText` wybiera wg języka */
  en: z.object({ name: z.string(), summary: z.string(), intensity: z.string() }).optional(),
  disciplines: z.array(z.enum(DISCIPLINES)).min(1),
  goals: z.array(z.enum(GOAL_TYPES)).min(1),
  min_experience: z.enum(EXPERIENCE),
  max_hours: z.number().nullable(),
  /** granice faz jako ułamek środka planu: [koniec bazy, koniec budowy] */
  phase_split: z.tuple([z.number().min(0.2).max(0.8), z.number().min(0.4).max(0.95)]).refine(([a, b]) => a < b),
  ladders: z.object({
    base: pair,
    build: pair,
    specific: z.object({ ftp: pair, speed: pair, event: pair, event_hilly: pair, other: pair }),
  }),
})
export type PlanTemplate = z.infer<typeof templateSchema>

const plansSchema = z.object({ version: z.number(), templates: z.array(templateSchema) }).refine((p) => TEMPLATE_IDS.every((id) => p.templates.some((t) => t.id === id)), 'brak szablonu')

export const WORKOUT_FAMILIES = workoutsSchema.parse(workoutsJson).families as Record<LadderId, WorkoutFamily>
export const PLAN_TEMPLATES: readonly PlanTemplate[] = plansSchema.parse(plansJson).templates

/** Nazwa i opisy szablonu w bieżącym języku (prompt AI dostaje zawsze polskie z `PLAN_TEMPLATES`). */
export function templateText(t: PlanTemplate): { name: string; summary: string; intensity: string } {
  return getLang() === 'en' && t.en ? t.en : t
}

/** Nazwa i opis rodziny akcentów w bieżącym języku. */
export function familyText(f: WorkoutFamily): { label: string; description: string } {
  return getLang() === 'en' && f.en ? f.en : f
}

export function templateById(id: TemplateId): PlanTemplate {
  return PLAN_TEMPLATES.find((t) => t.id === id)!
}

const EXP_RANK = { novice: 0, intermediate: 1, experienced: 2 } as const

/**
 * Szablony dozwolone dla zawodnika (granice kodu, nie modelu): dyscyplina i cel z listy szablonu, doświadczenie
 * co najmniej minimalne, godziny nie większe niż limit szablonu. Ostrożny albo z czerwoną flagą – tylko łagodne.
 */
export function allowedTemplates(inp: { discipline: (typeof DISCIPLINES)[number]; goal: { type: (typeof GOAL_TYPES)[number] }; experience: (typeof EXPERIENCE)[number]; weekly_hours: number; cautious: boolean; intensity_allowed: boolean }): PlanTemplate[] {
  if (!inp.intensity_allowed || inp.cautious) return PLAN_TEMPLATES.filter((t) => t.id === 'comeback' || t.id === 'pyramidal')
  return PLAN_TEMPLATES.filter((t) => t.disciplines.includes(inp.discipline) && t.goals.includes(inp.goal.type) && EXP_RANK[inp.experience] >= EXP_RANK[t.min_experience] && (t.max_hours == null || inp.weekly_hours <= t.max_hours))
}
