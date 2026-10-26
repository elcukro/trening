/**
 * wahoo-webhook – zdarzenie `workout_summary` z Wahoo Cloud zaraz po zapisaniu jazdy na ELEMNT (docs/33 § 7).
 * Adres i token wpisuje się w portalu dewelopera Wahoo (Webhook URL, Webhook token); ten sam token w sekrecie
 * `WAHOO_WEBHOOK_TOKEN`. Wahoo nie podpisuje zdarzeń – zdarzenie bez zgodnego `webhook_token` odrzucamy.
 * Wahoo ponawia przy odpowiedzi innej niż 200 (30 min, 4 h, 24 h, 72 h) i może wysłać duplikat – zapis jest idempotentny
 * (upsert po id, notatka i mail raz na jazdę).
 *
 * Dalej to samo co odpytanie co 30 min: wiersz `wahoo_workouts` → plik FIT → notatka trenera (AI) → mail po treningu.
 */
import { json } from '../_shared/env.ts'
import { timingSafeEqual } from '../_shared/crypto.ts'
import { adminClient } from '../_shared/supabase.ts'
import { accessTokenFor, wahooUser } from '../_shared/wahoo.ts'
import { processWahooRides } from '../_shared/ride_pipeline.ts'
import { saveCompleted } from '../_shared/wahoo_sync.ts'
import { summaryToRow, type WahooSummary, type WahooWorkoutRaw } from '../_shared/wahoo_summary.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

interface WahooEvent {
  event_type?: string
  webhook_token?: string
  user?: { id?: number | string }
  workout_summary?: (WahooSummary & { workout?: WahooWorkoutRaw | null; workout_id?: number }) | null
}

/** Konto po identyfikatorze użytkownika Wahoo; konta połączone przed zapisem `athlete_id` uzupełniamy jednym zapytaniem `/v1/user`. */
async function userForWahooId(admin: SupabaseClient, wahooId: string): Promise<string | null> {
  const { data } = await admin.from('integration_tokens').select('user_id').eq('provider', 'wahoo').eq('athlete_id', wahooId).maybeSingle()
  if (data?.user_id) return data.user_id as string
  const { data: unknown } = await admin.from('integration_tokens').select('user_id').eq('provider', 'wahoo').is('athlete_id', null)
  for (const row of unknown ?? []) {
    const token = await accessTokenFor(admin, row.user_id as string).catch(() => null)
    const me = token ? await wahooUser(token).catch(() => null) : null
    if (!me?.id) continue
    await admin.from('integration_tokens').update({ athlete_id: String(me.id) }).eq('user_id', row.user_id as string).eq('provider', 'wahoo')
    if (String(me.id) === wahooId) return row.user_id as string
  }
  return null
}

async function handle(ev: WahooEvent): Promise<string> {
  const s = ev.workout_summary
  const wahooId = ev.user?.id != null ? String(ev.user.id) : null
  if (!s || !wahooId) return 'brak danych'
  const admin = adminClient()
  const userId = await userForWahooId(admin, wahooId)
  if (!userId) return `nieznany użytkownik Wahoo ${wahooId}`
  const { workout, ...summary } = s
  const raw: WahooWorkoutRaw = { ...(workout ?? { id: s.workout_id ?? 0 }), workout_summary: summary as WahooSummary }
  const row = raw.id ? summaryToRow(raw) : null
  if (!row) return 'trening bez podsumowania albo krótszy niż 5 min'
  const todo = await saveCompleted(admin, userId, [row])
  const steps = await processWahooRides(admin, userId, todo)
  return `${row.date} ${row.id}: ${JSON.stringify(steps)}`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const expected = Deno.env.get('WAHOO_WEBHOOK_TOKEN')
  if (!expected) return json({ error: 'not configured' }, 503)
  let ev: WahooEvent
  try {
    ev = await req.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  if (!ev.webhook_token || !timingSafeEqual(ev.webhook_token, expected)) return json({ error: 'not found' }, 404)
  if (ev.event_type !== 'workout_summary') return json({ ok: true, ignored: ev.event_type ?? null })
  // odpowiedź od razu, obróbka (FIT, model, mail) w tle – Wahoo ponawia przy przekroczeniu czasu
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  const work = handle(ev)
    .then((r) => console.log('wahoo-webhook:', r))
    .catch((e) => console.error('wahoo-webhook error', e))
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work
  return json({ ok: true })
})
