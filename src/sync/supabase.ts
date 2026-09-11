import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

/**
 * Klient Supabase albo `null`, gdy brak konfiguracji (aplikacja działa wtedy tylko lokalnie).
 * Flow `implicit`: link z maila loguje w każdej przeglądarce, w której się otworzy (PKCE wymagałby tego samego
 * kontekstu, a PWA na iOS ma osobną pamięć niż Safari). Dla PWA jest dodatkowo wklejanie linku (verifyOtp z token_hash).
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } }) : null

export const isSupabaseConfigured = supabase !== null
