/**
 * ride-note – notatka trenera dla jazdy (docs/20).
 *  POST {activity_id, force?} + JWT           – (od)nowa notatka dla własnej jazdy (przycisk w aplikacji)
 *  POST {activity_id, secret}                 – test/ocena bez sesji: sekret NOTE_TEST_SECRET (ustawiany na czas oceny)
 * Automatycznie notatkę pisze strava-webhook zaraz po imporcie jazdy.
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { timingSafeEqual } from '../_shared/crypto.ts'
import { writeNote } from '../_shared/ai_note.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const body = (await req.json().catch(() => ({}))) as { activity_id?: number | string; force?: boolean; secret?: string; facts?: boolean }
  if (!body.activity_id) return json({ error: 'activity_id' }, 400)
  const admin = adminClient()
  let userId: string | null = null
  const testSecret = Deno.env.get('NOTE_TEST_SECRET')
  if (body.secret && testSecret && timingSafeEqual(body.secret, testSecret)) {
    const { data } = await admin.from('strava_activities').select('user_id').eq('id', body.activity_id).maybeSingle()
    userId = (data?.user_id as string | undefined) ?? null
  } else {
    userId = (await userFromRequest(req))?.id ?? null
  }
  if (!userId) return json({ error: 'unauthorized' }, 401)
  const r = await writeNote(admin, userId, body.activity_id, { force: body.force ?? true })
  if (!r) return json({ error: 'not_found' }, 404)
  return json({ ok: true, note: r.note, source: r.source, detail: r.detail, ...(body.facts ? { facts: r.facts } : {}) })
})
