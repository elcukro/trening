/**
 * Wysyłka maili treningowych (docs/19): poranna odprawa i podsumowanie po treningu.
 * Model widoku liczy aplikacja (silnik jest w TS po stronie klienta – jak plan dla Wahoo), funkcja składa szablon
 * i wysyła przez Resend **wyłącznie na adres zalogowanego użytkownika** – nie da się jej użyć do wysyłki do kogoś innego.
 *
 * POST { kind: 'morning' | 'workout', view: MorningView | WorkoutView, test?: boolean }
 */
import { CORS, env, json } from '../_shared/env.ts'
import { userFromRequest } from '../_shared/supabase.ts'
import { morningEmail, workoutEmail, type EmailOut, type MorningView, type WorkoutView } from '../_shared/email_templates.ts'

const FROM = 'Trening <trening@felsztukier.pl>'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user?.email) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => ({}))) as { kind?: string; view?: unknown; test?: boolean }
  let mail: EmailOut
  try {
    if (body.kind === 'morning') mail = morningEmail(body.view as MorningView)
    else if (body.kind === 'workout') mail = workoutEmail(body.view as WorkoutView)
    else return json({ error: 'kind' }, 400)
  } catch (e) {
    return json({ error: 'view', detail: e instanceof Error ? e.message : String(e) }, 400)
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [user.email], subject: `${body.test ? '[TEST] ' : ''}${mail.subject}`, html: mail.html, text: mail.text }),
  })
  const out = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
  if (!res.ok) return json({ error: 'resend', status: res.status, detail: out.message ?? null }, 502)
  return json({ ok: true, id: out.id ?? null, to: user.email })
})
