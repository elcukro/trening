/**
 * strava-webhook – odbiór zdarzeń Stravy (publiczne, bez JWT).
 *  GET  ?hub.mode=subscribe&hub.verify_token&hub.challenge → {"hub.challenge"}
 *  POST {object_type, aspect_type, object_id, owner_id, updates} → import/aktualizacja/usunięcie aktywności
 */
import { json } from '../_shared/env.ts'
import { timingSafeEqual, webhookPathSecret, webhookVerifyToken } from '../_shared/crypto.ts'
import { adminClient } from '../_shared/supabase.ts'
import { accessTokenFor, activityExists, athleteAuthorized, importActivity, markDeleted, userIdForAthlete } from '../_shared/strava.ts'
import { sendWorkout } from '../_shared/email_send.ts'

interface StravaEvent {
  object_type: 'activity' | 'athlete'
  aspect_type: 'create' | 'update' | 'delete'
  object_id: number
  owner_id: number
  updates?: Record<string, string>
  event_time: number
}

async function handle(ev: StravaEvent): Promise<void> {
  const admin = adminClient()
  const userId = await userIdForAthlete(admin, ev.owner_id)
  if (!userId) {
    console.warn('webhook: nieznany athlete', ev.owner_id)
    return
  }
  // Zdarzenia niszczące potwierdzamy w API Stravy – samo zdarzenie nie jest podpisane.
  if (ev.object_type === 'athlete') {
    if (ev.updates?.authorized !== 'false') return
    let stillAuthorized = false
    try {
      const token = await accessTokenFor(admin, userId)
      stillAuthorized = token ? await athleteAuthorized(token) : false
    } catch {
      stillAuthorized = false // odświeżenie tokenu nie działa → dostęp faktycznie cofnięty
    }
    if (stillAuthorized) {
      console.warn('webhook: zignorowano deauthoryzację – token nadal działa')
      return
    }
    await admin.from('integration_tokens').delete().eq('user_id', userId).eq('provider', 'strava')
    return
  }
  if (ev.aspect_type === 'delete') {
    const token = await accessTokenFor(admin, userId).catch(() => null)
    if (token && (await activityExists(token, ev.object_id))) {
      console.warn('webhook: zignorowano usunięcie – aktywność', ev.object_id, 'nadal istnieje')
      return
    }
    await markDeleted(admin, userId, ev.object_id)
    return
  }
  const ok = await importActivity(admin, userId, ev.object_id)
  console.log('webhook:', ev.aspect_type, ev.object_id, ok ? 'zaimportowana' : 'pominięta')
  // podsumowanie mailem zaraz po wgraniu nowej jazdy (docs/19) – tylko przy „create”, jeden mail na jazdę
  if (ok && ev.aspect_type === 'create') {
    const res = await sendWorkout(admin, userId, ev.object_id).catch((e) => `błąd: ${e instanceof Error ? e.message : e}`)
    console.log('webhook: mail po treningu', ev.object_id, res)
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  // Sekret w ścieżce: adres funkcji jest publiczny, a Strava nie podpisuje zdarzeń.
  const segment = url.pathname.split('/').filter(Boolean).pop() ?? ''
  if (!timingSafeEqual(segment, await webhookPathSecret())) return json({ error: 'not found' }, 404)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === (await webhookVerifyToken()) && challenge) return json({ 'hub.challenge': challenge })
    return json({ error: 'verification failed' }, 403)
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  let ev: StravaEvent
  try {
    ev = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  // Strava wymaga odpowiedzi w 2 s – import w tle
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  const work = handle(ev).catch((e) => console.error('webhook error', e))
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work
  return json({ ok: true })
})
