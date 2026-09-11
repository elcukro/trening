import { supabase } from './supabase'

export interface StravaStatus {
  connected: boolean
  athlete_id: string | null
  expires_at: string | null
  scope: string | null
  activities: number
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Brak konfiguracji Supabase.')
  const { data, error } = await supabase.functions.invoke('strava-oauth', { body: { action, ...extra } })
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) detail = ((await ctx.json()) as { error?: string }).error ?? detail
    } catch {
      /* ignoruj */
    }
    throw new Error(detail)
  }
  return data as T
}

export const strava = {
  status: () => call<StravaStatus>('status'),
  startUrl: () => call<{ url: string }>('start'),
  disconnect: () => call<{ ok: boolean }>('disconnect'),
  subscribe: () => call<{ ok: boolean; detail: string }>('subscribe'),
  sync: (days = 14) => call<{ ok: boolean; imported: number; scanned: number }>('sync', { days }),
}
