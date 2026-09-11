import { supabase } from './supabase'
import { db } from '@/db'
import { buildWahooPlan, externalId, isIndoor, isPushable, planMinutes, WORKOUT_TYPE_ID_INDOOR, WORKOUT_TYPE_ID_OUTDOOR, type WahooPlan } from '@/engine/wahoo'
import { getDayPlan } from '@/engine/plan'
import { addDays, type ISODate } from '@/engine/dates'
import type { EngineContext, LayoutWeek } from '@/engine/types'
import { localTimeISO } from '@/lib/dates'

export interface WahooPush {
  date: string
  workout_id: string
  status: string
  error: string | null
  updated_at: string
}

export interface WahooStatus {
  connected: boolean
  wahoo_user_id: string | null
  expires_at: string | null
  redirect_uri: string
  scope?: string
  /** uprawnienia, których brakuje w obecnym połączeniu (trzeba połączyć ponownie) */
  missing_scopes?: string[]
  pushes: WahooPush[]
}

export interface PushItem {
  date: ISODate
  workout_id: string
  name: string
  minutes: number
  workout_type_id: number
  external_id: string
  starts: string
  plan: WahooPlan
}


const ERROR_PL: Record<string, string> = {
  unauthorized: 'Zaloguj się w Ustawieniach → Konto, żeby korzystać z integracji.',
  not_connected: 'Integracja nie jest połączona – zrób to w Ustawieniach → Integracje.',
  no_items: 'Na ten okres nie ma treningów do wysłania.',
  unknown_action: 'Nieznana akcja – zgłoś błąd.',
  method: 'Nieobsługiwane żądanie.',
}

function translate(code: string): string {
  return ERROR_PL[code] ?? code
}

/** Żądanie do funkcji nie może wisieć w nieskończoność – bez tego interfejs zostaje „w toku”. */
async function withTimeout<T>(p: Promise<T>, ms = 45_000): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Brak odpowiedzi serwera w ${ms / 1000} s.`)), ms))])
}

async function call<T>(fn: 'wahoo-oauth' | 'wahoo-push', body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Brak konfiguracji Supabase.')
  const { data, error } = await withTimeout(supabase.functions.invoke(fn, { body }))
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) detail = ((await ctx.json()) as { error?: string }).error ?? detail
    } catch {
      /* ignoruj */
    }
    throw new Error(translate(detail))
  }
  return data as T
}

/** Element wysyłki dla jednego dnia planu, albo `null` gdy tego dnia nie wysyłamy na Bolta. */
export function pushItemFor(date: ISODate, ctx: EngineContext, weeks?: LayoutWeek[]): PushItem | null {
  const day = getDayPlan(date, ctx, weeks)
  if (!day?.bike || !isPushable(day.bike.workout_id)) return null
  const workout = ctx.program.bike_workouts[day.bike.workout_id]
  if (!workout) return null
  const plan = buildWahooPlan(workout, {
    durationMin: day.bike.duration_min,
    lthr: day.lthr,
    programVersion: ctx.program.version,
  })
  return {
    date,
    workout_id: day.bike.workout_id,
    name: day.bike.name,
    minutes: planMinutes(plan),
    workout_type_id: isIndoor(day.bike.workout_id) ? WORKOUT_TYPE_ID_INDOOR : WORKOUT_TYPE_ID_OUTDOOR,
    external_id: externalId(date, day.bike.workout_id, ctx.program.version),
    starts: localTimeISO(date, 6),
    plan,
  }
}

/** Dziś + kolejne dni (domyślnie tydzień). */
export function pushItemsFrom(from: ISODate, days: number, ctx: EngineContext, weeks?: LayoutWeek[]): PushItem[] {
  const out: PushItem[] = []
  for (let i = 0; i < days; i++) {
    const item = pushItemFor(addDays(from, i), ctx, weeks)
    if (item) out.push(item)
  }
  return out
}

export interface PushResponse {
  ok: boolean
  pushed: number
  results: { date: string; status: string; error?: string; variant?: string; plan_linked?: boolean | null }[]
  /** sposób przesłania pliku zaakceptowany przez Wahoo (diagnostyka) */
  variant?: string | null
}

export const wahoo = {
  status: () => call<WahooStatus>('wahoo-oauth', { action: 'status' }),
  startUrl: () => call<{ url: string }>('wahoo-oauth', { action: 'start' }),
  disconnect: () => call<{ ok: boolean }>('wahoo-oauth', { action: 'disconnect' }),
  push: (items: PushItem[], mode: 'update' | 'replace' = 'update') => call<PushResponse>('wahoo-push', { items, mode }),
  diagnose: (items: PushItem[]) => call<Record<string, unknown>>('wahoo-push', { items, mode: 'diagnose' }),
}

const AUTO_KEY = 'wahoo_auto_push'
const LAST_KEY = 'wahoo_last_push'

export async function autoPushEnabled(): Promise<boolean> {
  return ((await db.kv.get(AUTO_KEY))?.value as boolean | undefined) ?? true
}

export async function setAutoPush(on: boolean): Promise<void> {
  await db.kv.put({ key: AUTO_KEY, value: on, updated_at: new Date().toISOString() })
}

export async function lastAutoPush(): Promise<string | null> {
  return ((await db.kv.get(LAST_KEY))?.value as string | undefined) ?? null
}

/** Automatyczna wysyłka „dziś + 6 dni”, najwyżej raz dziennie. */
export async function maybeAutoPush(today: ISODate, ctx: EngineContext, weeks?: LayoutWeek[]): Promise<PushResponse | null> {
  if (!supabase) return null
  if (!(await autoPushEnabled())) return null
  if ((await lastAutoPush()) === today) return null
  const { data } = await supabase.auth.getSession()
  if (!data.session) return null
  const status = await wahoo.status().catch(() => null)
  if (!status?.connected) return null
  const items = pushItemsFrom(today, 7, ctx, weeks)
  if (items.length === 0) return null
  const res = await wahoo.push(items)
  // przy błędach nie blokujemy dnia – kolejne uruchomienie spróbuje jeszcze raz
  if (res.ok) await db.kv.put({ key: LAST_KEY, value: today, updated_at: new Date().toISOString() })
  return res
}
