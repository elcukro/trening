/**
 * strava-webhook – odbiór zdarzeń Stravy (publiczne, bez JWT).
 *  GET  ?hub.mode=subscribe&hub.verify_token&hub.challenge → {"hub.challenge"}
 *  POST {object_type, aspect_type, object_id, owner_id, updates} → import/aktualizacja/usunięcie aktywności
 */
import { json } from '../_shared/env.ts'
import { webhookVerifyToken } from '../_shared/crypto.ts'
import { adminClient } from '../_shared/supabase.ts'
import { importActivity, markDeleted, userIdForAthlete } from '../_shared/strava.ts'

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
  if (ev.object_type === 'athlete') {
    if (ev.updates?.authorized === 'false') await admin.from('integration_tokens').delete().eq('user_id', userId).eq('provider', 'strava')
    return
  }
  if (ev.aspect_type === 'delete') {
    await markDeleted(admin, userId, ev.object_id)
    return
  }
  const ok = await importActivity(admin, userId, ev.object_id)
  console.log('webhook:', ev.aspect_type, ev.object_id, ok ? 'zaimportowana' : 'pominięta')
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
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
