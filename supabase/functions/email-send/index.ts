/**
 * email-send – maile treningowe (docs/19).
 *  POST {action:'cron', secret}               – harmonogram bazy (co godzinę): poranna odprawa o godzinie z profilu,
 *                                                o 21:00 wieczorne „Dzień w liczbach” (jazdy, o których nie było maila)
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
import { applyLegs, applyRpe, EVENING_HOUR, gatherWeek, resend, runEvening, runMorning, runWeekly, sendWeekly, unsubscribe, warsawNow, WEEKLY_HOUR, writeLetter } from '../_shared/email_send.ts'
import { mondayOf } from '../_shared/week_facts.ts'

/** Odpowiedź na kliknięcie „wyłącz te maile”. Zwykły tekst – domena functions Supabase podaje HTML jako text/plain. */
function page(text: string): Response {
  return new Response(`Trening\n\n${text}\n\nUstawienia maili: ${APP_URL}/wiecej/ustawienia\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

const escapeHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** Mała strona po kliknięciu w link z maila (otwiera się w przeglądarce telefonu). */
function htmlPage(title: string, text: string, link: string): Response {
  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trening</title>
<style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#f1f5f9;color:#0f172a;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
main{background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;text-align:center;box-shadow:0 1px 3px rgba(15,23,42,.08)}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;color:#475569;line-height:1.5}
a{display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><a href="${escapeHtml(link)}">Otwórz aplikację</a></main></body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)
  const unsub = url.searchParams.get('unsub')
  if (unsub) {
    const kind = await unsubscribe(adminClient(), unsub)
    return page(kind ? `Wyłączone: ${kind === 'morning' ? 'poranna odprawa' : 'podsumowanie po treningu'}. Włączysz z powrotem w Ustawieniach.` : 'Link jest nieprawidłowy albo wygasł.')
  }
  const rpeToken = url.searchParams.get('rpe')
  if (rpeToken) {
    const r = await applyRpe(adminClient(), rpeToken)
    if (!r) return htmlPage('Link nieprawidłowy', 'Ten link jest uszkodzony albo pochodzi z innego konta.', APP_URL)
    if (!r.ok) return htmlPage('Nie zapisano', `RPE ${r.rpe} dla ${r.date}: ${r.reason}.`, `${APP_URL}/dzien/${r.date}`)
    return htmlPage(`Zapisano RPE ${r.rpe}`, `Ocena jazdy z ${r.date} trafiła do dziennika. Możesz kliknąć inną liczbę, żeby ją poprawić.`, `${APP_URL}/dzien/${r.date}`)
  }
  const legsToken = url.searchParams.get('legs')
  if (legsToken) {
    const r = await applyLegs(adminClient(), legsToken)
    if (!r) return htmlPage('Link nieprawidłowy', 'Ten link jest uszkodzony albo pochodzi z innego konta.', APP_URL)
    if (!r.ok) return htmlPage('Nie zapisano', `Nogi ${r.legs}/5 dla ${r.date}: ${r.reason}.`, `${APP_URL}/i`)
    return htmlPage(`Zapisano: nogi ${r.legs}/5`, `Check-in z ${r.date} ma ocenę nóg. Wagę, tętno spoczynkowe i sen dopisz w aplikacji.`, `${APP_URL}/i`)
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const body = (await req.json().catch(() => ({}))) as { action?: string; secret?: string; kind?: 'morning' | 'workout' | 'weekly'; activity_id?: number | string; subject_prefix?: string; dry?: boolean }

  if (body.action === 'cron') {
    if (!body.secret || body.secret !== env('PUSH_CRON_SECRET')) return json({ error: 'unauthorized' }, 401)
    const now = warsawNow()
    const admin = adminClient()
    const results = await runMorning(admin)
    const evening = now.hour === EVENING_HOUR ? await runEvening(admin, now.date) : null
    const sunday = new Date(`${now.date}T00:00:00Z`).getUTCDay() === 0
    const weekly = sunday && now.hour === WEEKLY_HOUR ? await runWeekly(admin, now.date) : null
    return json({ ok: true, ...now, results, evening, weekly })
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
      // domyślnie „[PRÓBA]”; w trybie oceny można wysłać jako zwykły mail (np. analiza testu na prośbę zawodnika)
      const r = await resend(user.email, workoutEmail(view), null, body.subject_prefix ?? '[PRÓBA] ')
      return r.error ? json({ error: 'resend', detail: r.error }, 502) : json({ ok: true, date: a.date, to: user.email })
    }
    if (body.kind === 'weekly') {
      const monday = mondayOf(today)
      // tryb oceny: sam list i powód odrzucenia szkicu, bez maila (strojenie promptu)
      if (body.dry) {
        const facts = await gatherWeek(admin, user.id, monday)
        const r = await writeLetter(admin, user.id, facts)
        return json({ monday, ...r, flags: facts.flags })
      }
      // list za bieżący tydzień (albo poprzedni, gdy bieżący jeszcze pusty) – próba idzie bez wpisu w email_log
      const r = await sendWeekly(admin, user.id, monday, { force: true, subjectPrefix: '[PRÓBA] ' })
      const r2 = r === 'pusty tydzień' ? await sendWeekly(admin, user.id, mondayOf(today) < monday ? monday : new Date(new Date(`${monday}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10), { force: true, subjectPrefix: '[PRÓBA] ' }) : r
      return r2.startsWith('wysłane') ? json({ ok: true, to: user.email, detail: r2 }) : json({ error: 'weekly', detail: r2 }, 502)
    }
    return json({ error: 'kind' }, 400)
  }
  return json({ error: 'action' }, 400)
})
