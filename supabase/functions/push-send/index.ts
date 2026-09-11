/**
 * push-send – powiadomienia Web Push.
 *  POST {action:'public_key'}          – klucz publiczny VAPID (bez JWT, potrzebny do subskrypcji)
 *  POST {action:'test'}                – z JWT: powiadomienie próbne na urządzenia użytkownika
 *  POST {action:'run', kind, secret}   – wywoływane przez harmonogram bazy (pg_cron) z sekretem
 */
import webpush from 'npm:web-push@3.6.7'
import { CORS, env, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SUBJECT = 'mailto:noreply@trening-inky.vercel.app'

function configure() {
  webpush.setVapidDetails(SUBJECT, env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
}

interface Sub {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface Payload {
  title: string
  body: string
  url?: string
  tag?: string
}

async function sendTo(admin: SupabaseClient, subs: Sub[], payload: Payload): Promise<{ ok: number; failed: number; detail: string[] }> {
  configure()
  let ok = 0
  let failed = 0
  const detail: string[] = []
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload))
      ok++
      await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', s.id)
    } catch (e) {
      failed++
      const err = e as { statusCode?: number; message?: string }
      const msg = `${err.statusCode ?? '?'} ${err.message ?? e}`.slice(0, 160)
      detail.push(msg)
      // 404/410 = subskrypcja wygasła (odinstalowana aplikacja, wyczyszczone dane)
      if (err.statusCode === 404 || err.statusCode === 410) {
        await admin.from('push_subscriptions').update({ deleted_at: new Date().toISOString(), last_error: msg, updated_at: new Date().toISOString() }).eq('id', s.id)
      } else {
        await admin.from('push_subscriptions').update({ last_error: msg, updated_at: new Date().toISOString() }).eq('id', s.id)
      }
    }
  }
  return { ok, failed, detail }
}

async function subsFor(admin: SupabaseClient, userId: string): Promise<Sub[]> {
  const { data } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId).is('deleted_at', null)
  return (data ?? []) as Sub[]
}

/** Data „dziś” w strefie Europe/Warsaw. */
function todayWarsaw(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const body = (await req.json().catch(() => ({}))) as { action?: string; kind?: 'morning' | 'evening'; secret?: string; title?: string; text?: string; payloads?: Record<string, Payload> }

  if (body.action === 'public_key') return json({ public_key: env('VAPID_PUBLIC_KEY') })

  // wywołanie z harmonogramu bazy – uwierzytelnione sekretem, nie JWT
  if (body.action === 'run') {
    // sekret wspólny z zadaniem cyklicznym w bazie (vault: push_cron_secret)
    if (!body.secret || body.secret !== env('PUSH_CRON_SECRET')) return json({ error: 'unauthorized' }, 401)
    const admin = adminClient()
    const kind = body.kind === 'evening' ? 'evening' : 'morning'
    const date = todayWarsaw()
    const { data: profiles } = await admin.from('profiles').select('user_id, push_enabled').eq('push_enabled', true)
    const results: Record<string, unknown>[] = []
    for (const p of profiles ?? []) {
      const userId = p.user_id as string
      const { data: already } = await admin.from('push_log').select('id').eq('user_id', userId).eq('kind', kind).eq('date', date).maybeSingle()
      if (already) continue // jedno powiadomienie danego rodzaju na dzień
      const subs = await subsFor(admin, userId)
      if (subs.length === 0) continue
      const payload = body.payloads?.[userId] ?? {
        title: kind === 'morning' ? 'Plan na dziś' : 'Odhacz dzisiejszy trening',
        body: kind === 'morning' ? 'Otwórz aplikację, żeby zobaczyć dzisiejszy trening.' : 'Zapisz, jak poszło: rower i siłownia.',
        url: '/',
        tag: `${kind}-${date}`,
      }
      const res = await sendTo(admin, subs, payload)
      await admin.from('push_log').insert({ user_id: userId, kind, date, ok: res.ok, failed: res.failed, detail: res.detail.join('; ').slice(0, 500) || null })
      results.push({ user_id: userId, ...res })
    }
    return json({ ok: true, kind, date, results })
  }

  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const admin = adminClient()

  if (body.action === 'test') {
    const subs = await subsFor(admin, user.id)
    if (subs.length === 0) return json({ error: 'no_subscriptions' }, 400)
    const res = await sendTo(admin, subs, { title: body.title ?? 'Trening', body: body.text ?? 'Powiadomienia działają.', url: '/', tag: 'test' })
    return json({ ...res, ok: res.failed === 0 })
  }

  if (body.action === 'status') {
    const subs = await subsFor(admin, user.id)
    const { data: log } = await admin.from('push_log').select('kind, date, ok, failed, sent_at').eq('user_id', user.id).order('sent_at', { ascending: false }).limit(5)
    return json({ subscriptions: subs.length, public_key: env('VAPID_PUBLIC_KEY'), log: log ?? [] })
  }

  return json({ error: 'unknown_action' }, 400)
})
