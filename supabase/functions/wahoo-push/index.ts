/**
 * wahoo-push – wysyłka zaplanowanych treningów na Bolta.
 * POST {items: PushItem[]} z JWT użytkownika. Plan JSON buduje aplikacja (silnik planu jest jeden,
 * w `src/engine/wahoo.ts`), tutaj zostaje tylko OAuth i rozmowa z Wahoo.
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { accessTokenFor, pushDay, type PushItem, type PushResult } from '../_shared/wahoo.ts'

const MAX_ITEMS = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => ({}))) as { items?: PushItem[] }
  const items = (body.items ?? []).slice(0, MAX_ITEMS)
  if (items.length === 0) return json({ error: 'no_items' }, 400)

  const admin = adminClient()
  const token = await accessTokenFor(admin, user.id).catch((e) => {
    throw new Error(`token: ${e instanceof Error ? e.message : e}`)
  })
  if (!token) return json({ error: 'not_connected' }, 400)

  const { data: existing } = await admin.from('wahoo_pushes').select('date, wahoo_plan_id, wahoo_workout_id').eq('user_id', user.id).in('date', items.map((i) => i.date))
  const byDate = new Map((existing ?? []).map((r) => [r.date as string, r]))

  const results: PushResult[] = []
  for (const item of items) {
    let result: PushResult
    try {
      result = await pushDay(token, item, byDate.get(item.date) ?? null)
    } catch (e) {
      result = { date: item.date, status: 'error', error: String(e instanceof Error ? e.message : e).slice(0, 200) }
    }
    results.push(result)
    await admin.from('wahoo_pushes').upsert(
      {
        user_id: user.id,
        date: item.date,
        workout_id: item.workout_id,
        external_id: item.external_id,
        name: item.name,
        minutes: item.minutes,
        wahoo_plan_id: result.wahoo_plan_id ?? byDate.get(item.date)?.wahoo_plan_id ?? null,
        wahoo_workout_id: result.wahoo_workout_id ?? byDate.get(item.date)?.wahoo_workout_id ?? null,
        status: result.status,
        error: result.error ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date' },
    )
    // limity Wahoo: 25 zapytań / 5 min – rozkładamy wysyłkę w czasie
    if (items.length > 1) await new Promise((r) => setTimeout(r, 400))
  }

  const errors = results.filter((r) => r.status === 'error')
  return json({ ok: errors.length === 0, results, pushed: results.length - errors.length })
})
