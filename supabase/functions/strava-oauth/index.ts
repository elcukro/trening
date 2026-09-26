/**
 * strava-oauth – połączenie ze Stravą.
 *  GET  /strava-oauth/callback?code&state   – powrót z autoryzacji (publiczne; stan podpisany HMAC)
 *  POST /strava-oauth  {action}             – z JWT użytkownika: start | status | disconnect | sync | subscribe
 */
import { APP_URL, CORS, env, json } from '../_shared/env.ts'
import { sign, verify, webhookPathSecret, webhookVerifyToken } from '../_shared/crypto.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { accessTokenFor, deauthorize, exchangeCode, fetchActivity, listActivities, RIDE_TYPES, saveTokens, upsertActivity } from '../_shared/strava.ts'

const SCOPE = 'read,activity:read_all'

function functionsBase(): string {
  return `${env('SUPABASE_URL')}/functions/v1`
}

async function ensureSubscription(): Promise<{ ok: boolean; detail: string }> {
  const cid = env('STRAVA_CLIENT_ID')
  const secret = env('STRAVA_CLIENT_SECRET')
  const list = await fetch(`https://www.strava.com/api/v3/push_subscriptions?client_id=${cid}&client_secret=${secret}`)
  const existing = list.ok ? ((await list.json()) as { id: number; callback_url: string }[]) : []
  const callback = `${functionsBase()}/strava-webhook/${await webhookPathSecret()}`
  if (existing.some((s) => s.callback_url === callback)) return { ok: true, detail: 'istnieje' }
  for (const s of existing) {
    await fetch(`https://www.strava.com/api/v3/push_subscriptions/${s.id}?client_id=${cid}&client_secret=${secret}`, { method: 'DELETE' })
  }
  const body = new URLSearchParams({ client_id: cid, client_secret: secret, callback_url: callback, verify_token: await webhookVerifyToken() })
  const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', { method: 'POST', body })
  const text = await res.text()
  return { ok: res.ok, detail: res.ok ? 'utworzona' : `${res.status} ${text}` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)

  // ---- callback z Stravy (bez JWT)
  if (req.method === 'GET' && url.pathname.endsWith('/callback')) {
    const back = (q: string) => Response.redirect(`${APP_URL}/wiecej/ustawienia?${q}`, 302)
    if (url.searchParams.get('error')) return back(`strava=error&reason=${encodeURIComponent(url.searchParams.get('error')!)}`)
    const state = url.searchParams.get('state') ?? ''
    const payload = await verify(state)
    if (!payload) return back('strava=error&reason=bad_state')
    const { uid, exp } = JSON.parse(payload) as { uid: string; exp: number }
    if (Date.now() > exp) return back('strava=error&reason=state_expired')
    const scope = url.searchParams.get('scope') ?? ''
    if (!scope.includes('activity:read')) return back('strava=error&reason=scope')
    try {
      const tokens = await exchangeCode(url.searchParams.get('code')!)
      tokens.scope = scope
      const admin = adminClient()
      // jedno konto Stravy = jeden użytkownik aplikacji
      const athleteId = tokens.athlete?.id ? String(tokens.athlete.id) : null
      if (athleteId) {
        const { data: taken } = await admin.from('integration_tokens').select('user_id').eq('provider', 'strava').eq('athlete_id', athleteId).maybeSingle()
        if (taken && taken.user_id !== uid) return back('strava=error&reason=athlete_taken')
      }
      await saveTokens(admin, uid, tokens)
      const sub = await ensureSubscription()
      return back(`strava=ok&webhook=${encodeURIComponent(sub.detail)}`)
    } catch (e) {
      return back(`strava=error&reason=${encodeURIComponent(String(e instanceof Error ? e.message : e).slice(0, 120))}`)
    }
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const admin = adminClient()
  const body = (await req.json().catch(() => ({}))) as { action?: string; days?: number; secret?: string; user_id?: string }
  let user = await userFromRequest(req)
  // backfill historii z serwera (bez sesji użytkownika): sekret harmonogramu + wskazane konto
  if (!user && body.action === 'backfill' && body.secret && body.user_id && body.secret === env('PUSH_CRON_SECRET')) user = { id: body.user_id, email: null }
  if (!user) return json({ error: 'unauthorized' }, 401)

  switch (body.action) {
    case 'start': {
      const state = await sign(JSON.stringify({ uid: user.id, exp: Date.now() + 10 * 60 * 1000 }))
      const p = new URLSearchParams({
        client_id: env('STRAVA_CLIENT_ID'),
        redirect_uri: `${functionsBase()}/strava-oauth/callback`,
        response_type: 'code',
        approval_prompt: 'auto',
        scope: SCOPE,
        state,
      })
      return json({ url: `https://www.strava.com/oauth/authorize?${p}` })
    }
    case 'status': {
      const { data } = await admin.from('integration_tokens').select('athlete_id, expires_at, scope, updated_at').eq('user_id', user.id).eq('provider', 'strava').maybeSingle()
      const { count } = await admin.from('strava_activities').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('deleted_at', null)
      return json({ connected: !!data, athlete_id: data?.athlete_id ?? null, expires_at: data?.expires_at ?? null, scope: data?.scope ?? null, activities: count ?? 0 })
    }
    case 'disconnect': {
      const token = await accessTokenFor(admin, user.id).catch(() => null)
      if (token) await deauthorize(token)
      await admin.from('integration_tokens').delete().eq('user_id', user.id).eq('provider', 'strava')
      return json({ ok: true })
    }
    case 'subscribe': {
      return json(await ensureSubscription())
    }
    case 'sync': {
      const token = await accessTokenFor(admin, user.id)
      if (!token) return json({ error: 'not_connected' }, 400)
      await ensureSubscription().catch((e) => console.warn('subscription', e)) // samonaprawa po zmianie adresu webhooka
      const days = Math.min(90, Math.max(1, body.days ?? 14))
      const after = Math.floor(Date.now() / 1000) - days * 86400
      const list = await listActivities(token, after)
      let imported = 0
      for (const a of list) {
        if (!RIDE_TYPES.has(a.sport_type ?? a.type ?? '')) continue
        const full = await fetchActivity(token, a.id)
        if (!full) continue
        await upsertActivity(admin, user.id, full.activity, full.streams)
        imported++
      }
      return json({ ok: true, imported, scanned: list.length })
    }
    // Historia do kontekstu notatek (docs/20): do 400 dni, bez próbek dla jazd starszych niż 90 dni (1 zapytanie na jazdę),
    // tylko brakujące; najwyżej 80 jazd na wywołanie – wołaj ponownie, dopóki `remaining` > 0.
    case 'backfill': {
      const token = await accessTokenFor(admin, user.id)
      if (!token) return json({ error: 'not_connected' }, 400)
      const days = Math.min(400, Math.max(1, body.days ?? 365))
      const after = Math.floor(Date.now() / 1000) - days * 86400
      const list = (await listActivities(token, after)).filter((a) => RIDE_TYPES.has(a.sport_type ?? a.type ?? ''))
      const { data: have } = await admin.from('strava_activities').select('id').eq('user_id', user.id)
      const known = new Set((have ?? []).map((r) => String(r.id)))
      const missing = list.filter((a) => !known.has(String(a.id)))
      let imported = 0
      for (const a of missing.slice(0, 80)) {
        const recent = Date.now() - new Date(a.start_date).getTime() < 90 * 86400 * 1000
        const full = await fetchActivity(token, a.id, recent)
        if (!full) continue
        await upsertActivity(admin, user.id, full.activity, full.streams)
        imported++
      }
      return json({ ok: true, imported, scanned: list.length, remaining: Math.max(0, missing.length - imported) })
    }
    default:
      return json({ error: 'unknown_action' }, 400)
  }
})
