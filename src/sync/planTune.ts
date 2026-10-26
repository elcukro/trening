import { supabase } from './supabase'
import { allowedTemplates, clampTuning, defaultTuning, tuningBounds, type PlanTuning } from '@/engine/generator'
import type { PlanInputs } from '@/engine/onboarding'

/**
 * Dopasowanie planu przez AI po onboardingu (docs/33 § 8.2). Do modelu idą wyłącznie wejścia generatora z odpowiedzi
 * onboardingu (flagi zdrowia zamiast odpowiedzi), dozwolone szablony i granice – nic ze Stravy. Odpowiedź modelu
 * przechodzi przez `clampTuning`; bez sieci, konta albo przy błędzie zostaje dopasowanie z reguł.
 */
export interface TuneResult {
  tuning: PlanTuning
  source: 'ai' | 'rules'
  adjustments: string[]
  detail?: string
}

export async function requestTuning(inputs: PlanInputs, note?: string | null): Promise<TuneResult> {
  const rules: TuneResult = { tuning: defaultTuning(inputs), source: 'rules', adjustments: [] }
  if (!supabase) return { ...rules, detail: 'bez konta' }
  try {
    const templates = allowedTemplates(inputs).map((t) => ({ id: t.id, name: t.name, summary: t.summary, intensity: t.intensity }))
    const { data, error } = await supabase.functions.invoke<{ tuning?: unknown; error?: string }>('plan-tune', { body: { inputs, templates, bounds: tuningBounds(inputs), note: note ?? null } })
    if (error || !data?.tuning) return { ...rules, detail: data?.error ?? error?.message ?? 'brak odpowiedzi' }
    const { tuning, adjustments } = clampTuning(inputs, data.tuning)
    return { tuning, source: 'ai', adjustments }
  } catch (e) {
    return { ...rules, detail: e instanceof Error ? e.message : String(e) }
  }
}
