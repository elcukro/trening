import React, { createContext, createElement, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, SYNC_TABLES, type Checkin, type PlanRow, type TestResult } from '@/db'
import { DEFAULT_PROGRAM_ID } from '@/data/program'
import { GENERATED_PROGRAM_ID, planOutdated, resolveProgram } from '@/data/generated'
import { SYNCED_TABLES_KEY } from '@/sync/sync'
import type { Program } from '@/engine/schema'
import { useAuth } from '@/sync/auth'
import { useSyncRunner } from '@/sync/useSync'
import { useLang } from '@/i18n/react'
import { t as tNow } from '@/i18n'
import type { SyncStatus } from '@/sync/sync'
import { changedKeys, withFieldStamps } from '@/sync/profileMerge'
import type { Settings } from '@/engine/schema'
import type { EngineContext } from '@/engine/types'
import { layoutWeeks, TripDateError } from '@/engine/layout'
import type { LayoutWeek } from '@/engine/types'

export interface SettingsApi {
  settings: Settings
  /** program obowiązujący to konto (z `settings.program_id`) */
  program: Program
  /** Dexie odpowiedziała (wiersz albo jego brak) */
  loaded: boolean
  /**
   * Ekrany mogą pokazywać dane: ustawienia wczytane, a na zalogowanym koncie bez lokalnego zapisu – po pierwszym pobraniu
   * profilu z serwera. Bez tego świeże urządzenie przez chwilę pokazywałoby program domyślny (cudze progi, cudzy plan).
   */
  ready: boolean
  /** dlaczego jeszcze nie `ready` – do ekranu oczekiwania */
  waiting: 'settings' | 'session' | 'profile' | 'plan' | 'sync' | null
  /** wiersz planu z generatora (docs/32 § 7); `null` = brak, `undefined` = jeszcze nie wczytany */
  plan: PlanRow | null | undefined
  /** plan liczony starszą wersją generatora – warto zaproponować przeliczenie */
  plan_outdated: boolean
  sync: SyncStatus
  update: (patch: Partial<Settings>) => Promise<void>
  reset: () => Promise<void>
}

const SettingsContext = createContext<SettingsApi | null>(null)

/**
 * Jedno źródło ustawień dla całej aplikacji (18.10.2026). Wcześniej każde wywołanie `useSettings()` miało własne zapytanie
 * do Dexie i przy pierwszym renderze zwracało domyślne ustawienia programu domyślnego – arkusz progów drugiego konta
 * zapamiętywał 220 W / brak LTHR / bez miernika i nadpisywał nimi prawdziwe wartości. Tu zapytanie jest jedno, a `SettingsGate`
 * nie pokazuje ekranów, dopóki ustawienia (i na zalogowanym koncie profil z serwera) nie są wczytane.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const api = useSettingsSource()
  return createElement(SettingsContext.Provider, { value: api }, children)
}

export function useSettings(): SettingsApi {
  const api = useContext(SettingsContext)
  if (!api) throw new Error('useSettings poza SettingsProvider')
  return api
}

/** Ekran oczekiwania bez danych programu – zanim wiadomo, czyje ustawienia pokazać. */
export function SettingsGate({ children, fallback }: { children: ReactNode; fallback: (waiting: NonNullable<SettingsApi['waiting']>, sync: SyncStatus) => ReactNode }) {
  const api = useSettings()
  if (!api.ready) return createElement(React.Fragment, null, fallback(api.waiting ?? 'settings', api.sync))
  return createElement(React.Fragment, null, children)
}

function useSettingsSource(): SettingsApi {
  const row = useLiveQuery(async () => (await db.settings.get('user')) ?? null, [], undefined)
  // identyfikator programu czytamy z zapisu użytkownika, a nie z domyślnych ustawień programu –
  // inaczej nie dałoby się wyjść z programu domyślnego
  const programId = (row?.value?.program_id as string | undefined) ?? DEFAULT_PROGRAM_ID
  // plan z generatora: program liczony z wiersza `plans` (regeneracja deterministyczna, pamięć podręczna po `updated_at`)
  const plan = useLiveQuery(async () => (await db.plans.get('current')) ?? null, [], undefined)
  // język z modułu i18n (docs/34): zmiana języka przelicza program z przetłumaczonymi tekstami
  const lang = useLang()
  const program = resolveProgram(programId, plan, lang)
  const settings = useMemo<Settings>(() => ({ ...program.default_settings, ...row?.value, program_id: programId }), [program, row, programId])
  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const row = await db.settings.get('user')
      const current = row?.value ?? {}
      // znacznik tylko dla pól, które naprawdę się zmieniły – zapis całego formularza nie może „odświeżyć”
      // pól, których użytkownik nie ruszał, bo nadpisałby nowszą wartość z innego urządzenia (docs/18, krok 5)
      const effective = { ...resolveProgram((current.program_id as string | undefined) ?? DEFAULT_PROGRAM_ID, await db.plans.get('current')).default_settings, ...current }
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
  const loaded = row !== undefined
  const auth = useAuth()
  const sync = useSyncRunner(program.version)
  // zalogowane konto bez lokalnego zapisu ustawień = świeże urządzenie: czekamy na pierwsze pobranie profilu
  // (albo na błąd – wtedy ekran oczekiwania pokazuje przyczynę zamiast cudzych wartości domyślnych)
  const freshAccount = loaded && row === null && !!auth.session
  const firstPullPending = freshAccount && sync.last_sync === null && sync.state !== 'error' && sync.state !== 'disabled' && sync.state !== 'offline'
  // profil wskazuje plan z generatora, ale wiersza jeszcze nie ma: czekamy na pełne pobranie tabeli `plans`
  // (świeże urządzenie); po pobraniu bez wiersza spadamy na program domyślny – onboarding pokaże się sam
  const syncedTables = useLiveQuery(async () => {
    const v = (await db.kv.get(SYNCED_TABLES_KEY))?.value
    return Array.isArray(v) ? (v as string[]) : []
  }, [], undefined)
  const syncBlocked = sync.state === 'error' || sync.state === 'disabled' || sync.state === 'offline'
  const planPending = programId === GENERATED_PROGRAM_ID && plan === null && !!auth.session && !syncedTables?.includes('plans') && !syncBlocked
  // urządzenie, które ani razu nie pobrało wszystkich tabel (świeża instalacja, nowa tabela po aktualizacji), czeka na pełne
  // pobranie: inaczej Dziś przez chwilę pokazywał plan bez przeniesień konta (zielone → szare przyciski), a onboarding
  // widział szkic zamiast wiersza `legacy` (docs/35). Błąd, brak sieci i limit czasu synchronizacji otwierają ekrany.
  const firstSyncPending = !!auth.session && syncedTables !== undefined && !SYNC_TABLES.every((t) => syncedTables.includes(t)) && !syncBlocked
  const waiting: SettingsApi['waiting'] = !loaded || plan === undefined || syncedTables === undefined ? 'settings' : auth.loading ? 'session' : firstPullPending ? 'profile' : planPending ? 'plan' : firstSyncPending ? 'sync' : null
  return { settings, program, loaded, ready: waiting === null, waiting, plan, plan_outdated: planOutdated(plan), sync, update, reset }
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
  const { settings, program } = settingsApi
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
      const msg = e instanceof TripDateError ? e.message : tNow().classic.settingsInvalid
      return { ctx: { program, settings: safe, tests, current_weight_kg: lastWeigh }, weeks: layoutWeeks(program, safe), settingsError: msg }
    }
  }, [program, settings, tests, lastWeigh])
  return { ctx, weeks, settingsApi, settingsError }
}
