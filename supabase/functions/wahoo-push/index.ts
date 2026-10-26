/**
 * wahoo-push – wysyłka zaplanowanych treningów na Bolta.
 * POST {items: PushItem[]} z JWT użytkownika. Plan JSON buduje aplikacja (silnik planu jest jeden,
 * w `src/engine/wahoo.ts`), tutaj zostaje tylko OAuth i rozmowa z Wahoo.
 * Wykonane treningi (docs/33 § 7) – źródło danych dla AI:
 *  POST {mode:'completed', days?} + JWT   – jazdy z ostatnich dni → wahoo_workouts → FIT → notatka → mail
 *  POST {mode:'backfill', days?} + JWT     – historia (do 400 dni), FIT dla 90 dni, bez notatek i maili
 *  POST {mode:'cron', secret}              – pg_cron co 30 min: to samo co 'completed' (2 dni) dla kont z Wahoo
 */
import { CORS, env, json } from '../_shared/env.ts'
import { adminClient, userFromRequest, requestLang } from '../_shared/supabase.ts'
import { strings } from '../_shared/i18n.ts'
import { accessTokenFor, cleanupOrphans, diagnose, getWorkout, pushDay, removeDay, type PlanIndex, type PushItem, type PushResult } from '../_shared/wahoo.ts'
import { processWahooRides } from '../_shared/ride_pipeline.ts'
import { backfillWahoo, fillMissingFit, syncCompleted } from '../_shared/wahoo_sync.ts'

const MAX_ITEMS = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => ({}))) as { items?: PushItem[]; mode?: 'update' | 'replace' | 'diagnose' | 'cleanup' | 'completed' | 'backfill' | 'cron'; remove?: string[]; days?: number; secret?: string }
  if (body.mode === 'cron') {
    if (!body.secret || body.secret !== env('PUSH_CRON_SECRET')) return json({ error: 'unauthorized' }, 401)
    const admin = adminClient()
    const { data: linked } = await admin.from('integration_tokens').select('user_id, backfilled_at').eq('provider', 'wahoo')
    const out: Record<string, unknown> = {}
    // historia (do 400 dni) raz na konto, jedno konto na przebieg – limit Wahoo 25 zapytań / 5 min
    const pending = (linked ?? []).find((l) => !l.backfilled_at)
    if (pending) {
      try {
        out[`backfill:${pending.user_id}`] = await backfillWahoo(admin, pending.user_id as string, { days: 400, fitDays: 90, maxPages: 8, fitLimit: 10 })
        await admin.from('integration_tokens').update({ backfilled_at: new Date().toISOString() }).eq('user_id', pending.user_id as string).eq('provider', 'wahoo')
      } catch (e) {
        out[`backfill:${pending.user_id}`] = `błąd: ${e instanceof Error ? e.message : e}`
      }
    }
    for (const { user_id } of linked ?? []) {
      try {
        const r = await syncCompleted(admin, user_id as string, 2)
        // pliki FIT z historii dochodzą partiami po 5 przy każdym przebiegu
        const fit = await fillMissingFit(admin, user_id as string, 90, 5)
        out[user_id as string] = r ? { completed: r.completed, steps: await processWahooRides(admin, user_id as string, r.todo), fit } : 'brak tokenu'
      } catch (e) {
        out[user_id as string] = `błąd: ${e instanceof Error ? e.message : e}`
        // 429 = limit Wahoo – kolejne konta poczekają do następnego przebiegu
        if (String(e).includes('429')) break
      }
    }
    console.log('wahoo cron', JSON.stringify(out))
    return json({ ok: true, users: out })
  }
  const items = (body.items ?? []).slice(0, MAX_ITEMS)
  // porządkowanie nie potrzebuje listy treningów do wysłania
  const remove = (body.remove ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 14)
  if (items.length === 0 && remove.length === 0 && body.mode !== 'cleanup' && body.mode !== 'completed' && body.mode !== 'backfill') return json({ error: 'no_items' }, 400)

  const admin = adminClient()
  const token0 = await accessTokenFor(admin, user.id).catch((e) => {
    throw new Error(`token: ${e instanceof Error ? e.message : e}`)
  })
  if (!token0) return json({ error: 'not_connected' }, 400)
  const token = token0

  // Bolt w obie strony: wykonane treningi (workout_summary) z ostatnich dni → wahoo_workouts (trigger zbuduje log dnia),
  // a świeże jazdy dostają plik FIT, notatkę trenera i mail (docs/33)
  if (body.mode === 'completed') {
    const days = Math.min(30, Math.max(1, body.days ?? 7))
    const r = await syncCompleted(admin, user.id, days, token)
    if (!r) return json({ error: 'not_connected' }, 400)
    const steps = await processWahooRides(admin, user.id, r.todo)
    return json({ ok: true, scanned: r.scanned, completed: r.completed, from: r.from, to: r.to, dates: r.dates, steps })
  }
  if (body.mode === 'backfill') {
    const r = await backfillWahoo(admin, user.id, { days: Math.min(400, Math.max(7, body.days ?? 400)), fitDays: 90, maxPages: 8, fitLimit: 10 })
    return json({ ok: true, ...r })
  }

  // porządkowanie: kasuje treningi tej aplikacji, których nie ma w naszej bazie (duplikaty na liczniku)
  if (body.mode === 'cleanup') {
    const { data: known } = await admin.from('wahoo_pushes').select('wahoo_workout_id').eq('user_id', user.id)
    const keep = new Set((known ?? []).map((r) => r.wahoo_workout_id as number).filter(Boolean))
    const res = await cleanupOrphans(token, keep)
    return json({ ok: true, ...res })
  }

  // dni, które po zmianie planu nie mają już jazdy: kasujemy trening z Wahoo i wpis z bazy
  const removed: string[] = []
  if (remove.length > 0) {
    const { data: gone } = await admin.from('wahoo_pushes').select('date, wahoo_plan_id, wahoo_workout_id').eq('user_id', user.id).in('date', remove)
    for (const row of gone ?? []) {
      await removeDay(token, { wahoo_plan_id: row.wahoo_plan_id as number | null, wahoo_workout_id: row.wahoo_workout_id as number | null }).catch((e) => console.warn('usuwanie', e))
      await admin.from('wahoo_pushes').delete().eq('user_id', user.id).eq('date', row.date as string)
      removed.push(row.date as string)
    }
    if (items.length === 0) return json({ ok: true, results: [], pushed: 0, removed })
  }

  const { data: existing } = await admin.from('wahoo_pushes').select('date, external_id, wahoo_plan_id, wahoo_workout_id').eq('user_id', user.id).in('date', items.map((i) => i.date))
  const byDate = new Map((existing ?? []).map((r) => [r.date as string, r]))
  // kopia na potrzeby zapisu – `byDate` bywa modyfikowane przez tryb „od zera”
  const existingIds = new Map((existing ?? []).map((r) => [r.date as string, { plan: r.wahoo_plan_id as number | null, workout: r.wahoo_workout_id as number | null }]))

  if (body.mode === 'diagnose') {
    const first = items[0]!
    const { data: row } = await admin.from('wahoo_pushes').select('wahoo_workout_id').eq('user_id', user.id).eq('date', first.date).maybeSingle()
    const workout = row?.wahoo_workout_id ? await getWorkout(token, row.wahoo_workout_id as number) : null
    return json({ ok: true, date: first.date, variants: await diagnose(token, first), workout })
  }

  // Tryb „od zera” albo zmiana treści dnia (inny trening / wersja programu → inny external_id):
  // kasujemy sam trening i tworzymy go na nowo, bo Bolt nie pobiera ponownie pliku o tym samym
  // identyfikatorze. Plan zostaje i jest nadpisywany – kasowanie go kosztowałoby dodatkowe zapytanie,
  // a limity sandboxa Wahoo są ciasne (25 zapytań / 5 min, 100 / h, 250 / dzień).
  for (const item of items) {
    const row = byDate.get(item.date)
    if (!row?.wahoo_workout_id) continue
    const changed = row.external_id && row.external_id !== item.external_id
    if (body.mode === 'replace' || changed) {
      await removeDay(token, { wahoo_plan_id: null, wahoo_workout_id: row.wahoo_workout_id as number }).catch((e) => console.warn('usuwanie', e))
      byDate.set(item.date, { ...row, wahoo_workout_id: null })
    }
  }

  const results: PushResult[] = []
  const planIndex: PlanIndex = { map: null } // lista planów z Wahoo pobierana najwyżej raz
  let rateLimited = false
  let skipped: string | undefined // komunikat „pominięte” w języku zawodnika, liczony dopiero przy pierwszym 429
  for (const [index, item] of items.entries()) {
    if (rateLimited) {
      skipped ??= strings(await requestLang(req, admin, user.id)).errors.wahooRateSkipped
      results.push({ date: item.date, status: 'error', error: skipped })
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
    removed,
  })
})
