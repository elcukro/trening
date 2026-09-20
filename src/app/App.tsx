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
import { GearPage } from '@/features/gear/GearPage'
import { TripPage } from '@/features/trip/TripPage'
import { GymModePage } from '@/features/gym/GymModePage'
import { useSyncRunner } from '@/sync/useSync'
import { ToastProvider } from '@/components/Toast'
import { useWahooAutoPush } from '@/sync/useWahoo'

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
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-900/95" aria-label="Nawigacja główna">
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

/** Boczna nawigacja na komputerze (≥ 1024 px); na telefonie zostaje dolny pasek. */
function SideNav() {
  return (
    <nav className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-slate-200 bg-white/80 px-3 py-6 backdrop-blur lg:flex dark:border-slate-700 dark:bg-slate-900/80" aria-label="Nawigacja główna">
      <div className="mb-6 px-3">
        <div className="text-lg font-bold tracking-tight">Trening</div>
        <div className="text-xs text-slate-500">Alpy 2027</div>
      </div>
      <ul className="space-y-1">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${isActive ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
              }
            >
              <span className="text-lg" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <ul className="mt-6 space-y-1 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
        {[
          { to: '/wiecej/sezon', label: 'Sezon' },
          { to: '/wiecej/sprzet', label: 'Sprzęt' },
          { to: '/wiecej/wyjazd', label: 'Wyjazd' },
          { to: '/wiecej/ustawienia', label: 'Ustawienia' },
        ].map((t) => (
          <li key={t.to}>
            <NavLink to={t.to} className={({ isActive }) => `flex min-h-10 items-center rounded-xl px-3 ${isActive ? 'font-semibold text-sky-700 dark:text-sky-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
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
  useWahooAutoPush()
  return (
    <div className="flex w-full flex-1">
      <SideNav />
      <div className="safe-top mx-auto w-full max-w-lg flex-1 lg:max-w-5xl">
        <main className="pb-nav px-4 pt-3 lg:px-8 lg:pt-6 lg:pb-10">
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
      <ToastProvider>
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
            <Route path="wiecej/sprzet" element={<GearPage />} />
            <Route path="wiecej/wyjazd" element={<TripPage />} />
            <Route path="wiecej/ustawienia" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="silownia/:date" element={<GymModePage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}
