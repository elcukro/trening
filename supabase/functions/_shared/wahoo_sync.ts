/**
 * Jazdy z Wahoo jako źródło dla AI (docs/33 § 7): podsumowania → `wahoo_workouts`, plik FIT → metryki i próbki
 * (`wahoo_streams`), potem notatka trenera i mail po treningu. Tylko Deno; czysta część w `wahoo_summary.ts`,
 * `fit.ts` i `metrics.ts`.
 *
 * Wywołują: `wahoo-push {mode: 'completed'}` (aplikacja), `wahoo-push {mode: 'cron'}` (pg_cron co 30 min),
 * `strava-webhook` po imporcie jazdy (Strava dostaje jazdę od Wahoo, więc to dobry sygnał „jazda się skończyła”).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { decodeFit, fitToStreams } from './fit.ts'
import { hrHistogram, resample, rideMetrics } from './metrics.ts'
import { accessTokenFor, listWorkoutsDetailed } from './wahoo.ts'
import { completedInRange, fitUrl, summaryToRow, warsawDate, type WahooSummary, type WahooWorkoutRaw } from './wahoo_summary.ts'

/** Plik FIT nie liczy się do limitów Wahoo, ale nie ściągamy go bez końca: ≤ 8 MB, 20 s. */
const FIT_MAX_BYTES = 8 * 1024 * 1024

export async function fetchFit(url: string): Promise<Uint8Array> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`fit ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > FIT_MAX_BYTES) throw new Error(`fit za duży: ${buf.byteLength} B`)
    return buf
  } finally {
    clearTimeout(timer)
  }
}

/** Plik FIT → metryki w `wahoo_workouts` i próbki w `wahoo_streams`. Błąd zapisuje w `fit_error` (bez ponawiania w kółko). */
export async function ingestFit(admin: SupabaseClient, userId: string, workoutId: number, summary: WahooSummary | null): Promise<'ok' | 'brak pliku' | string> {
  const url = fitUrl(summary)
  if (!url) return 'brak pliku'
  try {
    const streams = fitToStreams(decodeFit(await fetchFit(url)))
    const samples = resample(streams, 5)
    if (!streams || !samples) throw new Error('plik bez próbek')
    const deviceWatts = !!samples.watts?.some((w) => (w ?? 0) > 0)
    const { avg_cadence_moving, ...metrics } = rideMetrics(samples, deviceWatts)
    const hrs = (streams.heartrate?.data ?? []) as (number | null)[]
    const maxHr = hrs.reduce<number | null>((m, v) => (v != null && v > 0 && v < 250 && (m == null || v > m) ? v : m), null)
    const update: Record<string, unknown> = {
      ...metrics,
      device_watts: deviceWatts,
      hr_histogram: hrHistogram(streams),
      max_hr: maxHr,
      has_streams: true,
      fit_error: null,
      updated_at: new Date().toISOString(),
    }
    if (avg_cadence_moving != null) update.avg_cadence = avg_cadence_moving
    const { n, dt, ...rest } = samples
    const { error: e1 } = await admin.from('wahoo_streams').upsert({ workout_id: workoutId, user_id: userId, dt, n, samples: rest, updated_at: new Date().toISOString() }, { onConflict: 'workout_id' })
    if (e1) throw new Error(`wahoo_streams: ${e1.message}`)
    const { error: e2 } = await admin.from('wahoo_workouts').update(update).eq('user_id', userId).eq('id', workoutId)
    if (e2) throw new Error(`wahoo_workouts: ${e2.message}`)
    return 'ok'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin.from('wahoo_workouts').update({ fit_error: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', workoutId)
    return msg
  }
}

/** Zapis listy z Wahoo; zwraca identyfikatory jazd, którym brakuje próbek albo notatki (do dalszej obróbki). */
export async function saveCompleted(admin: SupabaseClient, userId: string, rows: ReturnType<typeof completedInRange>): Promise<number[]> {
  if (!rows.length) return []
  const { data: known } = await admin.from('wahoo_workouts').select('id, has_streams, fit_error, note').eq('user_id', userId).in('id', rows.map((r) => r.id))
  const byId = new Map((known ?? []).map((k) => [Number(k.id), k]))
  const todo: number[] = []
  for (const r of rows) {
    const { error } = await admin.from('wahoo_workouts').upsert({ ...r, user_id: userId, deleted_at: null, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) throw new Error(`wahoo_workouts: ${error.message}`)
    const k = byId.get(r.id)
    if (!k || (!k.has_streams && !k.fit_error) || !k.note) todo.push(r.id)
  }
  return todo
}

export interface SyncResult {
  scanned: number
  completed: number
  todo: number[]
  from: string
  to: string
  dates: string[]
}

/** Wykonane treningi z ostatnich `days` dni → baza. Dwa zapytania do Wahoo (2 strony po 50). */
export async function syncCompleted(admin: SupabaseClient, userId: string, days: number, token?: string | null): Promise<SyncResult | null> {
  const tok = token ?? (await accessTokenFor(admin, userId).catch(() => null))
  if (!tok) return null
  const to = warsawDate(new Date().toISOString())
  const from = warsawDate(new Date(Date.now() - days * 86400000).toISOString())
  const list = await listWorkoutsDetailed(tok, 2)
  const rows = completedInRange(list, from, to)
  const todo = await saveCompleted(admin, userId, rows)
  return { scanned: list.length, completed: rows.length, todo, from, to, dates: rows.map((r) => r.date) }
}

/**
 * Historia z Wahoo (zamiast 400 dni ze Stravy – docs/33 § 3): strony `/v1/workouts` od najnowszych, aż do `days` wstecz.
 * Plik FIT tylko dla jazd z ostatnich `fitDays` dni (pobranie pliku nie liczy się do limitu, ale trwa).
 */
export async function backfillWahoo(admin: SupabaseClient, userId: string, opts: { days: number; fitDays: number; maxPages: number }): Promise<{ pages: number; saved: number; fit: Record<string, number> }> {
  const tok = await accessTokenFor(admin, userId)
  if (!tok) throw new Error('not_connected')
  const from = warsawDate(new Date(Date.now() - opts.days * 86400000).toISOString())
  const fitFrom = warsawDate(new Date(Date.now() - opts.fitDays * 86400000).toISOString())
  const all: WahooWorkoutRaw[] = []
  let pages = 0
  for (let page = 1; page <= opts.maxPages; page++) {
    const batch = await listPage(tok, page)
    pages++
    all.push(...batch)
    const oldest = batch.at(-1)?.starts
    if (batch.length < 50 || (oldest && warsawDate(oldest) < from)) break
  }
  const rows = all.map(summaryToRow).filter((r): r is NonNullable<typeof r> => !!r && r.date >= from)
  await saveCompleted(admin, userId, rows)
  const fit: Record<string, number> = {}
  const { data: need } = await admin.from('wahoo_workouts').select('id, summary').eq('user_id', userId).eq('has_streams', false).is('fit_error', null).gte('date', fitFrom).is('deleted_at', null)
  for (const w of need ?? []) {
    const r = await ingestFit(admin, userId, Number(w.id), w.summary as WahooSummary)
    fit[r] = (fit[r] ?? 0) + 1
  }
  return { pages, saved: rows.length, fit }
}

async function listPage(token: string, page: number): Promise<WahooWorkoutRaw[]> {
  const res = await fetch(`https://api.wahooligan.com/v1/workouts?page=${page}&per_page=50`, { headers: { authorization: `Bearer ${token}` } })
  if (res.status === 429) throw new Error('wahoo 429 – limit zapytań')
  if (!res.ok) return []
  const body = (await res.json()) as { workouts?: unknown[] } | unknown[]
  return (Array.isArray(body) ? body : (body.workouts ?? [])) as WahooWorkoutRaw[]
}
