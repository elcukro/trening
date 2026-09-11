import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { env } from './env.ts'
import { decrypt, encrypt } from './crypto.ts'

export const WAHOO_API = 'https://api.wahooligan.com'
// odczyt planów i treningów potrzebny, żeby sprawdzić, co Wahoo naprawdę zapisało
export const WAHOO_SCOPES = 'user_read workouts_read workouts_write plans_read plans_write offline_data'

export interface WahooTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  created_at?: number
  scope?: string
}

export function redirectUri(): string {
  return `${env('SUPABASE_URL')}/functions/v1/wahoo-oauth/callback`
}

async function tokenRequest(body: Record<string, string>): Promise<WahooTokenResponse> {
  const res = await fetch(`${WAHOO_API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('WAHOO_CLIENT_ID'), client_secret: env('WAHOO_CLIENT_SECRET'), ...body }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Wahoo oauth ${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

export function exchangeCode(code: string): Promise<WahooTokenResponse> {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() })
}

export function refreshTokens(refreshToken: string): Promise<WahooTokenResponse> {
  return tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })
}

export async function saveTokens(admin: SupabaseClient, userId: string, t: WahooTokenResponse, userIdWahoo?: string | null): Promise<void> {
  const base = (t.created_at ? t.created_at * 1000 : Date.now())
  const row: Record<string, unknown> = {
    user_id: userId,
    provider: 'wahoo',
    access_token_enc: await encrypt(t.access_token),
    refresh_token_enc: await encrypt(t.refresh_token),
    expires_at: new Date(base + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? WAHOO_SCOPES,
    updated_at: new Date().toISOString(),
  }
  if (userIdWahoo) row.athlete_id = userIdWahoo
  const { error } = await admin.from('integration_tokens').upsert(row, { onConflict: 'user_id,provider' })
  if (error) throw new Error(`integration_tokens: ${error.message}`)
}

/** Ważny access token (Wahoo: 2 h; odświeżamy 5 min przed końcem, refresh token jest rotowany). */
export async function accessTokenFor(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from('integration_tokens').select('*').eq('user_id', userId).eq('provider', 'wahoo').maybeSingle()
  if (error) throw new Error(`integration_tokens: ${error.message}`)
  if (!data) return null
  if (new Date(data.expires_at).getTime() - Date.now() > 5 * 60 * 1000) return decrypt(data.access_token_enc)
  const fresh = await refreshTokens(await decrypt(data.refresh_token_enc))
  await saveTokens(admin, userId, fresh, data.athlete_id)
  return fresh.access_token
}

export async function wahooUser(token: string): Promise<{ id: number; email?: string; first?: string } | null> {
  const res = await fetch(`${WAHOO_API}/v1/user`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  return res.json()
}

/** base64 bezpieczne dla polskich znaków. */
export function b64utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Limity sandboxa Wahoo: 25 zapytań / 5 min, 100 / h, 250 / dzień. Przy 429 czekamy i ponawiamy,
 * respektując nagłówek Retry-After. Ciało żądania typu FormData trzeba zbudować od nowa przy każdej próbie.
 */
async function api(
  token: string,
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: BodyInit | (() => BodyInit),
  retries = 2,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null; text: string }> {
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    const payload = typeof body === 'function' ? body() : body
    if (payload instanceof URLSearchParams) headers['content-type'] = 'application/x-www-form-urlencoded'
    const res = await fetch(`${WAHOO_API}${path}`, { method, headers, body: payload })
    const text = await res.text()
    if (res.status === 429 && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 15_000 * (attempt + 1))
      continue
    }
    let json: Record<string, unknown> | null = null
    try {
      json = JSON.parse(text)
    } catch {
      /* nie JSON */
    }
    return { ok: res.ok, status: res.status, json, text }
  }
}

/**
 * Wahoo opisuje `plan[file]` jako plik z zawartością base64. Dokumentacja nie mówi jednoznacznie,
 * czy chce przesyłki multipart, czy zwykłego pola formularza, więc próbujemy po kolei i zapamiętujemy,
 * co zadziałało. Nazwa wariantu wraca w wyniku, żeby było wiadomo, który jest właściwy.
 */
type Variant = 'multipart-json' | 'multipart-base64' | 'form-base64'
/**
 * Dokumentacja Wahoo mówi „Base64 encoded JSON file”, ale API parsuje plik wprost jako JSON:
 * base64 kończy się błędem „Could not serialize plan for validation. unexpected character”.
 * Właściwy wariant to surowy JSON w przesyłce multipart; pozostałe zostają jako zapas.
 */
const VARIANTS: Variant[] = ['multipart-json', 'multipart-base64', 'form-base64']
let preferred: Variant | null = null

function planBody(item: PushItem, variant: Variant, now: string): BodyInit {
  const json = JSON.stringify(item.plan)
  const filename = `${item.external_id.replace(/[^\w.-]/g, '_')}.json`
  const fields: Record<string, string> = {
    'plan[filename]': filename,
    'plan[external_id]': item.external_id,
    'plan[provider_updated_at]': now,
  }
  if (variant === 'form-base64') {
    return new URLSearchParams({ 'plan[file]': b64utf8(json), ...fields })
  }
  const fd = new FormData()
  const content = variant === 'multipart-json' ? json : b64utf8(json)
  fd.append('plan[file]', new Blob([content], { type: 'application/json' }), filename)
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

/**
 * Odnajduje plan po `external_id`. Potrzebne, gdy nasza baza zgubi identyfikator (np. po nieudanej
 * wysyłce), a plan po stronie Wahoo nadal istnieje – wtedy POST odbija się o wymóg unikalności.
 * Listę pobieramy raz na całą wysyłkę i trzymamy w podanym indeksie.
 */
export interface PlanIndex {
  map: Map<string, number> | null
}

async function loadPlanIndex(token: string, index: PlanIndex): Promise<Map<string, number>> {
  if (index.map) return index.map
  const map = new Map<string, number>()
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${WAHOO_API}/v1/plans?page=${page}&per_page=50`, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) break
    const body = (await res.json()) as { plans?: unknown[] } | unknown[]
    const list = (Array.isArray(body) ? body : (body.plans ?? [])) as { id?: number; external_id?: string }[]
    for (const p of list) if (p.external_id && p.id) map.set(p.external_id, p.id)
    if (list.length < 50) break
  }
  index.map = map
  return map
}

async function sendPlan(token: string, item: PushItem, planId: number | null, now: string, index?: PlanIndex): Promise<{ ok: boolean; id?: number; status: number; text: string; variant?: Variant }> {
  const order = preferred ? [preferred, ...VARIANTS.filter((v) => v !== preferred)] : VARIANTS
  let last = { ok: false, status: 0, text: 'brak próby' }
  for (const variant of order) {
    const path = planId ? `/v1/plans/${planId}` : '/v1/plans'
    const res = await api(token, path, planId ? 'PUT' : 'POST', () => planBody(item, variant, now))
    if (res.ok) {
      preferred = variant
      return { ok: true, id: planId ?? Number(res.json?.id), status: res.status, text: res.text, variant }
    }
    last = { ok: false, status: res.status, text: res.text }
    // plan już istnieje po stronie Wahoo, a my zgubiliśmy jego identyfikator – odszukaj i zaktualizuj
    if (res.status === 422 && res.text.includes('already exists') && index && !planId) {
      const found = (await loadPlanIndex(token, index)).get(item.external_id)
      if (found) {
        const put = await api(token, `/v1/plans/${found}`, 'PUT', () => planBody(item, variant, now))
        if (put.ok) {
          preferred = variant
          return { ok: true, id: found, status: put.status, text: put.text, variant }
        }
        return { ok: false, status: put.status, text: put.text }
      }
      return { ok: false, status: res.status, text: `${res.text} (nie znaleziono planu o tym external_id na liście)` }
    }
    // 422/400 to odrzucenie formatu – warto spróbować innego wariantu; reszta to prawdziwy błąd
    if (res.status !== 422 && res.status !== 400) break
  }
  return { ...last }
}

export interface PushItem {
  date: string
  workout_id: string
  name: string
  minutes: number
  workout_type_id: number
  external_id: string
  starts: string
  plan: unknown
}

export interface PushResult {
  date: string
  status: 'created' | 'updated' | 'error'
  wahoo_plan_id?: number
  wahoo_workout_id?: number
  error?: string
  /** który sposób przesłania pliku zaakceptowało Wahoo */
  variant?: string
  /** czy trening ma faktycznie podpięty plan (weryfikacja po zapisie) */
  plan_linked?: boolean | null
}

/** Tworzy albo aktualizuje plan i trening dla jednego dnia. */
export async function pushDay(
  token: string,
  item: PushItem,
  existing: { wahoo_plan_id: number | null; wahoo_workout_id: number | null } | null,
  opts: { verify?: boolean; planIndex?: PlanIndex } = {},
): Promise<PushResult> {
  const now = new Date().toISOString()

  let planId = existing?.wahoo_plan_id ?? null
  let updated = false
  if (planId) {
    const put = await sendPlan(token, item, planId, now)
    if (put.ok) updated = true
    else if (put.status === 404) planId = null
    else return { date: item.date, status: 'error', error: `plan PUT ${put.status}: ${put.text.slice(0, 160)}` }
  }
  if (!planId) {
    const post = await sendPlan(token, item, null, now, opts.planIndex)
    if (!post.ok) return { date: item.date, status: 'error', error: `plan POST ${post.status}: ${post.text.slice(0, 160)}` }
    planId = post.id ?? null
    if (!planId) return { date: item.date, status: 'error', error: 'plan bez id' }
  }

  const workoutFields = () => new URLSearchParams({
    'workout[name]': item.name,
    'workout[workout_type_id]': String(item.workout_type_id),
    'workout[starts]': item.starts,
    'workout[minutes]': String(item.minutes),
    'workout[plan_id]': String(planId),
    'workout[workout_token]': item.external_id,
  })


  // samo plan_id nie wiąże planu z treningiem – licznik czyta listę plan_ids
  const workoutBody = () => {
    const b = workoutFields()
    b.append('workout[plan_ids][]', String(planId))
    return b
  }

  let workoutId = existing?.wahoo_workout_id ?? null
  let status: PushResult['status'] = updated ? 'updated' : 'created'
  if (workoutId) {
    const put = await api(token, `/v1/workouts/${workoutId}`, 'PUT', workoutBody)
    if (put.ok) status = 'updated'
    else if (put.status === 404) workoutId = null
    else return { date: item.date, status: 'error', error: `workout PUT ${put.status}: ${put.text.slice(0, 160)}` }
  }
  if (!workoutId) {
    const post = await api(token, '/v1/workouts', 'POST', workoutBody)
    if (!post.ok) return { date: item.date, status: 'error', error: `workout POST ${post.status}: ${post.text.slice(0, 160)}` }
    workoutId = Number(post.json?.id) || null
  }

  // sprawdzamy, czy plan naprawdę jest podpięty – bez tego licznik pokazuje „Select workout plan”.
  // Kosztuje jedno zapytanie, więc robimy to tylko dla pierwszego dnia wysyłki.
  let linked: boolean | null = null
  if (workoutId && opts.verify) {
    const check = await getWorkout(token, workoutId)
    if (check.status === 200) {
      try {
        const w = JSON.parse(check.body) as { plan_ids?: number[] }
        linked = Array.isArray(w.plan_ids) && w.plan_ids.length > 0
      } catch {
        linked = null
      }
    }
  }
  return { date: item.date, status, wahoo_plan_id: planId, wahoo_workout_id: workoutId ?? undefined, variant: preferred ?? undefined, plan_linked: linked }
}

export async function deleteWorkout(token: string, workoutId: number): Promise<void> {
  await api(token, `/v1/workouts/${workoutId}`, 'DELETE')
}

/** Odczyt planu z Wahoo – sprawdza, czy zapisana struktura ma interwały. */
export async function getPlan(token: string, planId: number): Promise<{ status: number; body: string }> {
  const res = await fetch(`${WAHOO_API}/v1/plans/${planId}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: res.status, body: (await res.text()).slice(0, 400) }
}

export async function getWorkout(token: string, workoutId: number): Promise<{ status: number; body: string }> {
  const res = await fetch(`${WAHOO_API}/v1/workouts/${workoutId}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: res.status, body: (await res.text()).slice(0, 600) }
}

/**
 * Sprawdza po kolei każdy sposób przesłania pliku: tworzy plan, odczytuje go z powrotem i kasuje.
 * Dzięki temu wiadomo, który wariant Wahoo naprawdę rozumie, a nie tylko przyjmuje.
 */
export async function diagnose(token: string, item: PushItem): Promise<Record<string, unknown>[]> {
  const now = new Date().toISOString()
  const out: Record<string, unknown>[] = []
  for (const variant of VARIANTS) {
    // Wahoo wymusza unikalność external_id – plan próbny musi mieć własny
    const probe: PushItem = { ...item, external_id: `diag-${variant}-${Date.now()}` }
    const post = await api(token, '/v1/plans', 'POST', planBody(probe, variant, now))
    const id = post.ok ? Number(post.json?.id) : null
    let readBack: { status: number; body: string } | null = null
    if (id) readBack = await getPlan(token, id)
    out.push({ variant, post_status: post.status, post_body: post.text.slice(0, 200), plan_id: id, read_status: readBack?.status ?? null, read_body: readBack?.body ?? null })
    if (id) await deletePlan(token, id).catch(() => undefined)
  }
  return out
}

export async function deletePlan(token: string, planId: number): Promise<void> {
  await api(token, `/v1/plans/${planId}`, 'DELETE')
}

/**
 * Usuwa trening i plan danego dnia. Potrzebne, gdy Wahoo trzyma policzone przy tworzeniu podsumowanie
 * (TSS, IF) i aktualizacja pliku planu go nie odświeża – wtedy trzeba utworzyć wszystko od nowa.
 */
export async function removeDay(token: string, existing: { wahoo_plan_id: number | null; wahoo_workout_id: number | null }): Promise<void> {
  if (existing.wahoo_workout_id) await deleteWorkout(token, existing.wahoo_workout_id)
  if (existing.wahoo_plan_id) await deletePlan(token, existing.wahoo_plan_id)
}
