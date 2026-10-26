/**
 * Notatka trenera po jeździe (docs/20): fakty z bazy → Claude Haiku → weryfikacja liczb → zapis przy jeździe.
 * Tylko Deno. Jedna notatka na jazdę (zapisana w `strava_activities.note`), miesięczny limit wywołań w `ai_calls`,
 * a przy błędzie, limicie albo nieudanej weryfikacji – notatka z reguł z tych samych faktów.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { env } from './env.ts'
import { fulfilsPlan, isShortenedPlan, type DaySnapshot } from './email_views.ts'
import { historyContext, numbersOk, rideFacts, type HistRide, type History, type RideFacts, type RideRowLite, type StoredSamples } from './ride_facts.ts'
import { COACH_HANDBOOK, promptFacts, ruleNote, userMessage, wordCount } from './ride_note_prompt.ts'
import { assertAiSafe, isAiSource } from './provenance.ts'
import { fromStrava, fromWahoo, mergeRides, sameRide, type RideRow, type RideSource } from './rides.ts'
import { accessTokenFor, stravaScope, updateActivity } from './strava.ts'
import { checkDraft, isDefaultTitle, parseDraft, ruleDraft, titlePrompt, withSignature, type TitleDraft } from './strava_title.ts'

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

/** Jazda w bazie: źródło i identyfikator w tabeli źródła (docs/33 § 4). */
export interface RideRef {
  source: RideSource
  id: number | string
}

const RIDE_TABLE = { wahoo: 'wahoo_workouts', strava: 'strava_activities' } as const
const STREAM_TABLE = { wahoo: ['wahoo_streams', 'workout_id'], strava: ['strava_streams', 'activity_id'] } as const
const HIST_COLS = {
  wahoo: 'id, date, starts, name, minutes_active, moving_time_s, distance_km, ascent_m, mmp_w, np_w, avg_power, avg_hr, max_hr, avg_cadence, device_watts, decoupling_pct, hr_histogram, note, note_source, note_facts, summary',
  strava: 'id, date, start_at, name, moving_time_s, elapsed_time_s, distance_m, elevation_m, mmp_w, np_w, avg_watts, avg_hr, max_hr, avg_cadence, device_watts, decoupling_pct, hr_histogram, note, note_source, note_facts',
} as const

export async function loadRide(admin: SupabaseClient, userId: string, ref: RideRef): Promise<RideRow | null> {
  const { data } = await admin.from(RIDE_TABLE[ref.source]).select('*').eq('user_id', userId).eq('id', ref.id).maybeSingle()
  if (!data || data.deleted_at) return null
  if (ref.source === 'strava' && !data.is_ride) return null
  return ref.source === 'wahoo' ? fromWahoo(data) : fromStrava(data)
}

/**
 * Jazdy konta z zakresu dat (`from` null = od początku). Dla AI (`aiOnly`) wyłącznie Wahoo – historia ze Stravy, nawet
 * policzona przez nas, nie może trafić do modelu (polityka § 5.3). Bez AI (notatka z reguł, mail, widoki) – obie tabele
 * scalone, kopia z Wahoo wygrywa.
 */
export async function loadRidesRange(admin: SupabaseClient, userId: string, from: string | null, to: string, aiOnly: boolean): Promise<RideRow[]> {
  let w = admin.from('wahoo_workouts').select(HIST_COLS.wahoo).eq('user_id', userId).is('deleted_at', null).lte('date', to)
  let st = admin.from('strava_activities').select(HIST_COLS.strava).eq('user_id', userId).eq('is_ride', true).is('deleted_at', null).lte('date', to)
  if (from) {
    w = w.gte('date', from)
    st = st.gte('date', from)
  }
  const [{ data: wr }, s] = await Promise.all([w.order('date'), aiOnly ? Promise.resolve({ data: [] as Record<string, unknown>[] }) : st.order('date')])
  return mergeRides((wr ?? []).map((r) => fromWahoo(r as Record<string, unknown>)), ((s.data ?? []) as Record<string, unknown>[]).map(fromStrava))
}

export const loadRideHistory = (admin: SupabaseClient, userId: string, upTo: string, aiOnly: boolean): Promise<RideRow[]> => loadRidesRange(admin, userId, null, upTo, aiOnly)

/** Fakty o jeździe z bazy: jazda, próbki, migawka planu, historia. Dla jazdy z Wahoo – tylko dane spoza Stravy. */
export async function gatherFacts(admin: SupabaseClient, userId: string, ref: RideRef): Promise<{ facts: RideFacts; ride: RideRow } | null> {
  const a = await loadRide(admin, userId, ref)
  if (!a) return null
  const date = a.date
  const aiOnly = isAiSource(ref.source)
  const [streamTable, streamKey] = STREAM_TABLE[ref.source]
  const [{ data: st }, { data: snapRow }, allRows, { data: ci }, { data: log }, { data: days }, { data: tests }] = await Promise.all([
    admin.from(streamTable).select('dt, samples').eq(streamKey, ref.id).maybeSingle(),
    admin.from('email_days').select('payload').eq('user_id', userId).eq('date', date).maybeSingle(),
    // cała historia jazd do tej daty (bez próbek) – kontekst historyczny, rekordy, forma
    loadRideHistory(admin, userId, date, aiOnly),
    admin.from('checkins').select('sleep, legs, motivation, resting_hr').eq('user_id', userId).eq('date', date).is('deleted_at', null).maybeSingle(),
    // RPE wpisuje zawodnik (aplikacja, mail, czat) – to jego dane, także gdy log dnia zbudowano z jazdy Stravy
    admin.from('session_logs').select('rpe').eq('user_id', userId).eq('date', date).eq('kind', 'bike').is('deleted_at', null).maybeSingle(),
    admin.from('email_days').select('date, payload').eq('user_id', userId).gte('date', addDays(date, -180)).lt('date', date).order('date', { ascending: false }),
    admin.from('test_results').select('date, ftp_w').eq('user_id', userId).is('deleted_at', null).not('ftp_w', 'is', null).lte('date', date).order('date'),
  ])
  const snap = (snapRow?.payload as DaySnapshot | undefined) ?? null
  const isSelf = (o: RideRow) => o.key === a.key || (o.source !== a.source && sameRide(o, a))
  const others = allRows.filter((o) => !isSelf(o) && o.date >= addDays(date, -90))

  const mmp90: Record<string, number | null> = {}
  for (const o of others) {
    for (const [k, v] of Object.entries(o.mmp_w ?? {})) {
      if (v != null && (mmp90[k] == null || v > (mmp90[k] as number))) mmp90[k] = v
    }
  }

  // wcześniejsze wykonania tego samego treningu: dni, których migawka miała ten sam workout_id i była jazda ≥ połowy planu
  const wid = snap?.context?.workout_id
  const sameWorkoutDates: string[] = []
  const weekPlanned: Record<string, number> = {}
  for (const d of days ?? []) {
    const pl = d.payload as DaySnapshot
    weekPlanned[mondayOf(d.date as string)] = pl.week_planned_min
    if (wid && pl.context?.workout_id === wid && pl.planned && allRows.some((o) => o.date === d.date && o.moving_time_s >= pl.planned!.minutes * 30)) sameWorkoutDates.push(d.date as string)
  }

  const workAvg = (o: RideRow) => {
    const w = (o.note_facts as RideFacts | null)?.efforts?.detected ?? []
    return w.length ? Math.round(w.reduce((s, e) => s + e.avg_w, 0) / w.length) : null
  }
  let previous_same: History['previous_same'] = null
  if (wid) {
    for (const d of days ?? []) {
      if ((d.payload as DaySnapshot).context?.workout_id !== wid) continue
      const prev = others.filter((o) => o.date === d.date).sort((x, y) => y.moving_time_s - x.moving_time_s)[0]
      if (!prev) continue
      const work = (prev.note_facts as RideFacts | null)?.efforts?.detected ?? []
      previous_same = {
        date: d.date as string,
        np_w: prev.np_w,
        avg_hr: prev.avg_hr,
        work_avg_w: workAvg(prev),
        work_avg_hr: work.length && work.every((e) => e.avg_hr != null) ? Math.round(work.reduce((s, e) => s + (e.avg_hr ?? 0), 0) / work.length) : null,
      }
      break
    }
  }

  const monday = mondayOf(date)
  const inWeek = [...others, a].filter((o) => o.date >= monday && o.date <= addDays(monday, 6))
  const week = snap ? { done_min: Math.round(inWeek.reduce((s, o) => s + o.moving_time_s / 60, 0)), planned_min: snap.week_planned_min, rides: inWeek.length } : null

  const ride: RideRowLite = {
    id: a.id,
    date,
    name: a.name,
    moving_time_s: a.moving_time_s,
    elapsed_time_s: a.elapsed_time_s,
    distance_m: a.distance_m,
    elevation_m: a.elevation_m,
    avg_hr: a.avg_hr,
    max_hr: a.max_hr,
    avg_cadence: a.avg_cadence,
    avg_watts: a.avg_watts,
    np_w: a.np_w,
    device_watts: a.device_watts,
    decoupling_pct: a.decoupling_pct,
    mmp_w: a.mmp_w,
  }
  const samples: StoredSamples | null = st ? { dt: Number(st.dt), ...(st.samples as Omit<StoredSamples, 'dt'>) } : null
  const toHist = (o: RideRow): HistRide => ({
    id: o.id,
    date: o.date,
    moving_time_s: o.moving_time_s,
    distance_m: o.distance_m,
    elevation_m: o.elevation_m,
    np_w: o.np_w,
    avg_watts: o.avg_watts,
    avg_hr: o.avg_hr,
    device_watts: o.device_watts,
    decoupling_pct: o.decoupling_pct,
    work_avg_w: workAvg(o),
  })
  const context = historyContext({
    rides: [...allRows.filter((o) => !isSelf(o)), a].sort((x, y) => x.date.localeCompare(y.date)).map(toHist),
    current: toHist(a),
    ftp: snap?.ftp ?? null,
    lthr: snap?.lthr ?? null,
    weekPlanned,
    sameWorkoutDates,
    tests: (tests ?? []).map((t) => ({ date: t.date as string, ftp_w: Number(t.ftp_w) })),
  })
  // Czy ta jazda to zaplanowany trening dnia? Tak, gdy wypełnia plan (≥ 80 %) albo jest skróconym treningiem: ≥ 50 % planu
  // i najdłuższa jazda tego dnia (21.10.2026 – 43 z 60 min Z2 trafiło do notatki jako „44 minuty poza planem”).
  // Krótsze jazdy (dojazd, rozjazd) idą bez porównania z planem.
  const movingS = a.moving_time_s
  const longestToday = !allRows.some((o) => o.date === date && !isSelf(o) && o.moving_time_s > movingS)
  const isPlanned = !!snap?.planned && (fulfilsPlan(movingS, snap.planned.minutes) || (longestToday && isShortenedPlan(movingS, snap.planned.minutes)))
  const snapForFacts = snap?.planned && !isPlanned ? { ...snap, planned: null, context: null } : snap
  const facts = rideFacts(ride, samples, snapForFacts, {
    mmp90,
    previous_same,
    week,
    checkin: ci ? { sleep_1to5: num(ci.sleep), legs_1to5: num(ci.legs), motivation_1to5: num(ci.motivation), resting_hr: num(ci.resting_hr) } : null,
    rpe: num(log?.rpe),
    context,
    next_planned: snap?.next ?? null,
  })
  return { facts, ride: a }
}

/** Limit na użytkownika i dobę (ręczne wywołania: check-in zdaniem) – jedno konto nie wyczerpie wspólnej puli. */
export async function underUserDailyLimit(admin: SupabaseClient, userId: string, max = 40): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since)
  return (count ?? 0) < max
}

export async function underLimit(admin: SupabaseClient): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7)
  const { count } = await admin.from('ai_calls').select('id', { count: 'exact', head: true }).gte('created_at', `${month}-01`)
  return (count ?? 0) < MONTHLY_LIMIT
}

export async function callClaude(system: string, user: string, model = MODEL, maxTokens = 4000): Promise<{ text: string; usage: Record<string, number>; stop: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      // modele Claude 5 „myślą” przed odpowiedzią i to myślenie liczy się do max_tokens – przy max_tokens 500 zjadało cały
      // limit (odpowiedź bez bloku tekstu, stop_reason max_tokens). Wyłączyć się nie da („thinking.type.disabled” odrzucane),
      // więc: niski wysiłek i zapas tokenów na myślenie.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      // stały podręcznik w pamięci podręcznej – przy kolejnych jazdach płacimy za niego ułamek
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    }),
  })
  const out = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: Record<string, number>; stop_reason?: string; error?: { message?: string } }
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${out.error?.message ?? ''}`)
  const text = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim()
  return { text, usage: out.usage ?? {}, stop: `${out.stop_reason ?? '?'}${text ? '' : ` (bloki: ${(out.content ?? []).map((c) => c.type).join(',') || 'brak'})`}` }
}

/**
 * Rozmowa z narzędziami (czat „Zapytaj trenera”): pełna historia wiadomości i definicje narzędzi; zwraca surowe bloki
 * odpowiedzi (tekst, tool_use, bloki myślenia z podpisem – muszą wrócić w kontynuacji) i powód zatrzymania.
 */
export async function callClaudeChat(system: string, messages: readonly unknown[], tools: readonly unknown[], model = MODEL, maxTokens = 3000): Promise<{ content: Record<string, unknown>[]; usage: Record<string, number>; stop: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages,
    }),
  })
  const out = (await res.json()) as { content?: Record<string, unknown>[]; usage?: Record<string, number>; stop_reason?: string; error?: { message?: string } }
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${out.error?.message ?? ''}`)
  return { content: out.content ?? [], usage: out.usage ?? {}, stop: out.stop_reason ?? '?' }
}

export interface NoteResult {
  note: string
  source: 'ai' | 'rules'
  detail: string
  facts: RideFacts
}

/**
 * Notatka dla jazdy: model (z jedną poprawką, gdy zmyśli liczbę) albo reguły; zapis przy jeździe.
 * **Model tylko dla jazd z Wahoo** (docs/33): jazda ze Stravy dostaje zawsze notatkę z reguł – polityka API Stravy
 * § 5.3/5.10 zakazuje przekazywania jej danych (także pochodnych) do AI.
 */
export async function writeNote(admin: SupabaseClient, userId: string, ref: RideRef, opts: { force?: boolean; model?: string; dryRun?: boolean; ftpBefore?: number } = {}): Promise<NoteResult | null> {
  const table = RIDE_TABLE[ref.source]
  if (!opts.force) {
    const { data: done } = await admin.from(table).select('note').eq('user_id', userId).eq('id', ref.id).maybeSingle()
    if (done?.note) return null
  }
  const g = await gatherFacts(admin, userId, ref)
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
    if (!isAiSource(ref.source)) throw new Error('jazda ze Stravy – notatka z reguł (polityka API § 5.3)')
    if (!Deno.env.get('ANTHROPIC_API_KEY')) throw new Error('brak klucza')
    if (!(await underLimit(admin))) throw new Error('limit miesięczny')
    assertAiSafe(promptFacts(facts))
    let user = userMessage(facts)
    // trzy podejścia: pierwsza wersja, poprawka z listą błędów, jeszcze jedna – dopiero potem notatka z reguł
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await callClaude(system, user, opts.model ?? MODEL)
      await admin.from('ai_calls').insert({ user_id: userId, activity_id: Number(ref.id), input_tokens: r.usage.input_tokens ?? 0, output_tokens: r.usage.output_tokens ?? 0, cache_read_tokens: r.usage.cache_read_input_tokens ?? 0, cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0 })
      const check = numbersOk(r.text, promptFacts(facts))
      const words = wordCount(r.text)
      if (r.text && check.ok && words >= 60 && words <= 160) {
        note = r.text
        source = 'ai'
        detail = `${opts.model ?? MODEL}${attempt ? ' po poprawce' : ''}`
        break
      }
      const problems = [check.ok ? null : `liczby spoza faktów: ${check.unknown.join(', ')}`, words > 160 ? `za długa: ${words} słów` : words < 60 ? `za krótka: ${words} słów` : null].filter(Boolean).join('; ')
      // odrzucony szkic zostaje w szczegółach – bez tego nie da się stroić podręcznika
      detail = `${problems} | szkic: ${r.text.slice(0, 700)}`
      user = `${userMessage(facts)}\n\nPoprzednia wersja była odrzucona (${problems}). Napisz ją jeszcze raz: jeden akapit, 6 zdań, 90–120 słów – krótkie zdania, bez wtrąceń w nawiasach; wyłącznie liczby z faktów (porównania tylko z „derived”, bez własnych odejmowań ani dat spoza faktów).`
    }
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e)
  }
  if (!note) note = ruleNote(facts)
  if (opts.dryRun) return { note, source, detail, facts }
  await admin.from(table).update({ note, note_source: source, note_at: new Date().toISOString(), note_facts: facts, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', ref.id)
  return { note, source, detail, facts }
}

/** Zapis na Stravę wyłączony, dopóki Strava nie potwierdzi, że wolno (docs/33 § 6): sekret `STRAVA_WRITE_ENABLED=1`. */
export const stravaWriteEnabled = (): boolean => Deno.env.get('STRAVA_WRITE_ENABLED') === '1'

export interface TitleResult {
  title: string
  description: string
  source: 'ai' | 'rules'
  detail: string
}

/**
 * Tytuł i opis jazdy na Stravie (docs/20 § Tytuł na Stravie). Tylko gdy profil ma `strava_write`, zgoda obejmuje
 * `activity:write`, tytuł jest domyślny (Strava albo nazwa z Bolta) i nic jeszcze nie wysłaliśmy (`title_set_at`).
 * Zwraca null, gdy pominięto. Podpis „Notatki: Kolarski Trener AI” dopisuje kod.
 */
export async function writeStravaTitle(admin: SupabaseClient, userId: string, activityId: number | string, opts: { model?: string; dryRun?: boolean } = {}): Promise<TitleResult | null> {
  if (!stravaWriteEnabled() && !opts.dryRun) return null
  const [{ data: profile }, scope] = await Promise.all([admin.from('profiles').select('strava_write').eq('user_id', userId).maybeSingle(), stravaScope(admin, userId)])
  if (!profile?.strava_write) return null
  if (!scope.includes('activity:write')) return { title: '', description: '', source: 'rules', detail: 'brak zgody activity:write – połącz Stravę ponownie' }
  const { data: a } = await admin.from('strava_activities').select('name, note, title_set_at, date').eq('user_id', userId).eq('id', activityId).maybeSingle()
  if (!a || a.title_set_at) return null
  const stravaRide = await loadRide(admin, userId, { source: 'strava', id: activityId })
  if (!stravaRide) return null
  // tekst modelu tylko z faktów kopii z Wahoo – Strava służy wyłącznie do wskazania jazdy i sprawdzenia tytułu
  const { data: twins } = await admin.from('wahoo_workouts').select('*').eq('user_id', userId).eq('date', a.date as string).is('deleted_at', null)
  const twin = (twins ?? []).map((r) => fromWahoo(r)).find((w) => sameRide(w, stravaRide)) ?? null
  const g = await gatherFacts(admin, userId, twin ? { source: 'wahoo', id: twin.id } : { source: 'strava', id: activityId })
  if (!g) return null
  const { facts } = g
  const twinNote = twin?.note ?? null
  const { data: pushed } = await admin.from('wahoo_pushes').select('name').eq('user_id', userId).eq('date', a.date as string)
  if (!isDefaultTitle(a.name as string, facts.plan?.name, (pushed ?? []).map((p) => p.name as string).filter(Boolean))) {
    return { title: '', description: '', source: 'rules', detail: `własny tytuł zawodnika zostaje: ${a.name}` }
  }
  let draft: TitleDraft | null = null
  let source: 'ai' | 'rules' = 'rules'
  let detail = ''
  try {
    if (!twin) throw new Error('brak kopii z Wahoo – tytuł z reguł (polityka API § 5.3)')
    if (!Deno.env.get('ANTHROPIC_API_KEY')) throw new Error('brak klucza')
    if (!(await underLimit(admin))) throw new Error('limit miesięczny')
    assertAiSafe(promptFacts(facts))
    const system = `${COACH_HANDBOOK}\n\nUSTALENIA O TYM ZAWODNIKU\n${facts.athlete.coach_notes.map((n) => `- ${n}`).join('\n') || '- brak'}`
    let user = titlePrompt(facts, twinNote)
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await callClaude(system, user, opts.model ?? MODEL)
      await admin.from('ai_calls').insert({ user_id: userId, activity_id: activityId, input_tokens: r.usage.input_tokens ?? 0, output_tokens: r.usage.output_tokens ?? 0, cache_read_tokens: r.usage.cache_read_input_tokens ?? 0, cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0 })
      const parsed = parseDraft(r.text)
      const check = parsed ? checkDraft(parsed, facts) : { ok: false, problems: ['zły format – brak linii Tytuł:/Opis:'] }
      if (parsed && check.ok) {
        draft = parsed
        source = 'ai'
        detail = `${opts.model ?? MODEL}${attempt ? ' po poprawce' : ''}`
        break
      }
      detail = `${check.problems.join('; ')} | szkic: ${r.text.slice(0, 300)}`
      user = `${titlePrompt(facts, twinNote)}\n\nPoprzednia wersja była odrzucona (${check.problems.join('; ')}). Napisz jeszcze raz, dokładnie w dwóch liniach „Tytuł:” i „Opis:”.`
    }
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e)
  }
  if (!draft) draft = ruleDraft(facts)
  const description = withSignature(draft.description)
  if (opts.dryRun) return { title: draft.title, description, source, detail }
  const token = await accessTokenFor(admin, userId)
  if (!token) return { title: draft.title, description, source, detail: 'brak tokenu Stravy' }
  await updateActivity(token, activityId, { name: draft.title, description })
  await admin.from('strava_activities').update({ name: draft.title, title_set_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', activityId)
  return { title: draft.title, description, source, detail }
}
