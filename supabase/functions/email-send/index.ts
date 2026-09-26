/**
 * email-send – maile treningowe (docs/19).
 *  POST {action:'cron', secret}               – harmonogram bazy (co godzinę): poranna odprawa o godzinie z profilu
 *  POST {action:'sample', kind} + JWT          – mail próbny na adres zalogowanego (Ustawienia → „Wyślij próbny”)
 *  GET|POST ?unsub=<podpisany token>           – rezygnacja jednym kliknięciem (nagłówek List-Unsubscribe)
 * Podsumowanie po treningu wysyła strava-webhook zaraz po imporcie jazdy (`sendWorkout` w _shared/email_send.ts).
 * Maile idą wyłącznie na adres właściciela konta – funkcji nie da się użyć do pisania do kogoś innego.
 */
import { CORS, APP_URL, env, json } from '../_shared/env.ts'
import { timingSafeEqual } from '../_shared/crypto.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { morningEmail, workoutEmail } from '../_shared/email_templates.ts'
import { buildWorkoutView, type DaySnapshot, type RideLite } from '../_shared/email_views.ts'
import { resend, runMorning, unsubscribe, warsawNow } from '../_shared/email_send.ts'

/** Odpowiedź na kliknięcie „wyłącz te maile”. Zwykły tekst – domena functions Supabase podaje HTML jako text/plain. */
function page(text: string): Response {
  return new Response(`Trening\n\n${text}\n\nUstawienia maili: ${APP_URL}/wiecej/ustawienia\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)
  const unsub = url.searchParams.get('unsub')
  if (unsub) {
    const kind = await unsubscribe(adminClient(), unsub)
    return page(kind ? `Wyłączone: ${kind === 'morning' ? 'poranna odprawa' : 'podsumowanie po treningu'}. Włączysz z powrotem w Ustawieniach.` : 'Link jest nieprawidłowy albo wygasł.')
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const body = (await req.json().catch(() => ({}))) as { action?: string; secret?: string; kind?: 'morning' | 'workout'; activity_id?: number | string }

  if (body.action === 'cron') {
    if (!body.secret || body.secret !== env('PUSH_CRON_SECRET')) return json({ error: 'unauthorized' }, 401)
    return json({ ok: true, ...warsawNow(), results: await runMorning(adminClient()) })
  }

  const admin = adminClient()
  let user = await userFromRequest(req)
  // próba bez sesji (ocena zmian): tymczasowy sekret EMAIL_TEST_SECRET, mail tylko do właściciela jazdy
  const testSecret = Deno.env.get('EMAIL_TEST_SECRET')
  if (!user && body.secret && testSecret && timingSafeEqual(body.secret, testSecret) && body.activity_id) {
    const { data: owner } = await admin.from('strava_activities').select('user_id').eq('id', body.activity_id).maybeSingle()
    const { data: u } = owner ? await admin.auth.admin.getUserById(owner.user_id as string) : { data: null }
    user = u?.user ? { id: u.user.id, email: u.user.email ?? null } : null
  }
  if (!user?.email) return json({ error: 'unauthorized' }, 401)

  if (body.action === 'sample') {
    const today = warsawNow().date
    if (body.kind === 'morning') {
      // najbliższy dzień z treningiem z migawek wgranych przez aplikację
      const { data } = await admin.from('email_days').select('date, payload').eq('user_id', user.id).gte('date', today).order('date').limit(14)
      const day = (data ?? []).find((d) => (d.payload as DaySnapshot).morning)
      if (!day) return json({ error: 'no_snapshot' }, 404)
      const r = await resend(user.email, morningEmail((day.payload as DaySnapshot).morning!), null, '[PRÓBA] ')
      return r.error ? json({ error: 'resend', detail: r.error }, 502) : json({ ok: true, date: day.date, to: user.email })
    }
    if (body.kind === 'workout') {
      // wskazana jazda albo ostatnia
      const q = admin.from('strava_activities').select('*').eq('user_id', user.id).eq('is_ride', true).is('deleted_at', null)
      const { data: a } = body.activity_id ? await q.eq('id', body.activity_id).maybeSingle() : await q.order('start_at', { ascending: false }).limit(1).maybeSingle()
      if (!a) return json({ error: 'no_ride' }, 404)
      const { data: snapRow } = await admin.from('email_days').select('payload').eq('user_id', user.id).eq('date', a.date).maybeSingle()
      const snap = (snapRow?.payload as DaySnapshot | undefined) ?? null
      const ride: RideLite = { date: a.date, name: a.name, moving_time_s: Number(a.moving_time_s), distance_m: Number(a.distance_m ?? 0), elevation_m: Number(a.elevation_m ?? 0), avg_hr: a.avg_hr, avg_cadence: a.avg_cadence, avg_watts: a.avg_watts, np_w: a.np_w, device_watts: a.device_watts, decoupling_pct: a.decoupling_pct == null ? null : Number(a.decoupling_pct), hr_histogram: a.hr_histogram }
      const view = buildWorkoutView(ride, snap, { athlete: '', appUrl: APP_URL, rideDateLabel: snap?.dateLabel ?? a.date, note: (a.note as string | null) ?? null })
      const r = await resend(user.email, workoutEmail(view), null, '[PRÓBA] ')
      return r.error ? json({ error: 'resend', detail: r.error }, 502) : json({ ok: true, date: a.date, to: user.email })
    }
    return json({ error: 'kind' }, 400)
  }
  return json({ error: 'action' }, 400)
})
