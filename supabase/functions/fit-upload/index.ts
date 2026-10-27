/**
 * fit-upload – jazda z pliku FIT wgranego w aplikacji (docs/33 § 7a): MyWhoosh i inne aplikacje bez Wahoo.
 *  POST {file: base64, file_name?, name?} + JWT – dekoduje plik, zapisuje `fit_rides` + `fit_streams` (źródło `fit`),
 *       w tle notatka trenera (AI) i mail po treningu. Ten sam plik drugi raz → ta sama jazda (`duplicate: true`).
 *  POST {delete: id} + JWT                     – usuwa wgraną jazdę (soft delete; log dnia przelicza trigger).
 */
import { CORS, json } from '../_shared/env.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { decodeFit } from '../_shared/fit.ts'
import { FIT_UPLOAD_MAX_BYTES, fitRide, sha256Hex } from '../_shared/fit_ride.ts'
import { processFitRide } from '../_shared/ride_pipeline.ts'
import { redact } from '../_shared/provenance.ts'
import { fromStrava, sameRide } from '../_shared/rides.ts'

function fromBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/^data:[^,]*,/, ''))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const body = (await req.json().catch(() => ({}))) as { file?: unknown; file_name?: unknown; name?: unknown; delete?: unknown }
  const admin = adminClient()
  const now = () => new Date().toISOString()

  if (body.delete != null) {
    const id = Number(body.delete)
    if (!Number.isFinite(id)) return json({ error: 'id' }, 400)
    const { data, error } = await admin.from('fit_rides').update({ deleted_at: now(), updated_at: now() }).eq('user_id', user.id).eq('id', id).select('id')
    if (error) return json({ error: redact(error.message) }, 500)
    return data?.length ? json({ ok: true }) : json({ error: 'not_found' }, 404)
  }

  if (typeof body.file !== 'string') return json({ error: 'Wybierz plik .fit' }, 400)
  if (body.file.length > Math.ceil((FIT_UPLOAD_MAX_BYTES * 4) / 3) + 64) return json({ error: 'Plik jest za duży (do 8 MB)' }, 413)
  const bytes = fromBase64(body.file)
  if (!bytes) return json({ error: 'Nie udało się odczytać pliku' }, 400)
  const fileName = typeof body.file_name === 'string' ? body.file_name.slice(0, 120) : null
  let ride: ReturnType<typeof fitRide>
  try {
    ride = fitRide(decodeFit(bytes), { name: typeof body.name === 'string' ? body.name : null, fileName })
  } catch {
    return json({ error: 'To nie jest plik FIT' }, 422)
  }
  if (!ride) return json({ error: 'W pliku nie ma jazdy (za mało próbek albo ruchu)' }, 422)

  const sha = await sha256Hex(bytes)
  const { data: known } = await admin.from('fit_rides').select('id, date, deleted_at').eq('user_id', user.id).eq('file_sha256', sha).maybeSingle()
  let id: number
  let duplicate = false
  if (known && !known.deleted_at) {
    id = Number(known.id)
    duplicate = true
  } else {
    // wgrany ponownie po usunięciu – ten sam wiersz wraca z policzonymi na nowo metrykami
    const row = { ...ride.row, user_id: user.id, file_sha256: sha, file_name: fileName, deleted_at: null, updated_at: now() }
    const { data, error } = known
      ? await admin.from('fit_rides').update(row).eq('id', known.id).select('id').single()
      : await admin.from('fit_rides').insert(row).select('id').single()
    if (error || !data) return json({ error: `zapis: ${redact(error?.message ?? 'brak wiersza')}` }, 500)
    id = Number(data.id)
    const { n, dt, ...samples } = ride.samples
    const { error: e2 } = await admin.from('fit_streams').upsert({ ride_id: id, user_id: user.id, dt, n, samples, updated_at: now() }, { onConflict: 'ride_id' })
    if (e2) return json({ error: `próbki: ${redact(e2.message)}` }, 500)
  }

  // notatka (AI) i mail trwają kilkanaście sekund – aplikacja dostaje odpowiedź od razu, notatkę przy synchronizacji
  const work = processFitRide(admin, user.id, id)
    .then((r) => console.log('fit-upload', id, r))
    .catch((e) => console.error('fit-upload', id, redact(e)))
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work

  // bliźniak ze Stravy (MyWhoosh wysyła tam tę samą jazdę) – w widokach zastępuje go kopia z pliku (`mergeRides`)
  const { data: strava } = await admin.from('strava_activities').select('*').eq('user_id', user.id).eq('date', ride.row.date).eq('is_ride', true).is('deleted_at', null)
  const replaces = (strava ?? []).some((s) => sameRide(fromStrava(s), ride!.row))
  return json({ ok: true, id, date: ride.row.date, name: ride.row.name, moving_time_s: ride.row.moving_time_s, duplicate, replaces_strava: replaces })
})
