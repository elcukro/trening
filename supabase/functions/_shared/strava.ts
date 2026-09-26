import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { env } from './env.ts'
import { decrypt, encrypt } from './crypto.ts'
import { resample, rideMetrics, type RawStreams } from './metrics.ts'

export const STRAVA_API = 'https://www.strava.com/api/v3'
export const RIDE_TYPES = new Set(['Ride', 'GravelRide', 'VirtualRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide', 'Handcycle', 'Velomobile'])

export interface TokenSet {
  access_token: string
  refresh_token: string
  expires_at: number // unix s
  athlete?: { id: number }
  scope?: string
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), code, grant_type: 'authorization_code' }),
  })
  if (!res.ok) throw new Error(`Strava token exchange ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!res.ok) throw new Error(`Strava refresh ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function saveTokens(admin: SupabaseClient, userId: string, t: TokenSet, athleteId?: string | null): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: userId,
    provider: 'strava',
    access_token_enc: await encrypt(t.access_token),
    refresh_token_enc: await encrypt(t.refresh_token),
    expires_at: new Date(t.expires_at * 1000).toISOString(),
    scope: t.scope ?? null,
    updated_at: new Date().toISOString(),
  }
  if (athleteId ?? t.athlete?.id) row.athlete_id = String(athleteId ?? t.athlete?.id)
  const { error } = await admin.from('integration_tokens').upsert(row, { onConflict: 'user_id,provider' })
  if (error) throw new Error(`integration_tokens: ${error.message}`)
}

/** Ważny access token (odświeżony, gdy wygasa w ciągu 5 min). */
export async function accessTokenFor(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from('integration_tokens').select('*').eq('user_id', userId).eq('provider', 'strava').maybeSingle()
  if (error) throw new Error(`integration_tokens: ${error.message}`)
  if (!data) return null
  const expiresAt = new Date(data.expires_at).getTime()
  if (expiresAt - Date.now() > 5 * 60 * 1000) return decrypt(data.access_token_enc)
  const fresh = await refreshTokens(await decrypt(data.refresh_token_enc))
  await saveTokens(admin, userId, fresh, data.athlete_id)
  return fresh.access_token
}

export async function userIdForAthlete(admin: SupabaseClient, athleteId: number | string): Promise<string | null> {
  const { data } = await admin.from('integration_tokens').select('user_id').eq('provider', 'strava').eq('athlete_id', String(athleteId)).maybeSingle()
  return data?.user_id ?? null
}

async function stravaGet<T>(token: string, path: string, attempt = 0): Promise<T | null> {
  const res = await fetch(`${STRAVA_API}${path}`, { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (res.status === 429 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    return stravaGet<T>(token, path, attempt + 1)
  }
  if (!res.ok) throw new Error(`Strava GET ${path} ${res.status}: ${await res.text()}`)
  return res.json()
}

export interface StravaActivity {
  id: number
  name: string
  sport_type: string
  type?: string
  start_date: string
  start_date_local: string
  moving_time: number
  elapsed_time: number
  distance: number
  total_elevation_gain: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  average_speed?: number
  average_watts?: number
  device_watts?: boolean
}

type Streams = RawStreams

/** Histogram: sekundy na każdą wartość bpm (indeks = bpm). */
export function hrHistogram(streams: Streams | null): number[] | null {
  const hr = streams?.heartrate?.data as (number | null)[] | undefined
  const time = streams?.time?.data as number[] | undefined
  if (!hr || !time || hr.length !== time.length || hr.length < 2) return null
  const hist: number[] = []
  for (let i = 1; i < hr.length; i++) {
    const dt = Math.min(30, Math.max(0, time[i]! - time[i - 1]!))
    const bpm = Math.round(hr[i] ?? 0)
    if (bpm <= 0 || bpm > 250) continue
    hist[bpm] = (hist[bpm] ?? 0) + dt
  }
  return Array.from(hist, (v) => v ?? 0)
}

export async function fetchActivity(token: string, id: number, withStreams = true): Promise<{ activity: StravaActivity; streams: Streams | null } | null> {
  const activity = await stravaGet<StravaActivity>(token, `/activities/${id}`)
  if (!activity) return null
  if (!withStreams) return { activity, streams: null }
  // pełne strumienie do analizy (plan vs wykonanie, NP, MMP, kadencja) – Strava zwraca tylko te, które istnieją
  const streams = await stravaGet<Streams>(token, `/activities/${id}/streams?keys=time,heartrate,watts,cadence,velocity_smooth,distance,altitude,moving&key_by_type=true`)
  return { activity, streams }
}

export async function listActivities(token: string, afterUnix: number): Promise<StravaActivity[]> {
  const out: StravaActivity[] = []
  for (let page = 1; page <= 5; page++) {
    const batch = await stravaGet<StravaActivity[]>(token, `/athlete/activities?after=${afterUnix}&per_page=50&page=${page}`)
    if (!batch || batch.length === 0) break
    out.push(...batch)
    if (batch.length < 50) break
  }
  return out
}

/** Czy token nadal autoryzuje dostęp do konta (weryfikacja zdarzenia deauthoryzacji). */
export async function athleteAuthorized(token: string): Promise<boolean> {
  const res = await fetch(`${STRAVA_API}/athlete`, { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 401 || res.status === 403) return false
  return res.ok
}

/** Czy aktywność nadal istnieje (weryfikacja zdarzenia usunięcia). */
export async function activityExists(token: string, id: number): Promise<boolean> {
  const res = await fetch(`${STRAVA_API}/activities/${id}`, { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 404) return false
  if (res.status === 401 || res.status === 403) return false
  return res.ok
}

export async function deauthorize(token: string): Promise<void> {
  await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { authorization: `Bearer ${token}` } })
}

/** Zapis aktywności do strava_activities (trigger w bazie przeliczy session_log dnia). */
export async function upsertActivity(admin: SupabaseClient, userId: string, a: StravaActivity, streams: Streams | null): Promise<void> {
  const sport = a.sport_type ?? a.type ?? ''
  const samples = resample(streams, 5)
  const { avg_cadence_moving, ...metrics } = rideMetrics(samples, !!a.device_watts)
  const row = {
    id: a.id,
    user_id: userId,
    date: a.start_date_local.slice(0, 10),
    start_at: a.start_date,
    name: a.name,
    sport_type: sport,
    moving_time_s: a.moving_time,
    elapsed_time_s: a.elapsed_time,
    distance_m: a.distance,
    elevation_m: a.total_elevation_gain,
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    avg_cadence: avg_cadence_moving ?? (a.average_cadence ? Math.round(a.average_cadence) : null),
    avg_speed_ms: a.average_speed ?? null,
    avg_watts: a.device_watts && a.average_watts ? Math.round(a.average_watts) : null,
    hr_histogram: hrHistogram(streams),
    is_ride: RIDE_TYPES.has(sport),
    device_watts: !!a.device_watts,
    ...metrics,
    has_streams: !!samples,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from('strava_activities').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(`strava_activities: ${error.message}`)
  if (samples) {
    const { n, dt, ...rest } = samples
    const { error: e2 } = await admin.from('strava_streams').upsert({ activity_id: a.id, user_id: userId, dt, n, samples: rest, updated_at: new Date().toISOString() }, { onConflict: 'activity_id' })
    if (e2) throw new Error(`strava_streams: ${e2.message}`)
  }
}

export async function importActivity(admin: SupabaseClient, userId: string, activityId: number): Promise<boolean> {
  const token = await accessTokenFor(admin, userId)
  if (!token) return false
  const res = await fetchActivity(token, activityId)
  if (!res) return false
  await upsertActivity(admin, userId, res.activity, res.streams)
  return true
}

export async function markDeleted(admin: SupabaseClient, userId: string, activityId: number): Promise<void> {
  await admin.from('strava_activities').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', activityId).eq('user_id', userId)
}
