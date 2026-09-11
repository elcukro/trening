import Dexie, { type EntityTable } from 'dexie'
import type { Settings } from '@/engine/schema'

/**
 * Lokalna baza (IndexedDB). Etap 1: ustawienia. Etap 2 doda logi, serie, check-iny, testy i kolejkę outbox.
 * Każdy rekord synchronizowany ma `id` (UUID z klienta) i `updated_at` (ISO) – „ostatni zapis wygrywa”.
 */

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

export class TreningDB extends Dexie {
  settings!: EntityTable<SettingsRow, 'key'>
  kv!: EntityTable<KeyValueRow, 'key'>

  constructor() {
    super('trening')
    this.version(1).stores({
      settings: 'key',
      kv: 'key',
    })
  }
}

export const db = new TreningDB()
