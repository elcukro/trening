/**
 * strava-login – logowanie do aplikacji kontem Stravy (docs/28). Supabase Auth nie ma dostawcy Strava, więc:
 *  GET  /strava-login/ping                    – czy funkcja jest wdrożona (aplikacja pokazuje wtedy przycisk)
 *  GET  /strava-login/start?return&challenge   – przekierowanie do Stravy (stan podpisany HMAC)
 *  GET  /strava-login/callback?code&state      – athlete id → konto z połączoną Stravą → powrót z biletem
 *  POST /strava-login {action:'redeem', ticket, verifier} – bilet + weryfikator PKCE → `token_hash` magic linku
 * Sesję wydaje sam Supabase Auth (`verifyOtp` w aplikacji), funkcja nie podpisuje żadnych JWT. Bez JWT (publiczna).
 */
import { APP_URL, CORS, env, json } from '../_shared/env.ts'
import { sign, verify } from '../_shared/crypto.ts'
import { adminClient } from '../_shared/supabase.ts'
import { exchangeCode, saveTokens, userIdForAthlete } from '../_shared/strava.ts'
import {
  allowedReturn,
  parseState,
  parseTicket,
  returnOrigins,
  returnWith,
  STATE_TTL_MS,
  TICKET_TTL_MS,
  validChallenge,
  verifierMatches,
  type LoginError,
  type LoginState,
  type LoginTicket,
} from '../_shared/strava_login.ts'

// ten sam zakres co integracja (strava-oauth): gdy zgoda już jest, Strava wraca od razu, a odświeżone tokeny
// zastępują stare bez zawężania uprawnień
const SCOPE = 'read,activity:read_all,activity:write'

function functionsBase(): string {
  return `${env('SUPABASE_URL')}/functions/v1`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)

  if (req.method === 'GET' && url.pathname.endsWith('/ping')) return json({ ok: true })

  if (req.method === 'GET' && url.pathname.endsWith('/start')) {
    const ret = allowedReturn(url.searchParams.get('return'), returnOrigins(APP_URL, Deno.env.get('LOGIN_RETURN_ORIGINS')))
    const ch = url.searchParams.get('challenge')
    if (!ret || !validChallenge(ch)) return new Response('Nieprawidłowy adres powrotu albo wyzwanie.', { status: 400 })
    const state: LoginState = { p: 'strava-login', ret, ch, exp: Date.now() + STATE_TTL_MS }
    const p = new URLSearchParams({
      client_id: env('STRAVA_CLIENT_ID'),
      redirect_uri: `${functionsBase()}/strava-login/callback`,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: SCOPE,
      state: await sign(JSON.stringify(state)),
    })
    return Response.redirect(`https://www.strava.com/oauth/authorize?${p}`, 302)
  }

  if (req.method === 'GET' && url.pathname.endsWith('/callback')) {
    const state = parseState(await verify(url.searchParams.get('state') ?? '').catch(() => null), Date.now())
    // bez ważnego stanu nie wiadomo, dokąd wrócić – wracamy do aplikacji webowej
    if (typeof state === 'string') return Response.redirect(returnWith(`${APP_URL}/`, { strava_error: state }), 302)
    const fail = (e: LoginError) => Response.redirect(returnWith(state.ret, { strava_error: e }), 302)
    if (url.searchParams.get('error') || !url.searchParams.get('code')) return fail('denied')
    try {
      const tokens = await exchangeCode(url.searchParams.get('code')!)
      const athleteId = tokens.athlete?.id
      if (!athleteId) return fail('server')
      const admin = adminClient()
      const uid = await userIdForAthlete(admin, athleteId)
      if (!uid) return fail('not_linked')
      const scope = url.searchParams.get('scope') ?? ''
      if (scope.includes('activity:read')) {
        tokens.scope = scope
        await saveTokens(admin, uid, tokens)
      }
      const ticket: LoginTicket = { p: 'strava-ticket', uid, ch: state.ch, exp: Date.now() + TICKET_TTL_MS }
      return Response.redirect(returnWith(state.ret, { strava_ticket: await sign(JSON.stringify(ticket)) }), 302)
    } catch (e) {
      console.error('strava-login callback', e)
      return fail('server')
    }
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const body = (await req.json().catch(() => ({}))) as { action?: string; ticket?: string; verifier?: string }
  if (body.action !== 'redeem') return json({ error: 'unknown_action' }, 400)
  const ticket = parseTicket(await verify(body.ticket ?? '').catch(() => null), Date.now())
  if (typeof ticket === 'string') return json({ error: ticket }, 400)
  if (!(await verifierMatches(body.verifier, ticket.ch))) return json({ error: 'bad_state' }, 400)

  const admin = adminClient()
  const { data: user, error: userErr } = await admin.auth.admin.getUserById(ticket.uid)
  if (userErr || !user.user?.email) return json({ error: 'not_linked' }, 400)
  // generateLink nie wysyła maila – zwraca jednorazowy token, który aplikacja wymienia na sesję (verifyOtp)
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.user.email })
  if (error || !data.properties?.hashed_token) {
    console.error('strava-login generateLink', error)
    return json({ error: 'server' }, 500)
  }
  return json({ token_hash: data.properties.hashed_token })
})
