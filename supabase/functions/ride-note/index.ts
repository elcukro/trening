/**
 * ride-note – notatka trenera dla jazdy (docs/20).
 *  POST {wahoo_id | fit_id | activity_id, force?} + JWT – (od)nowa notatka dla własnej jazdy (Wahoo i plik: AI, Strava: z reguł – docs/33)
 *  POST {wahoo_id | fit_id | activity_id, secret}       – test/ocena bez sesji: sekret NOTE_TEST_SECRET (ustawiany na czas oceny)
 * Automatycznie notatkę pisze potok po jeździe (`_shared/ride_pipeline.ts`).
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { timingSafeEqual } from '../_shared/crypto.ts'
import { RIDE_TABLE, writeNote, type RideRef } from '../_shared/ai_note.ts'
import { promptFacts } from '../_shared/ride_note_prompt.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const body = (await req.json().catch(() => ({}))) as { activity_id?: number | string; wahoo_id?: number | string; fit_id?: number | string; force?: boolean; secret?: string; facts?: boolean; model?: string; dry_run?: boolean; ftp_before?: number }
  if (!body.activity_id && !body.wahoo_id && !body.fit_id) return json({ error: 'activity_id' }, 400)
  const ref: RideRef = body.wahoo_id ? { source: 'wahoo', id: body.wahoo_id } : body.fit_id ? { source: 'fit', id: body.fit_id } : { source: 'strava', id: body.activity_id! }
  const admin = adminClient()
  let userId: string | null = null
  let testMode = false
  const testSecret = Deno.env.get('NOTE_TEST_SECRET')
  if (body.secret && testSecret && timingSafeEqual(body.secret, testSecret)) {
    const { data } = await admin.from(RIDE_TABLE[ref.source]).select('user_id').eq('id', ref.id).maybeSingle()
    userId = (data?.user_id as string | undefined) ?? null
    testMode = true
  } else {
    userId = (await userFromRequest(req))?.id ?? null
  }
  if (!userId) return json({ error: 'unauthorized' }, 401)
  // wybór modelu i próba bez zapisu tylko w trybie oceny (porównanie modeli na tych samych jazdach)
  const r = await writeNote(admin, userId, ref, { force: body.force ?? true, model: testMode ? body.model : undefined, dryRun: testMode && body.dry_run, ftpBefore: testMode ? body.ftp_before : undefined })
  if (!r) return json({ error: 'not_found' }, 404)
  return json({ ok: true, note: r.note, source: r.source, detail: r.detail, ...(body.facts ? { facts: promptFacts(r.facts) } : {}) })
})
