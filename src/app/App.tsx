import { Component, Suspense, lazy, useMemo, type ReactNode } from 'react'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes } from 'react-router'
import { TodayPage } from '@/features/today/TodayPage'
import { DayPage } from '@/features/today/DayPage'
import { WeekPage } from '@/features/week/WeekPage'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { SeasonPage } from '@/features/season/SeasonPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { WorkoutPage } from '@/features/library/WorkoutPage'
import { ExercisePage } from '@/features/library/ExercisePage'
import { ZonesPage } from '@/features/library/ZonesPage'
import { RulesPage } from '@/features/library/RulesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { MorePage } from '@/features/more/MorePage'
import { GearPage } from '@/features/gear/GearPage'
import { TripPage } from '@/features/trip/TripPage'
import { GymModePage } from '@/features/gym/GymModePage'
import { useSyncRunner } from '@/sync/useSync'
import { ToastProvider } from '@/components/Toast'
import { useWahooAutoPush } from '@/sync/useWahoo'
import { usePushKeepalive } from '@/sync/usePush'
import { useEngine } from '@/app/useSettings'
import { todayISO } from '@/lib/dates'
import { addDays, diffDays } from '@/engine/dates'
import { days as daysLabel } from '@/lib/format'
import { PHASE_COLOR, PHASE_SHORT } from '@/lib/labels'
import type { PhaseId } from '@/engine/types'
import { FULL_ESCAPE, useUiMode } from '@/ios/useIos'

const ProgressPage = lazy(() => import('@/features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })))
const IosApp = lazy(() => import('@/ios/IosApp').then((m) => ({ default: m.IosApp })))
const ReportPage = lazy(() => import('@/features/progress/ReportPage').then((m) => ({ default: m.ReportPage })))

/** Dolny pasek na telefonie – bez zmian; Kalendarz jest dostępny przez „Więcej”. */
const TABS = [
  { to: '/', label: 'Dziś', icon: '📅', end: true },
  { to: '/tydzien', label: 'Tydzień', icon: '🗓️' },
  { to: '/postep', label: 'Postęp', icon: '📈' },
  { to: '/biblioteka', label: 'Biblioteka', icon: '📚' },
  { to: '/wiecej', label: 'Więcej', icon: '⋯' },
]

/** Boczna nawigacja na komputerze ma własną listę – z Kalendarzem, bez „Więcej”. */
const SIDE_MAIN = [
  { to: '/', label: 'Dziś', icon: '📅', end: true },
  { to: '/kalendarz', label: 'Kalendarz', icon: '🗓️' },
  { to: '/tydzien', label: 'Tydzień', icon: '📋' },
  { to: '/postep', label: 'Postęp', icon: '📈' },
  { to: '/biblioteka', label: 'Biblioteka', icon: '📚' },
]

const SIDE_MORE = [
  { to: '/wiecej/sezon', label: 'Sezon' },
  { to: '/wiecej/sprzet', label: 'Sprzęt' },
  { to: '/wiecej/wyjazd', label: 'Wyjazd' },
  { to: '/wiecej/ustawienia', label: 'Ustawienia' },
]

function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-900/95" aria-label="Nawigacja główna">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`
              }
            >
              <span className="text-xl leading-none" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Pasek sezonu: fazy w kolorach, znacznik „dziś” i odliczanie – ten sam obraz co na ekranie Sezon. */
function SeasonStrip() {
  const engine = useEngine()
  const today = todayISO()
  const { program_start, trip_start } = engine.ctx.settings
  const phases = useMemo(() => {
    const out: { id: PhaseId; count: number }[] = []
    for (const w of engine.weeks) {
      const last = out.at(-1)
      if (last && last.id === w.phase) last.count++
      else out.push({ id: w.phase, count: 1 })
    }
    return out
  }, [engine.weeks])
  const total = engine.weeks.length || 1
  // diffDays(a, b) = a − b
  const span = Math.max(1, diffDays(trip_start, program_start))
  const elapsed = Math.min(Math.max(diffDays(today, program_start), 0), span)
  const left = diffDays(trip_start, today)
  const currentPhase = engine.weeks.find((w) => today >= w.monday && today <= addDays(w.monday, 6))
  return (
    <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-card dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{engine.ctx.program.meta.short}</span>
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{Math.round((elapsed / span) * 100)} %</span>
      </div>
      <p className="mt-0.5 text-sm font-semibold">{left > 0 ? `za ${daysLabel(left)}` : left === 0 ? 'Dziś wyjazd!' : 'Wyjazd trwa'}</p>
      <div className="relative mt-2 flex h-2 w-full overflow-hidden rounded-full">
        {phases.map((p, i) => (
          <div key={`${p.id}-${i}`} className={PHASE_COLOR[p.id]} style={{ width: `${(p.count / total) * 100}%` }} title={PHASE_SHORT[p.id]} />
        ))}
        <span className="absolute top-0 h-2 w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${(elapsed / span) * 100}%` }} aria-hidden />
      </div>
      {currentPhase && <p className="mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">{PHASE_SHORT[currentPhase.phase]} · tydzień {currentPhase.week}</p>}
    </div>
  )
}

/** Boczna nawigacja na komputerze (≥ 1024 px); na telefonie zostaje dolny pasek. */
function SideNav() {
  const engine = useEngine()
  return (
    <nav className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex dark:border-slate-700 dark:bg-slate-900" aria-label="Nawigacja główna">
      <div className="mb-6 px-3">
        <div className="text-xl font-bold tracking-tight">Trening</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{engine.ctx.program.meta.short}</div>
      </div>
      <ul className="space-y-1">
        {SIDE_MAIN.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${isActive ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`
              }
            >
              <span className="w-6 text-center text-lg" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <p className="mt-6 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Więcej</p>
      <ul className="space-y-0.5 text-sm">
        {SIDE_MORE.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                `flex min-h-10 items-center rounded-xl px-3 transition-colors ${isActive ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <SeasonStrip />
    </nav>
  )
}

/**
 * Start aplikacji: gdy wybrany jest uproszczony widok (iPhone), ekran główny przekierowuje do `/i`.
 * „Otwórz pełną aplikację” ustawia znacznik w sessionStorage, więc przekierowanie odpuszcza do końca sesji.
 */
function ModeGate({ children }: { children: ReactNode }) {
  const { mode, loaded } = useUiMode()
  const search = typeof window === 'undefined' ? '' : window.location.search
  let escaped = false
  try {
    escaped = sessionStorage.getItem(FULL_ESCAPE) === '1'
  } catch {
    /* prywatne okno */
  }
  if (!loaded) return null
  if (mode === 'ios' && !escaped) return <Navigate to={{ pathname: '/i', search }} replace />
  return <>{children}</>
}

function Layout() {
  useSyncRunner()
  useWahooAutoPush()
  usePushKeepalive()
  return (
    <div className="flex w-full flex-1">
      <SideNav />
      <div className="safe-top mx-auto w-full min-w-0 max-w-lg flex-1 lg:max-w-[1600px]">
        <main className="pb-nav px-4 pt-3 lg:px-10 lg:pt-8 lg:pb-12">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <h1 className="text-lg font-bold">Coś poszło nie tak</h1>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">{this.state.error.message}</pre>
          <button className="mt-4 min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500" onClick={() => location.reload()}>
            Odśwież
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<ModeGate><TodayPage /></ModeGate>} />
              <Route path="dzien/:date" element={<DayPage />} />
              <Route path="tydzien" element={<WeekPage />} />
              <Route path="tydzien/:date" element={<WeekPage />} />
              <Route path="kalendarz" element={<CalendarPage />} />
              <Route path="kalendarz/:month" element={<CalendarPage />} />
              <Route path="postep" element={<Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">Ładowanie…</p>}><ProgressPage /></Suspense>} />
              <Route path="postep/tydzien/:monday" element={<Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">Ładowanie…</p>}><ReportPage kind="week" /></Suspense>} />
              <Route path="postep/miesiac/:month" element={<Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">Ładowanie…</p>}><ReportPage kind="month" /></Suspense>} />
              <Route path="biblioteka" element={<LibraryPage />} />
              <Route path="biblioteka/trening/:id" element={<WorkoutPage />} />
              <Route path="biblioteka/cwiczenie/:id" element={<ExercisePage />} />
              <Route path="biblioteka/strefy" element={<ZonesPage />} />
              <Route path="biblioteka/zasady" element={<RulesPage />} />
              <Route path="wiecej" element={<MorePage />} />
              <Route path="wiecej/sezon" element={<SeasonPage />} />
              <Route path="wiecej/sprzet" element={<GearPage />} />
              <Route path="wiecej/wyjazd" element={<TripPage />} />
              <Route path="wiecej/ustawienia" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            <Route path="silownia/:date" element={<GymModePage />} />
            <Route path="i/*" element={<Suspense fallback={null}><IosApp /></Suspense>} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}
