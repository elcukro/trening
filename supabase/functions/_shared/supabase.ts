import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { env } from './env.ts'

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
