/**
 * Wysyłka maili treningowych przez Resend (docs/19). Tylko Deno (Edge Functions): baza, sekrety, podpis linku rezygnacji.
 * Każda wysyłka najpierw rezerwuje wpis w `email_log` (unikat user+rodzaj+ref) – dwa równoległe wywołania nie wyślą dwóch maili.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { APP_URL, env } from './env.ts'
import { sign, verify } from './crypto.ts'
import { morningEmail, weeklyEmail, workoutEmail, type EmailOut, type MorningView, type WeeklyView } from './email_templates.ts'
import { hm, mondayOf as mondayOfWeek, ruleLetter, weekFacts, weekPrompt, WEEK_SYSTEM, wordCount, type WeekFacts } from './week_facts.ts'
import { numbersOk } from './ride_facts.ts'
import { callClaude, underLimit } from './ai_note.ts'
import { buildWorkoutView, fulfilsPlan, type DaySnapshot, type RideLite } from './email_views.ts'

const FROM = 'Trening <trening@felsztukier.pl>'
export type EmailKind = 'morning' | 'workout' | 'weekly'

/** Data „dziś” i godzina w Europe/Warsaw. */
export function warsawNow(): { date: string; hour: number } {
  const now = new Date()
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(now)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' }).format(now))
  return { date, hour }
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Link „wyłącz te maile” – podpisany, bez logowania (wymóg Gmaila dla wiadomości cyklicznych). */
export async function unsubscribeUrl(userId: string, kind: EmailKind): Promise<string> {
  const token = await sign(`unsub:${userId}:${kind}`)
  return `${env('SUPABASE_URL')}/functions/v1/email-send?unsub=${encodeURIComponent(token)}`
}

/** Linki RPE 1–10 do maila po treningu – podpisane, bez logowania; kliknięcie zapisuje ocenę w `session_logs` (docs/19 § RPE z maila). */
export async function rpeLinks(userId: string, date: string): Promise<{ value: number; href: string }[]> {
  const base = `${env('SUPABASE_URL')}/functions/v1/email-send?rpe=`
  const out: { value: number; href: string }[] = []
  for (let v = 1; v <= 10; v++) out.push({ value: v, href: base + encodeURIComponent(await sign(`rpe:${userId}:${date}:${v}`)) })
  return out
}

/** Linki „nogi 1–5” do porannej odprawy – zapis do check-inu dnia. */
export async function legsLinks(userId: string, date: string): Promise<{ value: number; href: string }[]> {
  const base = `${env('SUPABASE_URL')}/functions/v1/email-send?legs=`
  const out: { value: number; href: string }[] = []
  for (let v = 1; v <= 5; v++) out.push({ value: v, href: base + encodeURIComponent(await sign(`legs:${userId}:${date}:${v}`)) })
  return out
}

/** Zapis „nogi” z linku: check-in dnia powstaje, jeśli go nie ma (reszta pól zostaje pusta do uzupełnienia w aplikacji). */
export async function applyLegs(admin: SupabaseClient, token: string): Promise<{ date: string; legs: number; ok: boolean; reason?: string } | null> {
  const payload = await verify(token).catch(() => null)
  const m = payload?.match(/^legs:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2}):([1-5])$/)
  if (!m) return null
  const [, userId, date, v] = m
  const legs = Number(v)
  const ageDays = (Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000
  if (ageDays > 7 || ageDays < -1) return { date: date!, legs, ok: false, reason: 'za stary link' }
  const { data: row } = await admin.from('checkins').select('id').eq('user_id', userId).eq('date', date).is('deleted_at', null).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  const now = new Date().toISOString()
  const { error } = row ? await admin.from('checkins').update({ legs, updated_at: now }).eq('id', row.id) : await admin.from('checkins').insert({ user_id: userId, date, legs, updated_at: now })
  if (error) return { date: date!, legs, ok: false, reason: error.message }
  return { date: date!, legs, ok: true }
}

/** Zapis RPE z linku: tylko dla istniejącej jazdy dnia (log z importu) i tylko do 45 dni wstecz. */
export async function applyRpe(admin: SupabaseClient, token: string): Promise<{ date: string; rpe: number; ok: boolean; reason?: string } | null> {
  const payload = await verify(token).catch(() => null)
  const m = payload?.match(/^rpe:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2}):(10|[1-9])$/)
  if (!m) return null
  const [, userId, date, rpeStr] = m
  const rpe = Number(rpeStr)
  const ageDays = (Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000
  if (ageDays > 45 || ageDays < -1) return { date: date!, rpe, ok: false, reason: 'za stary link' }
  const { data: log } = await admin.from('session_logs').select('id').eq('user_id', userId).eq('date', date).eq('kind', 'bike').is('deleted_at', null).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (!log) return { date: date!, rpe, ok: false, reason: 'brak jazdy tego dnia' }
  const { error } = await admin.from('session_logs').update({ rpe, updated_at: new Date().toISOString() }).eq('id', log.id)
  if (error) return { date: date!, rpe, ok: false, reason: error.message }
  return { date: date!, rpe, ok: true }
}

export async function unsubscribe(admin: SupabaseClient, token: string): Promise<EmailKind | null> {
  // uszkodzony token (np. obcięty w kliencie poczty) = nieprawidłowy link, nie błąd serwera
  const payload = await verify(token).catch(() => null)
  const m = payload?.match(/^unsub:([0-9a-f-]{36}):(morning|workout|weekly)$/)
  if (!m) return null
  const kind = m[2] as EmailKind
  await admin.from('profiles').update({ [`email_${kind}`]: false }).eq('user_id', m[1])
  return kind
}

export async function resend(to: string, mail: EmailOut, unsub: string | null, subjectPrefix = ''): Promise<{ id: string | null; error: string | null }> {
  const headers: Record<string, string> = {}
  if (unsub) {
    headers['List-Unsubscribe'] = `<${unsub}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: `${subjectPrefix}${mail.subject}`, html: mail.html, text: mail.text, headers }),
  })
  const out = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
  return res.ok ? { id: out.id ?? null, error: null } : { id: null, error: `${res.status} ${out.message ?? ''}`.trim() }
}

/** Rezerwacja wysyłki; false = już wysłane (albo wysyła równolegle inne wywołanie). */
async function reserve(admin: SupabaseClient, userId: string, kind: EmailKind, ref: string): Promise<boolean> {
  const { error } = await admin.from('email_log').insert({ user_id: userId, kind, ref })
  return !error
}

async function finish(admin: SupabaseClient, userId: string, kind: EmailKind, ref: string, r: { id: string | null; error: string | null }): Promise<void> {
  if (r.error) await admin.from('email_log').delete().eq('user_id', userId).eq('kind', kind).eq('ref', ref) // błąd = można spróbować znowu
  else await admin.from('email_log').update({ resend_id: r.id }).eq('user_id', userId).eq('kind', kind).eq('ref', ref)
}

async function emailOf(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId)
  return data.user?.email ?? null
}

async function snapshot(admin: SupabaseClient, userId: string, date: string): Promise<DaySnapshot | null> {
  const { data } = await admin.from('email_days').select('payload').eq('user_id', userId).eq('date', date).maybeSingle()
  return (data?.payload as DaySnapshot | undefined) ?? null
}

/** Poranna odprawa dla jednego użytkownika na dziś. */
export async function sendMorning(admin: SupabaseClient, userId: string, date: string): Promise<string> {
  const snap = await snapshot(admin, userId, date)
  const view: MorningView | null = snap?.morning ?? null
  if (!view) return 'brak treningu albo migawki'
  // jazda oznaczona z góry jako pominięta (np. góry, wyjazd) – odprawa nie ma sensu
  const { data: skipped } = await admin.from('session_logs').select('id').eq('user_id', userId).eq('date', date).eq('kind', 'bike').eq('status', 'skipped').is('deleted_at', null).limit(1)
  if (skipped?.length && snap?.planned) return 'pominięte z wyprzedzeniem'
  if (!(await reserve(admin, userId, 'morning', date))) return 'już wysłane'
  const to = await emailOf(admin, userId)
  if (!to) return 'brak adresu'
  const unsub = await unsubscribeUrl(userId, 'morning')
  const { data: ci } = await admin.from('checkins').select('legs').eq('user_id', userId).eq('date', date).is('deleted_at', null).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  view.legs = { links: await legsLinks(userId, date), current: (ci?.legs as number | null) ?? null }
  const r = await resend(to, morningEmail(view, { unsubscribeUrl: unsub }), unsub)
  await finish(admin, userId, 'morning', date, r)
  return r.error ?? 'wysłane'
}

/** Podsumowanie jazdy zaraz po imporcie – tylko świeże jazdy (bez maili przy imporcie historii). */
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

function rideLite(a: Row): RideLite {
  return {
    date: a.date,
    name: a.name,
    moving_time_s: Number(a.moving_time_s),
    distance_m: Number(a.distance_m ?? 0),
    elevation_m: Number(a.elevation_m ?? 0),
    avg_hr: a.avg_hr == null ? null : Number(a.avg_hr),
    avg_cadence: a.avg_cadence == null ? null : Number(a.avg_cadence),
    avg_watts: a.avg_watts == null ? null : Number(a.avg_watts),
    np_w: a.np_w == null ? null : Number(a.np_w),
    device_watts: a.device_watts ?? null,
    decoupling_pct: a.decoupling_pct == null ? null : Number(a.decoupling_pct),
    hr_histogram: (a.hr_histogram as number[] | null) ?? null,
  }
}

async function weekDoneMin(admin: SupabaseClient, userId: string, date: string): Promise<number> {
  const monday = mondayOf(date)
  const { data: week } = await admin.from('strava_activities').select('moving_time_s').eq('user_id', userId).eq('is_ride', true).is('deleted_at', null).gte('date', monday).lte('date', addDays(monday, 6))
  return (week ?? []).reduce((s, r) => s + Number(r.moving_time_s) / 60, 0)
}

async function currentRpe(admin: SupabaseClient, userId: string, date: string): Promise<number | null> {
  const { data } = await admin.from('session_logs').select('rpe').eq('user_id', userId).eq('date', date).eq('kind', 'bike').is('deleted_at', null).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return (data?.rpe as number | null) ?? null
}

async function sendWorkoutMail(admin: SupabaseClient, userId: string, kindRef: string, name: string, a: Row, snap: DaySnapshot | null, extras: Row[]): Promise<string> {
  const view = buildWorkoutView(rideLite(a), snap, {
    athlete: name,
    appUrl: APP_URL,
    weekDoneMin: await weekDoneMin(admin, userId, a.date as string),
    rideDateLabel: snap?.dateLabel ?? (a.date as string),
    note: (a.note as string | null) ?? null,
    extras: extras.map(rideLite),
  })
  view.rpe = { links: await rpeLinks(userId, a.date as string), current: await currentRpe(admin, userId, a.date as string) }
  const to = await emailOf(admin, userId)
  if (!to) return 'brak adresu'
  const unsub = await unsubscribeUrl(userId, 'workout')
  const r = await resend(to, workoutEmail(view, { unsubscribeUrl: unsub }), unsub)
  await finish(admin, userId, 'workout', kindRef, r)
  return r.error ?? 'wysłane'
}

/**
 * Mail zaraz po imporcie – tylko dla jazdy, która wypełnia zaplanowany trening (≥ 80 % czasu; bez planu ≥ 30 min).
 * Krótszy dojazd przed treningiem albo druga jazda dnia trafiają do wieczornego „Dzień w liczbach” (`runEvening`).
 */
export async function sendWorkout(admin: SupabaseClient, userId: string, activityId: number | string): Promise<string> {
  const { data: profile } = await admin.from('profiles').select('email_workout, name').eq('user_id', userId).maybeSingle()
  if (!profile?.email_workout) return 'wyłączone'
  const { data: a } = await admin.from('strava_activities').select('*').eq('user_id', userId).eq('id', activityId).maybeSingle()
  if (!a || !a.is_ride || a.deleted_at) return 'nie jazda'
  const today = warsawNow().date
  if ((a.date as string) < addDays(today, -2)) return 'stara jazda'
  if (Number(a.moving_time_s) < 15 * 60) return 'krótka jazda'
  const snap = await snapshot(admin, userId, a.date as string)
  if (!fulfilsPlan(Number(a.moving_time_s), snap?.planned?.minutes ?? null)) return 'czeka na wieczorne podsumowanie'
  const ref = String(activityId)
  if (!(await reserve(admin, userId, 'workout', ref))) return 'już wysłane'
  return sendWorkoutMail(admin, userId, ref, (profile.name as string) ?? '', a, snap, [])
}

/** Godzina (Europe/Warsaw) wieczornego „Dzień w liczbach”. */
export const EVENING_HOUR = 21

/**
 * Wieczorne „Dzień w liczbach” (o `EVENING_HOUR`): jeden mail z wszystkimi jazdami dnia, ale tylko gdy jest
 * jazda ≥ 15 min, o której jeszcze nie było maila. Opis i ocena względem planu dotyczą jazdy, która plan
 * wypełniła (ta z maila po treningu), a bez takiej – najdłuższej.
 */
export async function sendEvening(admin: SupabaseClient, userId: string, date: string): Promise<string> {
  const { data: profile } = await admin.from('profiles').select('email_workout, name').eq('user_id', userId).maybeSingle()
  if (!profile?.email_workout) return 'wyłączone'
  const { data: rows } = await admin.from('strava_activities').select('*').eq('user_id', userId).eq('is_ride', true).is('deleted_at', null).eq('date', date).order('start_at')
  const rides = (rows ?? []).filter((r) => Number(r.moving_time_s) >= 15 * 60)
  if (!rides.length) return 'bez jazd'
  const { data: sent } = await admin.from('email_log').select('ref').eq('user_id', userId).eq('kind', 'workout').in('ref', rides.map((r) => String(r.id)))
  const sentIds = new Set((sent ?? []).map((s) => String(s.ref)))
  if (rides.every((r) => sentIds.has(String(r.id)))) return 'wszystko już wysłane'
  const ref = `day:${date}`
  if (!(await reserve(admin, userId, 'workout', ref))) return 'już wysłane'
  const snap = await snapshot(admin, userId, date)
  const primary = rides.find((r) => sentIds.has(String(r.id))) ?? rides.toSorted((x, y) => Number(y.moving_time_s) - Number(x.moving_time_s))[0]!
  const extras = rides.filter((r) => r !== primary)
  return sendWorkoutMail(admin, userId, ref, (profile.name as string) ?? '', primary, snap, extras)
}

export async function runEvening(admin: SupabaseClient, date: string): Promise<Record<string, string>> {
  const { data } = await admin.from('profiles').select('user_id').eq('email_workout', true)
  const out: Record<string, string> = {}
  for (const p of data ?? []) out[p.user_id as string] = await sendEvening(admin, p.user_id as string, date)
  return out
}

/** Harmonogram (co godzinę): poranna odprawa tym, którym w Warszawie wybiła ich godzina. */
export async function runMorning(admin: SupabaseClient): Promise<Record<string, string>> {
  const { date, hour } = warsawNow()
  const { data } = await admin.from('profiles').select('user_id').eq('email_morning', true).eq('email_hour', hour)
  const out: Record<string, string> = {}
  for (const p of data ?? []) out[p.user_id as string] = await sendMorning(admin, p.user_id as string, date)
  return out
}

// ---------------------------------------------------------------- list tygodnia (docs/19 § List tygodnia)

export const WEEKLY_HOUR = 19

const pl1 = (x: number) => x.toFixed(1).replace('.', ',')

/** Widok maila z faktów tygodnia i gotowego listu. */
export function weeklyView(f: WeekFacts, letter: string, athlete: string): WeeklyView {
  return {
    athlete,
    appUrl: `${APP_URL}/i`,
    reportUrl: `${APP_URL}/postep/tydzien/${f.week.monday}`,
    weekLabel: f.week.label,
    letter: letter.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    days: f.days.map((d) => ({
      weekday: d.weekday,
      planned: d.planned ? `${d.planned.name} · ${hm(d.planned.minutes)}` : null,
      outcome: d.outcome,
      summary: d.rides.length ? d.rides.map((r) => `${hm(r.minutes)}, ${pl1(r.km)} km${r.avg_w != null ? `, ${r.avg_w} W` : ''}${r.avg_hr != null ? `, ${r.avg_hr} bpm` : ''}${r.tss != null ? `, TSS ${r.tss}` : ''}`).join(' + ') + (d.rpe != null ? ` · RPE ${d.rpe}` : '') : null,
    })),
    totals: { done: hm(f.totals.done_min), planned: f.totals.planned_min ? hm(f.totals.planned_min) : null, pct: f.totals.pct, rides: f.totals.rides, km: f.totals.km, tss: f.totals.tss },
    body: f.body.checkins
      ? [
          {
            weight: f.body.weight_last != null ? `${pl1(f.body.weight_last)} kg${f.derived.weight_change_kg != null ? ` (${f.derived.weight_change_kg > 0 ? '+' : ''}${pl1(f.derived.weight_change_kg)})` : ''}` : null,
            rhr: f.body.rhr_avg != null ? `${Math.round(f.body.rhr_avg)} bpm${f.derived.rhr_change_bpm != null ? ` (${f.derived.rhr_change_bpm > 0 ? '+' : ''}${Math.round(f.derived.rhr_change_bpm)})` : ''}` : null,
            legs: f.body.legs_avg != null ? `${pl1(f.body.legs_avg)}/5` : null,
          },
        ].filter((b) => b.weight || b.rhr || b.legs)
      : [],
    next: f.next_week ? { label: `Następny tydzień · ${hm(f.next_week.total_min)}${f.next_week.week_type === 'deload' ? ' · rozładowanie' : ''}`, days: f.next_week.days.map((d) => ({ weekday: d.weekday, name: d.name, minutes: d.minutes, key: d.day_type === 'key' || d.day_type === 'test' })) } : null,
  }
}

/** Fakty tygodnia z bazy: jazdy, migawki, logi, check-iny tego i poprzedniego tygodnia oraz migawki następnego. */
export async function gatherWeek(admin: SupabaseClient, userId: string, monday: string): Promise<WeekFacts> {
  const prevMonday = addDays(monday, -7)
  const sunday = addDays(monday, 6)
  const nextSunday = addDays(monday, 13)
  const [{ data: rides }, { data: snaps }, { data: logs }, { data: cis }] = await Promise.all([
    admin.from('strava_activities').select('*').eq('user_id', userId).eq('is_ride', true).is('deleted_at', null).gte('date', prevMonday).lte('date', sunday).order('start_at'),
    admin.from('email_days').select('date, payload').eq('user_id', userId).gte('date', monday).lte('date', nextSunday),
    admin.from('session_logs').select('date, status, rpe').eq('user_id', userId).eq('kind', 'bike').is('deleted_at', null).gte('date', monday).lte('date', sunday).order('updated_at'),
    admin.from('checkins').select('date, weight_kg, resting_hr, sleep, legs, motivation, sick').eq('user_id', userId).is('deleted_at', null).gte('date', prevMonday).lte('date', sunday).order('date'),
  ])
  const snapshots: Record<string, DaySnapshot | null> = {}
  for (const r of snaps ?? []) snapshots[r.date as string] = r.payload as DaySnapshot
  const all = (rides ?? []).map((a) => ({ ...rideLite(a), note: (a.note as string | null) ?? null }))
  const num = (v: unknown) => (v == null ? null : Number(v))
  const ci = (cis ?? []).map((c) => ({ date: c.date as string, weight_kg: num(c.weight_kg), resting_hr: num(c.resting_hr), sleep: num(c.sleep), legs: num(c.legs), motivation: num(c.motivation), sick: (c.sick as boolean | null) ?? null }))
  return weekFacts({
    monday,
    snapshots,
    rides: all.filter((r) => r.date >= monday),
    prevRides: all.filter((r) => r.date < monday),
    logs: (logs ?? []).map((l) => ({ date: l.date as string, status: l.status as string, rpe: num(l.rpe) })),
    checkins: ci.filter((c) => c.date >= monday),
    prevCheckins: ci.filter((c) => c.date < monday),
  })
}

/** List: model z jedną poprawką (liczby tylko z faktów, 90–240 słów), inaczej list z reguł. */
export async function writeLetter(admin: SupabaseClient, userId: string, facts: WeekFacts): Promise<{ letter: string; source: 'ai' | 'rules'; detail: string }> {
  let detail = ''
  try {
    if (!Deno.env.get('ANTHROPIC_API_KEY')) throw new Error('brak klucza')
    if (!(await underLimit(admin))) throw new Error('limit miesięczny')
    const system = `${WEEK_SYSTEM}\n\nUSTALENIA O TYM ZAWODNIKU\n${facts.athlete.coach_notes.map((n) => `- ${n}`).join('\n') || '- brak'}`
    let user = weekPrompt(facts)
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await callClaude(system, user)
      await admin.from('ai_calls').insert({ user_id: userId, activity_id: null, input_tokens: r.usage.input_tokens ?? 0, output_tokens: r.usage.output_tokens ?? 0, cache_read_tokens: r.usage.cache_read_input_tokens ?? 0, cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0 })
      const check = numbersOk(r.text, facts)
      const words = wordCount(r.text)
      if (r.text && check.ok && words >= 90 && words <= 240) return { letter: r.text.trim(), source: 'ai', detail: attempt ? 'po poprawce' : 'ok' }
      const problems = [check.ok ? null : `liczby spoza faktów: ${check.unknown.join(', ')}`, words > 240 ? `za długi: ${words} słów` : words < 90 ? `za krótki: ${words} słów` : null].filter(Boolean).join('; ')
      detail = `${problems} | szkic: ${r.text.slice(0, 400)}`
      user = `${weekPrompt(facts)}\n\nPoprzednia wersja była odrzucona (${problems}). Napisz jeszcze raz: 3 akapity, 8–12 zdań, 120–200 słów, wyłącznie liczby z faktów (porównania tylko z „derived”).`
    }
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e)
  }
  return { letter: ruleLetter(facts), source: 'rules', detail }
}

/** Niedzielny list dla jednego użytkownika za tydzień zaczynający się w `monday`. */
export async function sendWeekly(admin: SupabaseClient, userId: string, monday: string, opts: { force?: boolean; subjectPrefix?: string } = {}): Promise<string> {
  const { data: profile } = await admin.from('profiles').select('email_weekly, name').eq('user_id', userId).maybeSingle()
  if (!opts.force && !profile?.email_weekly) return 'wyłączone'
  const facts = await gatherWeek(admin, userId, monday)
  if (!facts.totals.rides && !facts.totals.planned_min) return 'pusty tydzień'
  if (!opts.force && !(await reserve(admin, userId, 'weekly', monday))) return 'już wysłane'
  const to = await emailOf(admin, userId)
  if (!to) return 'brak adresu'
  const { letter, source, detail } = await writeLetter(admin, userId, facts)
  const unsub = opts.force ? null : await unsubscribeUrl(userId, 'weekly')
  const r = await resend(to, weeklyEmail(weeklyView(facts, letter, (profile?.name as string) ?? ''), { unsubscribeUrl: unsub }), unsub, opts.subjectPrefix ?? '')
  if (!opts.force) await finish(admin, userId, 'weekly', monday, r)
  return r.error ?? `wysłane (${source}${detail ? `: ${detail.slice(0, 120)}` : ''})`
}

/** Niedziela 19:00: list za kończący się tydzień dla wszystkich z włączonym `email_weekly`. */
export async function runWeekly(admin: SupabaseClient, date: string): Promise<Record<string, string>> {
  const monday = mondayOfWeek(date)
  const { data } = await admin.from('profiles').select('user_id').eq('email_weekly', true)
  const out: Record<string, string> = {}
  for (const p of data ?? []) out[p.user_id as string] = await sendWeekly(admin, p.user_id as string, monday).catch((e) => `błąd: ${e instanceof Error ? e.message : e}`)
  return out
}
