import { Component, Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes } from 'react-router'
import { TodayPage } from '@/features/today/TodayPage'
import { DayPage } from '@/features/today/DayPage'
import { WeekPage } from '@/features/week/WeekPage'
import { SeasonPage } from '@/features/season/SeasonPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { WorkoutPage } from '@/features/library/WorkoutPage'
import { ExercisePage } from '@/features/library/ExercisePage'
import { ZonesPage } from '@/features/library/ZonesPage'
import { RulesPage } from '@/features/library/RulesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { MorePage } from '@/features/more/MorePage'
import { GymModePage } from '@/features/gym/GymModePage'
import { useSyncRunner } from '@/sync/useSync'

const ProgressPage = lazy(() => import('@/features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })))

const TABS = [
  { to: '/', label: 'Dziś', icon: '📅', end: true },
  { to: '/tydzien', label: 'Tydzień', icon: '🗓️' },
  { to: '/postep', label: 'Postęp', icon: '📈' },
  { to: '/biblioteka', label: 'Biblioteka', icon: '📚' },
  { to: '/wiecej', label: 'Więcej', icon: '⋯' },
]

function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" aria-label="Nawigacja główna">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`
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

function Layout() {
  useSyncRunner()
  return (
    <div className="safe-top mx-auto w-full max-w-lg flex-1">
      <main className="pb-nav px-4 pt-3">
        <Outlet />
      </main>
      <BottomNav />
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
          <button className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-white" onClick={() => location.reload()}>
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
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="dzien/:date" element={<DayPage />} />
            <Route path="tydzien" element={<WeekPage />} />
            <Route path="tydzien/:date" element={<WeekPage />} />
            <Route path="postep" element={<Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">Ładowanie…</p>}><ProgressPage /></Suspense>} />
            <Route path="biblioteka" element={<LibraryPage />} />
            <Route path="biblioteka/trening/:id" element={<WorkoutPage />} />
            <Route path="biblioteka/cwiczenie/:id" element={<ExercisePage />} />
            <Route path="biblioteka/strefy" element={<ZonesPage />} />
            <Route path="biblioteka/zasady" element={<RulesPage />} />
            <Route path="wiecej" element={<MorePage />} />
            <Route path="wiecej/sezon" element={<SeasonPage />} />
            <Route path="wiecej/ustawienia" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="silownia/:date" element={<GymModePage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
