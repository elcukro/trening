/**
 * wahoo-oauth – połączenie z Wahoo Cloud API.
 *  GET  /wahoo-oauth/callback?code&state  – powrót z autoryzacji (publiczne; stan podpisany HMAC)
 *  POST /wahoo-oauth {action}             – z JWT: start | status | disconnect
 */
import { APP_URL, CORS, env, json } from '../_shared/env.ts'
import { sign, verify } from '../_shared/crypto.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { accessTokenFor, exchangeCode, redirectUri, saveTokens, WAHOO_API, WAHOO_SCOPES, wahooUser } from '../_shared/wahoo.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)

  if (req.method === 'GET' && url.pathname.endsWith('/callback')) {
    const back = (q: string) => Response.redirect(`${APP_URL}/wiecej/ustawienia?${q}`, 302)
    if (url.searchParams.get('error')) return back(`wahoo=error&reason=${encodeURIComponent(url.searchParams.get('error')!)}`)
    const payload = await verify(url.searchParams.get('state') ?? '')
    if (!payload) return back('wahoo=error&reason=bad_state')
    const { uid, exp } = JSON.parse(payload) as { uid: string; exp: number }
    if (Date.now() > exp) return back('wahoo=error&reason=state_expired')
    try {
      const tokens = await exchangeCode(url.searchParams.get('code')!)
      const admin = adminClient()
      const me = await wahooUser(tokens.access_token)
      if (me?.id) {
        const { data: taken } = await admin.from('integration_tokens').select('user_id').eq('provider', 'wahoo').eq('athlete_id', String(me.id)).maybeSingle()
        if (taken && taken.user_id !== uid) return back('wahoo=error&reason=athlete_taken')
      }
      await saveTokens(admin, uid, tokens, me?.id ? String(me.id) : null)
      return back('wahoo=ok')
    } catch (e) {
      return back(`wahoo=error&reason=${encodeURIComponent(String(e instanceof Error ? e.message : e).slice(0, 120))}`)
    }
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const admin = adminClient()
  const body = (await req.json().catch(() => ({}))) as { action?: string }

  switch (body.action) {
    case 'start': {
      const state = await sign(JSON.stringify({ uid: user.id, exp: Date.now() + 10 * 60 * 1000 }))
      const p = new URLSearchParams({ client_id: env('WAHOO_CLIENT_ID'), redirect_uri: redirectUri(), response_type: 'code', scope: WAHOO_SCOPES, state })
      return json({ url: `${WAHOO_API}/oauth/authorize?${p}` })
    }
    case 'status': {
      const { data } = await admin.from('integration_tokens').select('athlete_id, expires_at, scope, updated_at').eq('user_id', user.id).eq('provider', 'wahoo').maybeSingle()
      const { data: pushes } = await admin.from('wahoo_pushes').select('date, workout_id, status, error, updated_at').eq('user_id', user.id).gte('date', new Date(Date.now() - 86400000).toISOString().slice(0, 10)).order('date').limit(10)
      const scope = (data?.scope as string | undefined) ?? ''
      const missing = WAHOO_SCOPES.split(' ').filter((s) => !scope.includes(s))
      return json({ connected: !!data, wahoo_user_id: data?.athlete_id ?? null, expires_at: data?.expires_at ?? null, redirect_uri: redirectUri(), scope, missing_scopes: missing, pushes: pushes ?? [] })
    }
    case 'disconnect': {
      await accessTokenFor(admin, user.id).catch(() => null)
      await admin.from('integration_tokens').delete().eq('user_id', user.id).eq('provider', 'wahoo')
      return json({ ok: true })
    }
    default:
      return json({ error: 'unknown_action' }, 400)
  }
})
