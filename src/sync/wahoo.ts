import { supabase } from './supabase'
import { db } from '@/db'
import { buildWahooPlan, externalId, isIndoor, isPushable, planMinutes, WORKOUT_TYPE_ID_INDOOR, WORKOUT_TYPE_ID_OUTDOOR, type WahooPlan } from '@/engine/wahoo'
import { planWindow, OVERRIDE_PAD_DAYS, type DayPlan } from '@/engine/plan'
import { addDays, type ISODate } from '@/engine/dates'
import type { EngineContext, LayoutWeek, PlanOverride } from '@/engine/types'
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

/** Element wysyłki z gotowego dnia planu (już po nadpisaniach), albo `null` gdy tego dnia nie wysyłamy na Bolta. */
export function pushItemForDay(day: DayPlan, ctx: EngineContext): PushItem | null {
  if (!day.bike || !isPushable(day.bike.workout_id)) return null
  const workout = ctx.program.bike_workouts[day.bike.workout_id]
  if (!workout) return null
  const plan = buildWahooPlan(workout, {
    durationMin: day.bike.duration_min,
    lthr: day.lthr,
    heatOffsetBpm: day.flags.includes('heat') ? 4 : 0,
    // z miernikiem: cele mocy – jedyne, z których ELEMNT liczy TSS/IF i rysuje profil
    usePowerTargets: ctx.settings.power_meter,
    ftp: day.ftp,
    powerZones: ctx.program.power_zones_ftp_fraction,
    programVersion: ctx.program.version,
  })
  return {
    date: day.date,
    workout_id: day.bike.workout_id,
    name: day.bike.name,
    minutes: planMinutes(plan),
    workout_type_id: isIndoor(day.bike.workout_id) ? WORKOUT_TYPE_ID_INDOOR : WORKOUT_TYPE_ID_OUTDOOR,
    external_id: externalId(day.date, day.bike.workout_id, ctx.program.version),
    starts: localTimeISO(day.date, 6),
    plan,
  }
}

/** Element wysyłki dla jednego dnia planu (z nadpisaniami, jeśli przekazane). */
export function pushItemFor(date: ISODate, ctx: EngineContext, weeks?: LayoutWeek[], overrides: PlanOverride[] = []): PushItem | null {
  const day = planWindow(date, 1, ctx, weeks, overrides)[0]
  return day ? pushItemForDay(day, ctx) : null
}

/** Dziś + kolejne dni (domyślnie tydzień). */
export function pushItemsFrom(from: ISODate, days: number, ctx: EngineContext, weeks?: LayoutWeek[], overrides: PlanOverride[] = []): PushItem[] {
  return planWindow(from, days, ctx, weeks, overrides)
    .map((d) => pushItemForDay(d, ctx))
    .filter((i): i is PushItem => !!i)
}

/** Dni w oknie bez jazdy do wysłania – po zmianie planu trzeba z Wahoo skasować to, co tam zostało. */
export function removeDatesFrom(from: ISODate, days: number, ctx: EngineContext, weeks?: LayoutWeek[], overrides: PlanOverride[] = []): ISODate[] {
  const keep = new Set(pushItemsFrom(from, days, ctx, weeks, overrides).map((i) => i.date))
  const out: ISODate[] = []
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i)
    if (!keep.has(d)) out.push(d)
  }
  return out
}

/** Nadpisania z bazy obejmujące okno wysyłki razem z marginesem (drugi koniec przeniesienia). */
export async function loadOverridesFor(from: ISODate, days: number): Promise<PlanOverride[]> {
  const rows = await db.plan_overrides.where('date').between(addDays(from, -OVERRIDE_PAD_DAYS), addDays(from, days + OVERRIDE_PAD_DAYS), true, true).toArray()
  return rows.filter((o) => !o.deleted_at).map((o) => ({ id: o.id, date: o.date, kind: o.kind, payload: o.payload }))
}

/** Gotowa paczka do wysyłki: treningi do wgrania i dni do skasowania, z uwzględnieniem nadpisań. */
export async function pushPayloadFor(from: ISODate, days: number, ctx: EngineContext, weeks?: LayoutWeek[]): Promise<{ items: PushItem[]; remove: ISODate[] }> {
  const overrides = await loadOverridesFor(from, days)
  return { items: pushItemsFrom(from, days, ctx, weeks, overrides), remove: removeDatesFrom(from, days, ctx, weeks, overrides) }
}

export interface PushResponse {
  ok: boolean
  pushed: number
  results: { date: string; status: string; error?: string; variant?: string; plan_linked?: boolean | null }[]
  /** sposób przesłania pliku zaakceptowany przez Wahoo (diagnostyka) */
  variant?: string | null
  /** true, gdy Wahoo odmówiło z powodu limitu zapytań */
  rate_limited?: boolean
  /** dni, z których skasowano treningi (nie ma już jazdy w planie) */
  removed?: string[]
}

export const wahoo = {
  status: () => call<WahooStatus>('wahoo-oauth', { action: 'status' }),
  startUrl: () => call<{ url: string }>('wahoo-oauth', { action: 'start' }),
  disconnect: () => call<{ ok: boolean }>('wahoo-oauth', { action: 'disconnect' }),
  push: async (items: PushItem[], mode: 'update' | 'replace' = 'update', remove: ISODate[] = []) => {
    const at = new Date().toISOString()
    await recordAttempt({ at, mode, items: items.length, outcome: 'wysyłam…' })
    try {
      const res = await call<PushResponse>('wahoo-push', { items, mode, remove })
      const errors = res.results.filter((r) => r.status === 'error')
      await recordAttempt({ at, mode, items: items.length, outcome: errors.length ? `${res.pushed} ok, ${errors.length} błędów` : `${res.pushed} wysłanych` })
      return res
    } catch (e) {
      await recordAttempt({ at, mode, items: items.length, outcome: `błąd: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) })
      throw e
    }
  },
  diagnose: (items: PushItem[]) => call<Record<string, unknown>>('wahoo-push', { items, mode: 'diagnose' }),
  completed: (days = 7) => call<{ ok: boolean; scanned: number; completed: number; dates: string[] }>('wahoo-push', { items: [], mode: 'completed', days }),
  cleanup: () => call<{ ok: boolean; removed: { id: number; name?: string; starts?: string }[]; scanned: number }>('wahoo-push', { items: [], mode: 'cleanup' }),
}

const ATTEMPT_KEY = 'wahoo_last_attempt'

export interface PushAttempt {
  at: string
  mode: string
  items: number
  outcome: string
}

/** Ślad próby zapisywany lokalnie, zanim cokolwiek poleci do sieci – pokazuje, czy klik w ogóle zadziałał. */
export async function recordAttempt(a: PushAttempt): Promise<void> {
  await db.kv.put({ key: ATTEMPT_KEY, value: a, updated_at: new Date().toISOString() })
}

export async function lastAttempt(): Promise<PushAttempt | null> {
  return ((await db.kv.get(ATTEMPT_KEY))?.value as PushAttempt | undefined) ?? null
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
  const { items, remove } = await pushPayloadFor(today, 7, ctx, weeks)
  if (items.length === 0) return null
  const res = await wahoo.push(items, 'update', remove)
  // w drugą stronę: wykonane treningi z Bolta (jedno zapytanie dziennie; błąd nie blokuje wysyłki)
  await wahoo.completed(3).catch((e) => console.warn('Wahoo completed:', e))
  // Znaczymy dzień niezależnie od wyniku: przy niepowodzeniu ponawianie przy każdym uruchomieniu
  // aplikacji zjadałoby limit Wahoo (25 zapytań / 5 min, 100 / h, 250 / dzień).
  // Powtórkę uruchamia się ręcznie przyciskiem w Ustawieniach.
  await db.kv.put({ key: LAST_KEY, value: today, updated_at: new Date().toISOString() })
  return res
}
