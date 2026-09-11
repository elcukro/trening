import Dexie, { type EntityTable } from 'dexie'
import type { Settings } from '@/engine/schema'

/**
 * Lokalna baza (IndexedDB) – źródło prawdy dla UI, działa offline.
 * Rekordy synchronizowane mają `id` (UUID z klienta), `updated_at` (ISO, zegar klienta – „ostatni zapis wygrywa”)
 * i opcjonalnie `deleted_at` (tombstone). Zmiany trafiają do `outbox`, skąd `src/sync` wypycha je do Supabase.
 */

export interface SyncedRow {
  id: string
  updated_at: string
  deleted_at?: string | null
}

export interface SettingsRow {
  key: 'user'
  value: Partial<Settings>
  updated_at: string
}

export interface KeyValueRow {
  key: string
  value: unknown
  updated_at: string
}

export type SessionKind = 'bike' | 'gym' | 'test'
export type SessionStatus = 'planned' | 'in_progress' | 'done' | 'modified' | 'skipped'

export interface SessionLog extends SyncedRow {
  date: string
  kind: SessionKind
  planned_workout_id: string | null
  status: SessionStatus
  rpe?: number | null
  duration_min?: number | null
  distance_km?: number | null
  elevation_m?: number | null
  avg_hr?: number | null
  max_hr?: number | null
  avg_cadence?: number | null
  avg_speed_kmh?: number | null
  bike?: string | null
  strava_activity_id?: number | null
  notes?: string | null
}

export interface SetLog extends SyncedRow {
  session_log_id: string
  exercise_id: string
  set_no: number
  weight_kg: number | null
  reps: number | null
  rir: number | null
  is_warmup: boolean
}

export interface TestResult extends SyncedRow {
  date: string
  protocol: 'TEST_LTHR' | 'WATTBIKE_TEST'
  lthr_bpm: number | null
  avg_hr?: number | null
  avg_power_w?: number | null
  ftp_w?: number | null
  avg_speed_kmh?: number | null
  distance_km?: number | null
  route?: string | null
  bike?: string | null
  temp_c?: number | null
  wind?: string | null
  notes?: string | null
}

export interface Checkin extends SyncedRow {
  date: string
  weight_kg: number | null
  resting_hr: number | null
  sleep: number | null
  legs: number | null
  motivation: number | null
  sick: boolean
  notes?: string | null
}

export interface OutboxItem {
  seq?: number
  table: SyncTable
  row_id: string
  ts: string
}

export const SYNC_TABLES = ['checkins', 'session_logs', 'set_logs', 'test_results'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export class TreningDB extends Dexie {
  settings!: EntityTable<SettingsRow, 'key'>
  kv!: EntityTable<KeyValueRow, 'key'>
  checkins!: EntityTable<Checkin, 'id'>
  session_logs!: EntityTable<SessionLog, 'id'>
  set_logs!: EntityTable<SetLog, 'id'>
  test_results!: EntityTable<TestResult, 'id'>
  outbox!: EntityTable<OutboxItem, 'seq'>

  constructor() {
    super('trening')
    this.version(1).stores({ settings: 'key', kv: 'key' })
    this.version(2).stores({
      settings: 'key',
      kv: 'key',
      checkins: 'id, date, updated_at',
      session_logs: 'id, date, [date+kind], updated_at',
      set_logs: 'id, session_log_id, exercise_id, updated_at',
      test_results: 'id, date, updated_at',
      outbox: '++seq, [table+row_id]',
    })
  }
}

export const db = new TreningDB()

export function newId(): string {
  return crypto.randomUUID()
}

export function nowISO(): string {
  return new Date().toISOString()
}
