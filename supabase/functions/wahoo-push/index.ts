/**
 * wahoo-push – wysyłka zaplanowanych treningów na Bolta.
 * POST {items: PushItem[]} z JWT użytkownika. Plan JSON buduje aplikacja (silnik planu jest jeden,
 * w `src/engine/wahoo.ts`), tutaj zostaje tylko OAuth i rozmowa z Wahoo.
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { accessTokenFor, diagnose, getWorkout, pushDay, removeDay, type PlanIndex, type PushItem, type PushResult } from '../_shared/wahoo.ts'

const MAX_ITEMS = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => ({}))) as { items?: PushItem[]; mode?: 'update' | 'replace' | 'diagnose' }
  const items = (body.items ?? []).slice(0, MAX_ITEMS)
  if (items.length === 0) return json({ error: 'no_items' }, 400)

  const admin = adminClient()
  const token = await accessTokenFor(admin, user.id).catch((e) => {
    throw new Error(`token: ${e instanceof Error ? e.message : e}`)
  })
  if (!token) return json({ error: 'not_connected' }, 400)

  const { data: existing } = await admin.from('wahoo_pushes').select('date, wahoo_plan_id, wahoo_workout_id').eq('user_id', user.id).in('date', items.map((i) => i.date))
  const byDate = new Map((existing ?? []).map((r) => [r.date as string, r]))
  // kopia na potrzeby zapisu – `byDate` bywa modyfikowane przez tryb „od zera”
  const existingIds = new Map((existing ?? []).map((r) => [r.date as string, { plan: r.wahoo_plan_id as number | null, workout: r.wahoo_workout_id as number | null }]))

  if (body.mode === 'diagnose') {
    const first = items[0]!
    const { data: row } = await admin.from('wahoo_pushes').select('wahoo_workout_id').eq('user_id', user.id).eq('date', first.date).maybeSingle()
    const workout = row?.wahoo_workout_id ? await getWorkout(token, row.wahoo_workout_id as number) : null
    return json({ ok: true, date: first.date, variants: await diagnose(token, first), workout })
  }

  // Tryb „od zera”: kasujemy sam trening i tworzymy go na nowo. Plan zostaje i jest nadpisywany,
  // bo kasowanie go kosztowałoby dodatkowe zapytanie, a limity sandboxa Wahoo są ciasne
  // (25 zapytań / 5 min, 100 / h, 250 / dzień).
  if (body.mode === 'replace') {
    for (const [date, row] of byDate) {
      if (row.wahoo_workout_id) await removeDay(token, { wahoo_plan_id: null, wahoo_workout_id: row.wahoo_workout_id as number }).catch((e) => console.warn('usuwanie', e))
      byDate.set(date, { ...row, wahoo_workout_id: null })
    }
  }

  const results: PushResult[] = []
  const planIndex: PlanIndex = { map: null } // lista planów z Wahoo pobierana najwyżej raz
  let rateLimited = false
  for (const [index, item] of items.entries()) {
    if (rateLimited) {
      results.push({ date: item.date, status: 'error', error: 'pominięte – limit zapytań Wahoo' })
      continue
    }
    let result: PushResult
    try {
      // weryfikujemy powiązanie planu tylko przy pierwszym dniu – to dodatkowe zapytanie
      result = await pushDay(token, item, byDate.get(item.date) ?? null, { verify: index === 0, planIndex })
    } catch (e) {
      result = { date: item.date, status: 'error', error: String(e instanceof Error ? e.message : e).slice(0, 200) }
    }
    // przy wyczerpanym limicie nie ma sensu dobijać się kolejnymi dniami
    if (result.status === 'error' && result.error?.includes('429')) rateLimited = true
    results.push(result)
    await admin.from('wahoo_pushes').upsert(
      {
        user_id: user.id,
        date: item.date,
        workout_id: item.workout_id,
        external_id: item.external_id,
        name: item.name,
        minutes: item.minutes,
        // przy błędzie zachowujemy to, co już znamy – wyzerowanie identyfikatorów zmusza do tworzenia
        // od nowa, a Wahoo odrzuca duplikaty external_id
        wahoo_plan_id: result.wahoo_plan_id ?? byDate.get(item.date)?.wahoo_plan_id ?? existingIds.get(item.date)?.plan ?? null,
        wahoo_workout_id: result.wahoo_workout_id ?? byDate.get(item.date)?.wahoo_workout_id ?? existingIds.get(item.date)?.workout ?? null,
        status: result.status,
        variant: result.variant ?? null,
        error: result.error ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date' },
    )
    // limity Wahoo: 25 zapytań / 5 min – rozkładamy wysyłkę w czasie
    if (items.length > 1) await new Promise((r) => setTimeout(r, 1200))
  }

  const errors = results.filter((r) => r.status === 'error')
  return json({
    ok: errors.length === 0,
    results,
    pushed: results.length - errors.length,
    variant: results.find((r) => r.variant)?.variant ?? null,
    rate_limited: rateLimited,
  })
})
