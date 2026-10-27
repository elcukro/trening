import { t, UserError } from '@/i18n'
import { langHeaders, supabase } from './supabase'
import { db } from '@/db'
import type { RideSamples } from '@/engine/analysis'
import type { RideRow } from '../../supabase/functions/_shared/rides'

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

/** Polityka API Stravy: dane ze Stravy trzymamy najwyżej 7 dni od pobrania (docs/33 § 5). */
export const STRAVA_KEEP_DAYS = 7
const STRAVA_KEEP_MS = STRAVA_KEEP_DAYS * 86_400_000

interface CachedStreams {
  at: string
  samples: RideSamples
}

const isOld = (iso: string | null | undefined, now: number) => !iso || now - Date.parse(iso) > STRAVA_KEEP_MS

/**
 * Próbki jazdy (co 5 s) z `wahoo_streams` albo `strava_streams` – pobierane na żądanie i buforowane w `kv`
 * (`streams:<ride.key>`), żeby analiza działała offline po pierwszym otwarciu. Bufor Stravy wygasa po 7 dniach.
 */
export async function loadRideStreams(ride: Pick<RideRow, 'source' | 'id' | 'key'>): Promise<RideSamples | null> {
  const key = `streams:${ride.key}`
  const cached = (await db.kv.get(key))?.value as CachedStreams | undefined
  if (cached?.samples) {
    if (ride.source !== 'strava' || !isOld(cached.at, Date.now())) return cached.samples
    await db.kv.delete(key)
  }
  if (!supabase) return null
  const q = ride.source === 'wahoo' ? supabase.from('wahoo_streams').select('dt, n, samples').eq('workout_id', ride.id) : supabase.from('strava_streams').select('dt, n, samples').eq('activity_id', ride.id)
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(`${ride.source}_streams: ${error.message}`)
  if (!data) return null
  const samples = { dt: data.dt as number, n: data.n as number, ...(data.samples as Omit<RideSamples, 'dt' | 'n'>) } as RideSamples
  const at = new Date().toISOString()
  await db.kv.put({ key, value: { at, samples } satisfies CachedStreams, updated_at: at })
  return samples
}

/**
 * Usuwa lokalne dane Stravy starsze niż 7 dni: wiersze `strava_activities` (`fetched_at`, inaczej `updated_at`)
 * i bufor próbek. Twarde usunięcia na serwerze nie przychodzą pullem, więc sprzątamy po każdej synchronizacji.
 * `enabled` – tylko dla testów (bez zapytania o przełącznik).
 */
export async function purgeLocalStrava(now = Date.now(), enabled?: boolean): Promise<void> {
  // ten sam przełącznik co czyszczenie na serwerze (`private.app_flags.strava_purge`) – do czasu sprawdzenia historii
  // z Wahoo nic nie znika (decyzja 26.10.2026); offline albo bez konta – też nie
  if (enabled === undefined) {
    if (!supabase) return
    const { data, error } = await supabase.rpc('strava_purge_enabled')
    if (error || data !== true) return
  } else if (!enabled) return
  const acts = await db.strava_activities.toArray()
  const oldActs = acts.filter((a) => isOld(a.fetched_at ?? a.updated_at, now)).map((a) => a.id)
  if (oldActs.length) await db.strava_activities.bulkDelete(oldActs)
  // `streams:strava:*` oraz stary format `streams:<id aktywności>` (bez źródła, sprzed docs/33)
  const rows = await db.kv.where('key').startsWith('streams:').toArray()
  const oldKv = rows.filter((r) => /^streams:(strava:)?\d+$/.test(r.key) && isOld((r.value as Partial<CachedStreams> | null)?.at ?? r.updated_at, now)).map((r) => r.key)
  if (oldKv.length) await db.kv.bulkDelete(oldKv)
}
