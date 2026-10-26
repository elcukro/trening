import { t, UserError } from '@/i18n'
import { langHeaders, supabase } from './supabase'
import { db } from '@/db'
import type { RideSamples } from '@/engine/analysis'

export interface StravaStatus {
  connected: boolean
  athlete_id: string | null
  expires_at: string | null
  scope: string | null
  activities: number
}


/** Kod błędu funkcji → zdanie dla zawodnika (`UserError`); nieznany kod zostaje technicznym błędem. */
function translate(code: string): Error {
  const m = t().sync.fn
  const known: Record<string, string> = { unauthorized: m.unauthorized, not_connected: m.notConnected, no_items: m.noItems, unknown_action: m.unknownAction, method: m.method }
  return known[code] ? new UserError(known[code]) : new Error(code)
}

/** Żądanie do funkcji nie może wisieć w nieskończoność – bez tego interfejs zostaje „w toku”. */
async function withTimeout<T>(p: Promise<T>, ms = 45_000): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new UserError(t().sync.timeout(ms / 1000))), ms))])
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new UserError(t().sync.noBackend)
  const { data, error } = await withTimeout(supabase.functions.invoke('strava-oauth', { body: { action, ...extra }, headers: langHeaders() }))
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) detail = ((await ctx.json()) as { error?: string }).error ?? detail
    } catch {
      /* ignoruj */
    }
    throw translate(detail)
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

/**
 * Próbki jazdy (co 5 s) z `strava_streams` – pobierane na żądanie i buforowane w `kv`, żeby analiza działała offline
 * po pierwszym otwarciu. Strumienie są niezmienne (Strava nie edytuje nagrania), więc bufor nie wygasa.
 */
export async function loadStreams(activityId: string): Promise<RideSamples | null> {
  const key = `streams:${activityId}`
  const cached = await db.kv.get(key)
  if (cached) return cached.value as RideSamples
  if (!supabase) return null
  const { data, error } = await supabase.from('strava_streams').select('dt, n, samples').eq('activity_id', activityId).maybeSingle()
  if (error) throw new Error(`strava_streams: ${error.message}`)
  if (!data) return null
  const samples = { dt: data.dt as number, n: data.n as number, ...(data.samples as Omit<RideSamples, 'dt' | 'n'>) } as RideSamples
  await db.kv.put({ key, value: samples, updated_at: new Date().toISOString() })
  return samples
}
