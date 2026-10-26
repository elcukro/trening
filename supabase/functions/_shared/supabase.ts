import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { env } from './env.ts'
import { isLang, langOf, type Lang } from './i18n.ts'

/** Klient z service role – omija RLS; używać tylko po weryfikacji użytkownika. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
}

/** Użytkownik z nagłówka Authorization (JWT z aplikacji). */
export async function userFromRequest(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}

/**
 * Język zawodnika z profilu (`locale` → `language` → polski). Osobne zapytanie, żeby brak kolumn (migracja
 * 20261027090000_language jeszcze niewgrana) nie psuł zapytań o inne pola profilu – wtedy po prostu polski.
 */
export async function userLang(admin: SupabaseClient, userId: string): Promise<Lang> {
  const { data } = await admin.from('profiles').select('locale, language').eq('user_id', userId).maybeSingle()
  return langOf(data as { locale?: string | null; language?: string | null } | null)
}

/** Język odpowiedzi dla zalogowanego: nagłówek `x-app-lang`, a bez niego profil (bez zapytania, gdy nagłówek jest). */
export async function requestLang(req: Request, admin: SupabaseClient, userId: string): Promise<Lang> {
  const h = req.headers.get('x-app-lang')?.trim().toLowerCase()
  return isLang(h) ? h : userLang(admin, userId)
}
