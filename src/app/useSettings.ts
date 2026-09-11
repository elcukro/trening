import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { loadProgram } from '@/data/program'
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
  const program = loadProgram()
  const row = useLiveQuery(async () => (await db.settings.get('user')) ?? null, [], undefined)
  const settings = useMemo<Settings>(() => ({ ...program.default_settings, ...row?.value }), [program, row])
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
  const program = loadProgram()
  const { settings } = settingsApi
  const { ctx, weeks, settingsError } = useMemo(() => {
    try {
      return { ctx: { program, settings }, weeks: layoutWeeks(program, settings), settingsError: null }
    } catch (e) {
      const safe = { ...settings, trip_start: program.default_settings.trip_start }
      const msg = e instanceof TripDateError ? e.message : 'Nieprawidłowe ustawienia – użyto domyślnej daty wyjazdu.'
      return { ctx: { program, settings: safe }, weeks: layoutWeeks(program, safe), settingsError: msg }
    }
  }, [program, settings])
  return { ctx, weeks, settingsApi, settingsError }
}
