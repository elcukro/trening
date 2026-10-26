/**
 * plan-tune – dopasowanie planu przez AI po onboardingu (docs/33 § 8.2).
 *  POST {inputs, templates, bounds, note?} + JWT → {tuning (surowy JSON modelu), detail}
 * Aplikacja buduje prośbę z odpowiedzi onboardingu (bez danych Stravy, bez surowych odpowiedzi zdrowotnych) i sama
 * pilnuje granic (`clampTuning`) – serwer tylko rozmawia z modelem. Limit: 10 wywołań na konto i dobę (`ai_calls`).
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { callClaude, underLimit, underUserDailyLimit } from '../_shared/ai_note.ts'
import { assertAiSafe } from '../_shared/provenance.ts'
import { parseTuneReply, sanitizeTuneRequest, TUNE_SYSTEM, tunePrompt } from '../_shared/plan_tune.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const request = sanitizeTuneRequest(await req.json().catch(() => null))
  if (!request) return json({ error: 'bad_request' }, 400)
  try {
    assertAiSafe(request)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 422)
  }
  const admin = adminClient()
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'brak klucza' }, 503)
  if (!(await underLimit(admin))) return json({ error: 'limit miesięczny' }, 429)
  if (!(await underUserDailyLimit(admin, user.id, 10))) return json({ error: 'limit dzienny – spróbuj jutro' }, 429)
  try {
    const r = await callClaude(TUNE_SYSTEM, tunePrompt(request), undefined, 4000)
    await admin.from('ai_calls').insert({ user_id: user.id, activity_id: null, input_tokens: r.usage.input_tokens ?? 0, output_tokens: r.usage.output_tokens ?? 0, cache_read_tokens: r.usage.cache_read_input_tokens ?? 0, cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0 })
    const tuning = parseTuneReply(r.text)
    if (!tuning) return json({ error: 'bad_reply', detail: `${r.stop}: ${r.text.slice(0, 200)}` }, 502)
    return json({ ok: true, tuning, detail: r.stop })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
