import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Checkin, type TestResult } from '@/db'
import { DEFAULT_PROGRAM_ID, loadProgram } from '@/data/program'
import { changedKeys, withFieldStamps } from '@/sync/profileMerge'
import type { Settings } from '@/engine/schema'
import type { EngineContext } from '@/engine/types'
import { layoutWeeks, TripDateError } from '@/engine/layout'
import type { LayoutWeek } from '@/engine/types'

export interface SettingsApi {
  settings: Settings
  loaded: boolean
  update: (patch: Partial<Settings>) => Promise<void>
  reset: () => Promise<void>
}

export function useSettings(): SettingsApi {
  const row = useLiveQuery(async () => (await db.settings.get('user')) ?? null, [], undefined)
  // identyfikator programu czytamy z zapisu użytkownika, a nie z domyślnych ustawień programu –
  // inaczej nie dałoby się wyjść z programu domyślnego
  const programId = (row?.value?.program_id as string | undefined) ?? DEFAULT_PROGRAM_ID
  const program = loadProgram(programId)
  const settings = useMemo<Settings>(() => ({ ...program.default_settings, ...row?.value, program_id: programId }), [program, row, programId])
  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const row = await db.settings.get('user')
      const current = row?.value ?? {}
      // znacznik tylko dla pól, które naprawdę się zmieniły – zapis całego formularza nie może „odświeżyć”
      // pól, których użytkownik nie ruszał, bo nadpisałby nowszą wartość z innego urządzenia (docs/18, krok 5)
      const effective = { ...loadProgram((current.program_id as string | undefined) ?? DEFAULT_PROGRAM_ID).default_settings, ...current }
      const keys = changedKeys(current, effective, patch) as (keyof Settings)[]
      if (keys.length === 0) return
      const now = new Date().toISOString()
      const stamps = row ? withFieldStamps({ value: current, updated_at: row.updated_at, field_updated_at: row.field_updated_at }) : {}
      const value: Partial<Settings> = { ...current }
      for (const k of keys) {
        ;(value as Record<string, unknown>)[k] = patch[k]
        stamps[k] = now
      }
      await db.settings.put({ key: 'user', value, updated_at: now, field_updated_at: stamps })
    },
    [],
  )
  const reset = useCallback(async () => {
    await db.settings.delete('user')
  }, [])
  return { settings, loaded: row !== undefined, update, reset }
}

export interface Engine {
  ctx: EngineContext
  weeks: LayoutWeek[]
  settingsApi: SettingsApi
  /** komunikat, gdy zapisane ustawienia są niepoprawne (np. za wczesna data wyjazdu) */
  settingsError: string | null
}

/** Kontekst silnika zmemoizowany po ustawieniach. */
export function useEngine(): Engine {
  const settingsApi = useSettings()
  const program = loadProgram(settingsApi.settings.program_id)
  const { settings } = settingsApi
  const testRows = useLiveQuery(() => db.test_results.where('date').above('').toArray(), [], [] as TestResult[])
  const tests = useMemo(() => testRows.filter((t) => !t.deleted_at && (t.lthr_bpm || t.ftp_w)).map((t) => ({ date: t.date, lthr_bpm: t.lthr_bpm ?? null, ftp_w: t.ftp_w ?? null })), [testRows])
  // ostatnia zmierzona masa – z niej program z `weight_based` dobiera deficyt
  const lastWeigh = useLiveQuery(
    async () => {
      const rows = (await db.checkins.where('date').above('').toArray()).filter((c: Checkin) => !c.deleted_at && c.weight_kg != null)
      return rows.toSorted((a, b) => (a.date < b.date ? 1 : -1))[0]?.weight_kg ?? null
    },
    [],
    null as number | null,
  )
  const { ctx, weeks, settingsError } = useMemo(() => {
    try {
      return { ctx: { program, settings, tests, current_weight_kg: lastWeigh }, weeks: layoutWeeks(program, settings), settingsError: null }
    } catch (e) {
      const safe = { ...settings, trip_start: program.default_settings.trip_start }
      const msg = e instanceof TripDateError ? e.message : 'Nieprawidłowe ustawienia – użyto domyślnej daty wyjazdu.'
      return { ctx: { program, settings: safe, tests, current_weight_kg: lastWeigh }, weeks: layoutWeeks(program, safe), settingsError: msg }
    }
  }, [program, settings, tests, lastWeigh])
  return { ctx, weeks, settingsApi, settingsError }
}
