/**
 * meal-parse – zdjęcie posiłku albo etykiety produktu → podgląd do arkusza „Posiłek” (docs/25 § 4.4).
 *  POST {images: [1–2 × base64/data URL], note?, hint?: {protein_target}} + JWT → {meal} – zapis robi aplikacja.
 * Model przez OpenRouter (sekret OPENROUTER_API_KEY, model w MEAL_MODEL – domyślnie Gemini 3.8 Flash, wynik próby w docs/25 § 6);
 * zakresy pilnuje kod (_shared/meal_parse.ts). Zdjęć nie zapisujemy.
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { underLimit, underUserDailyLimit } from '../_shared/ai_note.ts'
import { cleanImages, parseReply, SYSTEM, userPrompt } from '../_shared/meal_parse.ts'

const MODEL = Deno.env.get('MEAL_MODEL') ?? 'google/gemini-3.8-flash'

async function callOpenRouter(images: { mime: string; data: string }[], prompt: string): Promise<{ text: string; usage: { prompt_tokens?: number; completion_tokens?: number } }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`, 'content-type': 'application/json', 'x-title': 'Trening' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: [{ type: 'text', text: prompt }, ...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))] },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  return { text: body.choices?.[0]?.message?.content ?? '', usage: body.usage ?? {} }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const body = (await req.json().catch(() => ({}))) as { images?: unknown; note?: string; hint?: { protein_target?: unknown } }
  const images = cleanImages(body.images)
  if (!images) return json({ error: 'Wyślij 1–2 zdjęcia (do ok. 1,5 MB każde)' }, 400)
  if (!Deno.env.get('OPENROUTER_API_KEY')) return json({ error: 'brak klucza' }, 503)
  const admin = adminClient()
  const { data: profile } = await admin.from('profiles').select('diet_enabled').eq('user_id', user.id).maybeSingle()
  if (!profile?.diet_enabled) return json({ error: 'Jedzenie jest wyłączone na tym koncie' }, 403)
  if (!(await underLimit(admin))) return json({ error: 'limit miesięczny' }, 429)
  if (!(await underUserDailyLimit(admin, user.id))) return json({ error: 'limit dzienny – spróbuj jutro albo wpisz posiłek ręcznie' }, 429)
  // rezerwacja w ai_calls przed wywołaniem – nieudane próby też liczą się do limitu, a dwa równoległe żądania nie ominą puli
  const { data: call } = await admin.from('ai_calls').insert({ user_id: user.id, activity_id: null }).select('id').single()
  try {
    const prompt = userPrompt(body.note, body.hint ?? {})
    let input = 0
    let output = 0
    let meal = null
    // zepsuty JSON zdarza się rzadko (1 na 15 w próbie) – jedna ponowna próba
    for (let attempt = 0; attempt < 2 && !meal; attempt++) {
      const r = await callOpenRouter(images, prompt)
      input += r.usage.prompt_tokens ?? 0
      output += r.usage.completion_tokens ?? 0
      meal = parseReply(r.text)
    }
    if (call) await admin.from('ai_calls').update({ input_tokens: input, output_tokens: output }).eq('id', call.id)
    if (!meal) return json({ error: 'Nie udało się rozpoznać – spróbuj innego zdjęcia' }, 422)
    return json({ meal, model: MODEL })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
