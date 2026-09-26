/**
 * Notatka trenera po jeździe (docs/20): fakty z bazy → Claude Haiku → weryfikacja liczb → zapis przy jeździe.
 * Tylko Deno. Jedna notatka na jazdę (zapisana w `strava_activities.note`), miesięczny limit wywołań w `ai_calls`,
 * a przy błędzie, limicie albo nieudanej weryfikacji – notatka z reguł z tych samych faktów.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { env } from './env.ts'
import type { DaySnapshot } from './email_views.ts'
import { numbersOk, rideFacts, type History, type RideFacts, type RideRowLite, type StoredSamples } from './ride_facts.ts'
import { COACH_HANDBOOK, promptFacts, ruleNote, userMessage, wordCount } from './ride_note_prompt.ts'

// Sonnet: w ocenie 26.09 (9 jazd, docs/20) wyraźnie lepszy od Haiku – dobrze czyta skale check-inu i ustalenia o zawodniku;
// koszt ok. 1 grosza za notatkę. Zmiana bez wdrożenia: sekret AI_MODEL.
const MODEL = Deno.env.get('AI_MODEL') ?? 'claude-sonnet-5'
const MONTHLY_LIMIT = Number(Deno.env.get('AI_MONTHLY_LIMIT') ?? '300')

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

const num = (x: unknown) => (x == null ? null : Number(x))

/** Fakty o jeździe z bazy: jazda, próbki, migawka planu, historia. */
export async function gatherFacts(admin: SupabaseClient, userId: string, activityId: number | string): Promise<{ facts: RideFacts; ride: Record<string, unknown> } | null> {
  const { data: a } = await admin.from('strava_activities').select('*').eq('user_id', userId).eq('id', activityId).maybeSingle()
  if (!a || !a.is_ride || a.deleted_at) return null
  const date = a.date as string
  const [{ data: st }, { data: snapRow }, { data: others }, { data: ci }, { data: log }] = await Promise.all([
    admin.from('strava_streams').select('dt, samples').eq('activity_id', activityId).maybeSingle(),
    admin.from('email_days').select('payload').eq('user_id', userId).eq('date', date).maybeSingle(),
    admin.from('strava_activities').select('id, date, moving_time_s, mmp_w, np_w, avg_hr, note_facts').eq('user_id', userId).eq('is_ride', true).is('deleted_at', null).gte('date', addDays(date, -90)).lte('date', date).neq('id', activityId),
    admin.from('checkins').select('sleep, legs, motivation, resting_hr').eq('user_id', userId).eq('date', date).is('deleted_at', null).maybeSingle(),
    admin.from('session_logs').select('rpe').eq('user_id', userId).eq('date', date).eq('kind', 'bike').is('deleted_at', null).maybeSingle(),
  ])
  const snap = (snapRow?.payload as DaySnapshot | undefined) ?? null

  const mmp90: Record<string, number | null> = {}
  for (const o of others ?? []) {
    for (const [k, v] of Object.entries((o.mmp_w as Record<string, number | null> | null) ?? {})) {
      if (v != null && (mmp90[k] == null || v > (mmp90[k] as number))) mmp90[k] = v
    }
  }

  // ostatnie wykonanie tego samego treningu: jazda z dnia, którego migawka miała ten sam workout_id
  let previous_same: History['previous_same'] = null
  const wid = snap?.context?.workout_id
  if (wid) {
    const { data: days } = await admin.from('email_days').select('date, payload').eq('user_id', userId).gte('date', addDays(date, -60)).lt('date', date).order('date', { ascending: false })
    for (const d of days ?? []) {
      if ((d.payload as DaySnapshot).context?.workout_id !== wid) continue
      const prev = (others ?? []).filter((o) => o.date === d.date).sort((x, y) => Number(y.moving_time_s) - Number(x.moving_time_s))[0]
      if (!prev) continue
      const pf = prev.note_facts as RideFacts | null
      const work = pf?.efforts?.detected ?? []
      previous_same = {
        date: d.date as string,
        np_w: num(prev.np_w),
        avg_hr: num(prev.avg_hr),
        work_avg_w: work.length ? Math.round(work.reduce((s, e) => s + e.avg_w, 0) / work.length) : null,
        work_avg_hr: work.length && work.every((e) => e.avg_hr != null) ? Math.round(work.reduce((s, e) => s + (e.avg_hr ?? 0), 0) / work.length) : null,
      }
      break
    }
  }

  const monday = mondayOf(date)
  const inWeek = [...(others ?? []), a].filter((o) => (o.date as string) >= monday && (o.date as string) <= addDays(monday, 6))
  const week = snap ? { done_min: Math.round(inWeek.reduce((s, o) => s + Number(o.moving_time_s) / 60, 0)), planned_min: snap.week_planned_min, rides: inWeek.length } : null

  const ride: RideRowLite = {
    id: a.id,
    date,
    name: a.name,
    moving_time_s: Number(a.moving_time_s),
    elapsed_time_s: Number(a.elapsed_time_s ?? a.moving_time_s),
    distance_m: Number(a.distance_m ?? 0),
    elevation_m: Number(a.elevation_m ?? 0),
    avg_hr: num(a.avg_hr),
    max_hr: num(a.max_hr),
    avg_cadence: num(a.avg_cadence),
    avg_watts: num(a.avg_watts),
    np_w: num(a.np_w),
    device_watts: a.device_watts ?? null,
    decoupling_pct: num(a.decoupling_pct),
    mmp_w: (a.mmp_w as Record<string, number | null> | null) ?? null,
  }
  const samples: StoredSamples | null = st ? { dt: Number(st.dt), ...(st.samples as Omit<StoredSamples, 'dt'>) } : null
  const facts = rideFacts(ride, samples, snap, {
    mmp90,
    previous_same,
    week,
    checkin: ci ? { sleep_1to5: num(ci.sleep), legs_1to5: num(ci.legs), motivation_1to5: num(ci.motivation), resting_hr: num(ci.resting_hr) } : null,
    rpe: num(log?.rpe),
  })
  return { facts, ride: a }
}

async function underLimit(admin: SupabaseClient): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7)
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).gte('created_at', `${month}-01`)
  return (count ?? 0) < MONTHLY_LIMIT
}

async function callClaude(system: string, user: string, model = MODEL): Promise<{ text: string; usage: Record<string, number> }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      // stały podręcznik w pamięci podręcznej – przy kolejnych jazdach płacimy za niego ułamek
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    }),
  })
  const out = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: Record<string, number>; error?: { message?: string } }
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${out.error?.message ?? ''}`)
  return { text: (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim(), usage: out.usage ?? {} }
}

export interface NoteResult {
  note: string
  source: 'ai' | 'rules'
  detail: string
  facts: RideFacts
}

/** Notatka dla jazdy: model (z jedną poprawką, gdy zmyśli liczbę) albo reguły; zapis przy jeździe. */
export async function writeNote(admin: SupabaseClient, userId: string, activityId: number | string, opts: { force?: boolean; model?: string; dryRun?: boolean; ftpBefore?: number } = {}): Promise<NoteResult | null> {
  if (!opts.force) {
    const { data: done } = await admin.from('strava_activities').select('note').eq('user_id', userId).eq('id', activityId).maybeSingle()
    if (done?.note) return null
  }
  const g = await gatherFacts(admin, userId, activityId)
  if (!g) return null
  const { facts } = g
  // korekta FTP sprzed testu (tryb oceny): gdy wynik testu wpisano do profilu przed napisaniem notatki
  if (opts.ftpBefore && facts.test) {
    facts.athlete.ftp = opts.ftpBefore
    facts.derived.ftp_change_w = facts.test.ftp_est - opts.ftpBefore
    facts.derived.ftp_change_pct = Math.round(((facts.test.ftp_est - opts.ftpBefore) / opts.ftpBefore) * 100)
  }
  const system = `${COACH_HANDBOOK}\n\nUSTALENIA O TYM ZAWODNIKU\n${facts.athlete.coach_notes.map((n) => `- ${n}`).join('\n') || '- brak'}`
  let note = ''
  let source: 'ai' | 'rules' = 'rules'
  let detail = ''
  try {
    if (!Deno.env.get('ANTHROPIC_API_KEY')) throw new Error('brak klucza')
    if (!(await underLimit(admin))) throw new Error('limit miesięczny')
    let user = userMessage(facts)
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await callClaude(system, user, opts.model ?? MODEL)
      await admin.from('ai_calls').insert({ user_id: userId, activity_id: activityId, input_tokens: r.usage.input_tokens ?? 0, output_tokens: r.usage.output_tokens ?? 0, cache_read_tokens: r.usage.cache_read_input_tokens ?? 0, cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0 })
      const check = numbersOk(r.text, promptFacts(facts))
      const words = wordCount(r.text)
      if (r.text && check.ok && words <= 70) {
        note = r.text
        source = 'ai'
        detail = `${opts.model ?? MODEL}${attempt ? ' po poprawce' : ''}`
        break
      }
      const problems = [check.ok ? null : `liczby spoza faktów: ${check.unknown.join(', ')}`, words > 70 ? `za długa: ${words} słów` : null].filter(Boolean).join('; ')
      detail = problems
      user = `${userMessage(facts)}\n\nPoprzednia wersja była odrzucona (${problems}). Napisz ją jeszcze raz: 2–3 zdania, najwyżej 55 słów, wyłącznie liczby z faktów.`
    }
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e)
  }
  if (!note) note = ruleNote(facts)
  if (opts.dryRun) return { note, source, detail, facts }
  await admin.from('strava_activities').update({ note, note_source: source, note_at: new Date().toISOString(), note_facts: facts, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', activityId)
  return { note, source, detail, facts }
}
