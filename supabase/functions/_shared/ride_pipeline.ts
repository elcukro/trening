/**
 * Co dzieje się po nowej jeździe (docs/33 § 2): kopia z Wahoo → plik FIT → notatka (AI) → mail po treningu.
 * Jazda tylko ze Stravy → notatka z reguł → mail. Tylko Deno.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { loadRide, writeNote, writeStravaTitle } from './ai_note.ts'
import { sendWorkout, warsawNow } from './email_send.ts'
import { fromWahoo, sameRide } from './rides.ts'
import { ingestFit, syncCompleted } from './wahoo_sync.ts'
import type { WahooSummary } from './wahoo_summary.ts'

/** Ile dni wstecz jazda dostaje notatkę i mail – starsze (historia, odpytanie po przerwie) tylko metryki. */
const FRESH_DAYS = 3

function daysAgo(n: number): string {
  const d = new Date(`${warsawNow().date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const errText = (e: unknown) => `błąd: ${e instanceof Error ? e.message : e}`

/** Jazdy z Wahoo po zapisie: plik FIT, potem (dla świeżych) notatka i mail. */
export async function processWahooRides(admin: SupabaseClient, userId: string, ids: number[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!ids.length) return out
  const { data } = await admin.from('wahoo_workouts').select('id, date, summary, has_streams, fit_error, note').eq('user_id', userId).in('id', ids).is('deleted_at', null)
  for (const w of data ?? []) {
    const id = Number(w.id)
    const steps: string[] = []
    if (!w.has_streams && !w.fit_error) steps.push(`fit: ${await ingestFit(admin, userId, id, w.summary as WahooSummary).catch(errText)}`)
    if ((w.date as string) >= daysAgo(FRESH_DAYS)) {
      if (!w.note) {
        const n = await writeNote(admin, userId, { source: 'wahoo', id }).catch((e) => ({ detail: errText(e), source: 'błąd' }))
        steps.push(`notatka: ${n ? `${'source' in n ? n.source : ''} ${n.detail}`.trim() : 'pominięta'}`)
      }
      steps.push(`mail: ${await sendWorkout(admin, userId, { source: 'wahoo', id }).catch(errText)}`)
    }
    out[String(id)] = steps.join(' | ')
  }
  return out
}

/**
 * Po imporcie jazdy ze Stravy (webhook „create”). Strava dostaje jazdę od Wahoo, więc najpierw dociągamy Wahoo –
 * notatka AI i mail idą z kopii Wahoo. Bez kopii: notatka z reguł i mail z danych Stravy (bez AI).
 */
export async function afterStravaImport(admin: SupabaseClient, userId: string, activityId: number): Promise<string[]> {
  const log: string[] = []
  const sync = await syncCompleted(admin, userId, 2).catch((e) => {
    log.push(`wahoo: ${errText(e)}`)
    return null
  })
  if (sync) {
    const r = await processWahooRides(admin, userId, sync.todo)
    log.push(`wahoo: ${sync.completed} jazd, ${JSON.stringify(r)}`)
  }
  const ride = await loadRide(admin, userId, { source: 'strava', id: activityId })
  if (!ride) return [...log, 'strava: nie jazda']
  const { data: sameDay } = await admin.from('wahoo_workouts').select('*').eq('user_id', userId).eq('date', ride.date).is('deleted_at', null)
  const twin = (sameDay ?? []).map((r) => fromWahoo(r)).find((w) => sameRide(w, ride))
  if (twin) {
    log.push(`strava: kopia z Wahoo ${twin.id} – notatka i mail z Wahoo`)
  } else {
    const n = await writeNote(admin, userId, { source: 'strava', id: activityId }).catch((e) => ({ detail: errText(e) }))
    log.push(`strava: notatka z reguł ${n ? n.detail : 'pominięta'}`)
    log.push(`strava: mail ${await sendWorkout(admin, userId, { source: 'strava', id: activityId }).catch(errText)}`)
  }
  const t = await writeStravaTitle(admin, userId, activityId).catch((e) => ({ detail: errText(e) }))
  log.push(`strava: tytuł ${t ? t.detail : 'pominięty (zapis na Stravę wyłączony)'}`)
  return log
}
