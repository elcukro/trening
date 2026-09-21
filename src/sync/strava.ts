import { supabase } from './supabase'
import { db } from '@/db'
import type { RideSamples } from '@/engine/analysis'

export interface StravaStatus {
  connected: boolean
  athlete_id: string | null
  expires_at: string | null
  scope: string | null
  activities: number
}


const ERROR_PL: Record<string, string> = {
  unauthorized: 'Zaloguj się w Ustawieniach → Konto, żeby korzystać z integracji.',
  not_connected: 'Integracja nie jest połączona – zrób to w Ustawieniach → Integracje.',
  no_items: 'Na ten okres nie ma treningów do wysłania.',
  unknown_action: 'Nieznana akcja – zgłoś błąd.',
  method: 'Nieobsługiwane żądanie.',
}

function translate(code: string): string {
  return ERROR_PL[code] ?? code
}

/** Żądanie do funkcji nie może wisieć w nieskończoność – bez tego interfejs zostaje „w toku”. */
async function withTimeout<T>(p: Promise<T>, ms = 45_000): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Brak odpowiedzi serwera w ${ms / 1000} s.`)), ms))])
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Brak konfiguracji Supabase.')
  const { data, error } = await withTimeout(supabase.functions.invoke('strava-oauth', { body: { action, ...extra } }))
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) detail = ((await ctx.json()) as { error?: string }).error ?? detail
    } catch {
      /* ignoruj */
    }
    throw new Error(translate(detail))
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
