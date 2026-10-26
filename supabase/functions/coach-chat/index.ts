/**
 * coach-chat – „Zapytaj trenera” (docs/23). POST {messages, context} + JWT → {content, stop_reason, text, tools}.
 * Aplikacja trzyma historię (kv), buduje kontekst i wykonuje narzędzia (zapisy w Dexie, walidacja silnikiem, Bolt);
 * tu tylko rozmowa z modelem (ten sam co notatki, sekret AI_MODEL) i limity w `ai_calls`. Każda tura = jedno wywołanie.
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { callClaudeChat, underLimit, underUserDailyLimit } from '../_shared/ai_note.ts'
import { assertAiSafe } from '../_shared/provenance.ts'
import { COACH_SYSTEM, sanitizeContext, sanitizeMessages, splitAssistant, TOOLS, withContext, type Block } from '../_shared/coach_chat.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const body = (await req.json().catch(() => ({}))) as { messages?: unknown; context?: unknown }
  const messages = sanitizeMessages(body.messages)
  if (!messages.length) return json({ error: 'empty' }, 400)
  // kontekst buduje aplikacja – serwer i tak odrzuca dane Stravy (polityka API § 5.3, docs/33 § 4)
  try {
    assertAiSafe(body.context)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 422)
  }
  const admin = adminClient()
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'brak klucza' }, 503)
  if (!(await underLimit(admin))) return json({ error: 'limit miesięczny' }, 429)
  // czat zużywa więcej tur niż check-in zdaniem (narzędzie = dodatkowa tura), stąd wyższy limit dzienny
  if (!(await underUserDailyLimit(admin, user.id, 80))) return json({ error: 'limit dzienny rozmów – spróbuj jutro' }, 429)
  const { data: call } = await admin.from('ai_calls').insert({ user_id: user.id, activity_id: null }).select('id').single()
  try {
    const r = await callClaudeChat(COACH_SYSTEM, withContext(messages, sanitizeContext(body.context)), TOOLS)
    if (call) await admin.from('ai_calls').update({ input_tokens: r.usage.input_tokens ?? 0, output_tokens: r.usage.output_tokens ?? 0, cache_read_tokens: r.usage.cache_read_input_tokens ?? 0, cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0 }).eq('id', call.id)
    const content = r.content as unknown as Block[]
    const { text, tools } = splitAssistant(content)
    return json({ content, stop_reason: r.stop, text, tools })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
