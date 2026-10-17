/**
 * checkin-parse – check-in jednym zdaniem (docs/21 § 2 pkt 2).
 *  POST {text, hint?: {last_weight_kg, last_resting_hr}} + JWT → {fields} – pola do podglądu w arkuszu; zapis robi aplikacja.
 * Model (ten sam co notatki, sekret AI_MODEL) tylko czyta zdanie; zakresy pilnuje kod (_shared/checkin_parse.ts).
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { callClaude, underLimit, underUserDailyLimit } from '../_shared/ai_note.ts'
import { EMPTY, isEmpty, parseReply, SYSTEM, userPrompt } from '../_shared/checkin_parse.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const body = (await req.json().catch(() => ({}))) as { text?: string; hint?: { last_weight_kg?: number | null; last_resting_hr?: number | null } }
  const text = (body.text ?? '').trim().slice(0, 500)
  if (text.length < 2) return json({ error: 'empty' }, 400)
  const admin = adminClient()
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'brak klucza' }, 503)
  if (!(await underLimit(admin))) return json({ error: 'limit miesięczny' }, 429)
  if (!(await underUserDailyLimit(admin, user.id))) return json({ error: 'limit dzienny – spróbuj jutro albo wpisz pola ręcznie' }, 429)
  // rezerwacja w ai_calls przed wywołaniem – nieudane próby też liczą się do limitu, a dwa równoległe żądania nie ominą puli
  const { data: call } = await admin.from('ai_calls').insert({ user_id: user.id, activity_id: null }).select('id').single()
  try {
    const r = await callClaude(SYSTEM, userPrompt(text, body.hint ?? {}))
    if (call) await admin.from('ai_calls').update({ input_tokens: r.usage.input_tokens ?? 0, output_tokens: r.usage.output_tokens ?? 0, cache_read_tokens: r.usage.cache_read_input_tokens ?? 0, cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0 }).eq('id', call.id)
    const fields = parseReply(r.text) ?? EMPTY
    return json({ fields, empty: isEmpty(fields) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
