/**
 * Co dzieje się po nowej jeździe (docs/33 § 2): kopia z Wahoo → plik FIT → notatka (AI) → mail po treningu.
 * Plik wgrany w aplikacji (MyWhoosh, § 7a) → notatka (AI) → mail. Jazda tylko ze Stravy → notatka z reguł → mail. Tylko Deno.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { loadRide, ownTwin, writeNote, writeStravaTitle } from './ai_note.ts'
import { sendWorkout, warsawNow } from './email_send.ts'
import { redact } from './provenance.ts'
import { ingestFit, syncCompleted } from './wahoo_sync.ts'
import type { WahooSummary } from './wahoo_summary.ts'

/** Ile dni wstecz jazda dostaje notatkę i mail – starsze (historia, odpytanie po przerwie) tylko metryki. */
const FRESH_DAYS = 3

/** Wgrany plik dostaje notatkę AI, gdy jazda jest z ostatnich dwóch tygodni (starsze – historia, tylko metryki). */
export const FIT_NOTE_DAYS = 14

function daysAgo(n: number): string {
  const d = new Date(`${warsawNow().date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const errText = (e: unknown) => `błąd: ${redact(e)}`

/** Wgrany plik po zapisie: notatka (jazda z ostatnich `FIT_NOTE_DAYS` dni – zawodnik wgrywa ją sam, często później) i mail. */
export async function processFitRide(admin: SupabaseClient, userId: string, id: number): Promise<string> {
  const ride = await loadRide(admin, userId, { source: 'fit', id })
  if (!ride) return 'brak jazdy'
  const steps: string[] = []
  if (ride.date >= daysAgo(FIT_NOTE_DAYS) && !ride.note) {
    const n = await writeNote(admin, userId, { source: 'fit', id }).catch((e) => ({ detail: errText(e), source: 'błąd' }))
    steps.push(`notatka: ${n ? `${'source' in n ? n.source : ''} ${n.detail}`.trim() : 'pominięta'}`)
  }
  steps.push(`mail: ${await sendWorkout(admin, userId, { source: 'fit', id }).catch(errText)}`)
  return steps.join(' | ')
}

/** Jazdy z Wahoo po zapisie: plik FIT, potem (dla świeżych) notatka i mail. */
export async function processWahooRides(admin: SupabaseClient, userId: string, ids: number[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!ids.length) return out
  const { data } = await admin.from('wahoo_workouts').select('id, date, summary, has_streams, fit_error, note, foreign_app_id').eq('user_id', userId).in('id', ids).is('deleted_at', null)
  for (const w of data ?? []) {
    const id = Number(w.id)
    const steps: string[] = []
    // jazda z innej aplikacji „tylko czas”: bez danych nie ma notatki ani maila – dadzą je dopiero z wgranego pliku FIT
    if (w.foreign_app_id != null && !w.has_streams) {
      out[String(id)] = 'tylko czas'
      continue
    }
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
  const twin = await ownTwin(admin, userId, ride)
  if (twin) {
    log.push(`strava: kopia ${twin.key} – notatka i mail z niej`)
  } else {
    const n = await writeNote(admin, userId, { source: 'strava', id: activityId }).catch((e) => ({ detail: errText(e) }))
    log.push(`strava: notatka z reguł ${n ? n.detail : 'pominięta'}`)
    log.push(`strava: mail ${await sendWorkout(admin, userId, { source: 'strava', id: activityId }).catch(errText)}`)
  }
  const t = await writeStravaTitle(admin, userId, activityId).catch((e) => ({ detail: errText(e) }))
  log.push(`strava: tytuł ${t ? t.detail : 'pominięty (zapis na Stravę wyłączony)'}`)
  return log
}
