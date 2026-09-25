import { mergeProfile, type RemoteProfile } from './profileMerge'
import { db, SYNC_TABLES, UPDATE_ONLY_TABLES, USER_SCOPED_ID_TABLES, type SettingsRow, type SyncTable, type SyncedRow } from '@/db'
import { supabase } from './supabase'
import type { Settings } from '@/engine/schema'

/**
 * Synchronizacja: push outboxa (upsert po `id`), potem pull zmian po `server_updated_at` > kursor.
 * Konflikty: „ostatni zapis wygrywa” po `updated_at` – po stronie serwera pilnuje tego trigger `lww_guard`,
 * po stronie klienta rekord z serwera nadpisuje lokalny tylko, gdy ma nowszy `updated_at`.
 */

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'error' | 'offline' | 'unauthenticated' | 'disabled'
  last_sync: string | null
  pending: number
  error?: string
}

let running: Promise<void> | null = null
const listeners = new Set<(s: SyncStatus) => void>()
let status: SyncStatus = { state: supabase ? 'idle' : 'disabled', last_sync: null, pending: 0 }

export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn)
  fn(status)
  return () => {
    listeners.delete(fn)
  }
}

async function setStatus(patch: Partial<SyncStatus>) {
  const pending = await db.outbox.count()
  status = { ...status, ...patch, pending }
  listeners.forEach((l) => l(status))
}

const NUMERIC_EXCLUDE = /date|id$|notes|route|bike|wind|kind|status|protocol|_at$/

/** Postgres zwraca numeric jako string – przywracamy liczby. */
export function normalize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && !NUMERIC_EXCLUDE.test(k) ? Number(v) : v
  }
  return out
}

async function pushOutbox(userId: string): Promise<void> {
  if (!supabase) return
  const items = await db.outbox.orderBy('seq').toArray()
  for (const table of SYNC_TABLES) {
    const mine = items.filter((i) => i.table === table)
    if (mine.length === 0) continue
    const rows = (await db.table(table).bulkGet(mine.map((i) => i.row_id))).filter((r): r is SyncedRow => !!r)
    if (rows.length > 0) {
      const onlyCols = UPDATE_ONLY_TABLES[table]
      if (onlyCols) {
        for (const r of rows) {
          const patch: Record<string, unknown> = {}
          for (const c of onlyCols) patch[c] = (r as unknown as Record<string, unknown>)[c]
          const { error } = await supabase.from(table).update(patch).eq('id', r.id)
          if (error) throw new Error(`${table}: ${error.message}`)
        }
      } else {
        const payload = rows.map((r) => ({ ...(r as unknown as Record<string, unknown>), user_id: userId }))
        const { error } = await supabase.from(table).upsert(payload, { onConflict: USER_SCOPED_ID_TABLES.includes(table) ? 'user_id,id' : 'id' })
        if (error) throw new Error(`${table}: ${error.message}`)
      }
    }
    await db.outbox.bulkDelete(mine.map((i) => i.seq!))
  }
}

/** Czy rekord z serwera ma nadpisać lokalny (LWW; lokalny z oczekującą zmianą i nowszym stemplem wygrywa). */
export function shouldApplyRemote(local: SyncedRow | undefined, remote: SyncedRow, pendingLocally: boolean): boolean {
  if (!local) return true
  if (pendingLocally && local.updated_at >= remote.updated_at) return false
  return local.updated_at <= remote.updated_at
}

async function pullTable(table: SyncTable): Promise<void> {
  if (!supabase) return
  const cursorKey = `sync_cursor:${table}`
  const cursor = ((await db.kv.get(cursorKey))?.value as string | undefined) ?? '1970-01-01T00:00:00Z'
  const { data, error } = await supabase.from(table).select('*').gt('server_updated_at', cursor).order('server_updated_at', { ascending: true }).limit(1000)
  if (error) throw new Error(`${table}: ${error.message}`)
  if (!data || data.length === 0) return
  const pending = new Set((await db.outbox.where('[table+row_id]').between([table, ''], [table, '￿']).toArray()).map((i) => i.row_id))
  await db.transaction('rw', [db.table(table), db.kv], async () => {
    for (const remote of data as (SyncedRow & { server_updated_at: string; user_id: string })[]) {
      const { user_id: _u, server_updated_at: _s, ...row } = remote
      if (typeof (row as { id: unknown }).id === 'number') (row as { id: unknown }).id = String((row as { id: unknown }).id)
      const local = (await db.table(table).get(row.id)) as SyncedRow | undefined
      if (shouldApplyRemote(local, row, pending.has(row.id))) await db.table(table).put(normalize(row))
    }
    const last = (data.at(-1) as { server_updated_at: string }).server_updated_at
    await db.kv.put({ key: cursorKey, value: last, updated_at: new Date().toISOString() })
  })
  if (data.length === 1000) await pullTable(table)
}

// ---------------------------------------------------------------- profil (ustawienia)
const PROFILE_MAP: [keyof Settings, string][] = [
  ['athlete_name', 'name'],
  ['body_weight_start_kg', 'weight_start_kg'],
  ['body_weight_target_kg', 'weight_target_kg'],
  ['bike_and_kit_kg', 'bike_kit_kg'],
  ['lthr_bpm', 'lthr_bpm'],
  ['hr_max_bpm', 'hr_max_bpm'],
  ['ftp_w_estimate', 'ftp_w'],
  ['ftp_w_goal', 'ftp_goal_w'],
  ['power_meter', 'power_meter'],
  ['program_start', 'program_start'],
  ['trip_start', 'trip_start'],
  ['gym_days', 'gym_days'],
  ['volume_scale', 'volume_scale'],
  ['program_id', 'program_id'],
  ['email_morning', 'email_morning'],
  ['email_workout', 'email_workout'],
]

const PROFILE_TEXT_KEYS = new Set(['program_start', 'trip_start', 'program_id', 'athlete_name'])

/**
 * Profil scalany per pole (`profileMerge.ts`): wysyłamy tylko pola nowsze lokalnie, pobieramy tylko nowsze na serwerze.
 * Serwer (trigger `profiles_merge`) i tak porównuje znaczniki pól, więc wyścig dwóch urządzeń nie cofa nowszej wartości.
 */
async function syncProfile(userId: string, programVersion: string): Promise<void> {
  if (!supabase) return
  const local = await db.settings.get('user')
  const { data: remote, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`profiles: ${error.message}`)
  const m = mergeProfile(local ? { value: local.value, updated_at: local.updated_at, field_updated_at: local.field_updated_at } : undefined, (remote as RemoteProfile | null) ?? null, PROFILE_MAP, PROFILE_TEXT_KEYS)
  if (m.push) {
    const row = { user_id: userId, ...m.push.row, field_updated_at: m.push.field_updated_at, updated_at: m.push.updated_at, program_version: programVersion }
    const { error: e2 } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' })
    if (e2) throw new Error(`profiles: ${e2.message}`)
  }
  if (m.pull) {
    // odczyt jeszcze raz: użytkownik mógł zmienić ustawienia w trakcie zapytania
    const now = await db.settings.get('user')
    if (now && local && now.updated_at !== local.updated_at) return
    await db.settings.put({ key: 'user', value: m.pull.value as Partial<Settings>, updated_at: m.pull.updated_at, field_updated_at: m.pull.field_updated_at as SettingsRow['field_updated_at'] })
  }
}

export async function runSync(opts: { programVersion: string }): Promise<void> {
  if (!supabase) return
  if (running) return running
  running = (async () => {
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await setStatus({ state: 'offline' })
        return
      }
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      if (!userId) {
        await setStatus({ state: 'unauthenticated' })
        return
      }
      await setStatus({ state: 'syncing', error: undefined })
      await pushOutbox(userId)
      await syncProfile(userId, opts.programVersion)
      for (const t of SYNC_TABLES) await pullTable(t)
      const now = new Date().toISOString()
      await db.kv.put({ key: 'last_sync', value: now, updated_at: now })
      await setStatus({ state: 'idle', last_sync: now })
    } catch (e) {
      await setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) })
    } finally {
      running = null
    }
  })()
  return running
}

/** Po wylogowaniu: kursory od zera, dane lokalne zostają (offline-first). */
export async function resetSyncCursors(): Promise<void> {
  const keys = (await db.kv.toCollection().primaryKeys()).filter((k) => String(k).startsWith('sync_cursor:'))
  await db.kv.bulkDelete(keys)
}
