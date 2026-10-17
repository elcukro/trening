import { supabase } from './supabase'

export interface ParsedCheckin {
  weight_kg: number | null
  resting_hr: number | null
  sleep: number | null
  legs: number | null
  motivation: number | null
  sick: boolean | null
  notes: string | null
}

/** Check-in jednym zdaniem: tekst → pola (Edge Function `checkin-parse`); null bez konfiguracji Supabase. */
export async function parseCheckinText(text: string, hint: { last_weight_kg?: number | null; last_resting_hr?: number | null }): Promise<{ fields: ParsedCheckin; empty: boolean }> {
  if (!supabase) throw new Error('Bez konta rozpoznawanie nie działa')
  const { data, error } = await supabase.functions.invoke<{ fields: ParsedCheckin; empty: boolean; error?: string }>('checkin-parse', { body: { text, hint } })
  if (error) throw new Error(error.message)
  if (!data || data.error) throw new Error(data?.error ?? 'brak odpowiedzi')
  return { fields: data.fields, empty: data.empty }
}

export const canParseCheckin = !!supabase
