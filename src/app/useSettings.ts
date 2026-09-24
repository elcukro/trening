import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TestResult } from '@/db'
import { DEFAULT_PROGRAM_ID, loadProgram } from '@/data/program'
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
      const current = (await db.settings.get('user'))?.value ?? {}
      await db.settings.put({ key: 'user', value: { ...current, ...patch }, updated_at: new Date().toISOString() })
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
  const { ctx, weeks, settingsError } = useMemo(() => {
    try {
      return { ctx: { program, settings, tests }, weeks: layoutWeeks(program, settings), settingsError: null }
    } catch (e) {
      const safe = { ...settings, trip_start: program.default_settings.trip_start }
      const msg = e instanceof TripDateError ? e.message : 'Nieprawidłowe ustawienia – użyto domyślnej daty wyjazdu.'
      return { ctx: { program, settings: safe, tests }, weeks: layoutWeeks(program, safe), settingsError: msg }
    }
  }, [program, settings, tests])
  return { ctx, weeks, settingsApi, settingsError }
}
