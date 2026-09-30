/**
 * Wysyłka maili treningowych przez Resend (docs/19). Tylko Deno (Edge Functions): baza, sekrety, podpis linku rezygnacji.
 * Każda wysyłka najpierw rezerwuje wpis w `email_log` (unikat user+rodzaj+ref) – dwa równoległe wywołania nie wyślą dwóch maili.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { APP_URL, env } from './env.ts'
import { sign, verify } from './crypto.ts'
import { morningEmail, workoutEmail, type EmailOut, type MorningView } from './email_templates.ts'
import { buildWorkoutView, fulfilsPlan, type DaySnapshot, type RideLite } from './email_views.ts'

const FROM = 'Trening <trening@felsztukier.pl>'
export type EmailKind = 'morning' | 'workout'

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

export async function unsubscribe(admin: SupabaseClient, token: string): Promise<EmailKind | null> {
  // uszkodzony token (np. obcięty w kliencie poczty) = nieprawidłowy link, nie błąd serwera
  const payload = await verify(token).catch(() => null)
  const m = payload?.match(/^unsub:([0-9a-f-]{36}):(morning|workout)$/)
  if (!m) return null
  const kind = m[2] as EmailKind
  await admin.from('profiles').update({ [kind === 'morning' ? 'email_morning' : 'email_workout']: false }).eq('user_id', m[1])
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
  if (!(await reserve(admin, userId, 'morning', date))) return 'już wysłane'
  const to = await emailOf(admin, userId)
  if (!to) return 'brak adresu'
  const unsub = await unsubscribeUrl(userId, 'morning')
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

async function sendWorkoutMail(admin: SupabaseClient, userId: string, kindRef: string, name: string, a: Row, snap: DaySnapshot | null, extras: Row[]): Promise<string> {
  const view = buildWorkoutView(rideLite(a), snap, {
    athlete: name,
    appUrl: APP_URL,
    weekDoneMin: await weekDoneMin(admin, userId, a.date as string),
    rideDateLabel: snap?.dateLabel ?? (a.date as string),
    note: (a.note as string | null) ?? null,
    extras: extras.map(rideLite),
  })
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
