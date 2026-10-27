import { useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/sync/auth'
import { useWahooAutoPush } from '@/sync/useWahoo'
import { useEmailSnapshots } from '@/sync/emailSnapshots'
import { usePushKeepalive } from '@/sync/usePush'
import './ios.css'
import { DayScreen } from './screens/DayScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'
import { WeekScreen } from './screens/WeekScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { MoreScreen } from './screens/MoreScreen'
import { LoginScreen } from './screens/LoginScreen'
import { NO_ACCOUNT } from '@/day/useIos'
import { useT } from '@/i18n/react'
import { IconMore, IconProgress, IconToday, IconWeek } from './components/Icons'

const TABS = [
  { to: '/i', key: 'today', Icon: IconToday, end: true },
  { to: '/i/tydzien', key: 'week', Icon: IconWeek },
  { to: '/i/postep', key: 'progress', Icon: IconProgress },
  { to: '/i/wiecej', key: 'more', Icon: IconMore },
] as const

function TabBar() {
  const t = useT()
  return (
    <nav className="ios-tabbar" aria-label={t.ios.tabs.nav}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={'end' in tab ? tab.end : undefined} className="ios-tab">
          <tab.Icon size={26} />
          {t.ios.tabs[tab.key]}
        </NavLink>
      ))}
    </nav>
  )
}

/**
 * Uproszczony interfejs w stylu natywnej aplikacji iOS: cztery zakładki, jeden wyróżniony
 * krok na dziś, reszta ukryta w pełnej aplikacji (`/`). Pełny zestaw funkcji zostaje bez zmian.
 */
export function IosApp() {
  useWahooAutoPush()
  useEmailSnapshots()
  usePushKeepalive()
  const auth = useAuth()
  const [skipped, setSkipped] = useState(() => {
    try {
      return sessionStorage.getItem(NO_ACCOUNT) === '1'
    } catch {
      return false
    }
  })

  // Konto jest źródłem jazd, check-inów i zmian planu – bez niego ekrany byłyby puste bez wyjaśnienia
  if (auth.configured && !auth.session && !skipped) {
    return (
      <div className="ios">
        {!auth.loading && (
          <LoginScreen
            auth={auth}
            onSkip={() => {
              try {
                sessionStorage.setItem(NO_ACCOUNT, '1')
              } catch {
                /* prywatne okno */
              }
              setSkipped(true)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="ios flex min-h-dvh flex-col">
      <Routes>
        <Route index element={<DayScreen />} />
        <Route path="dzien/:date" element={<DayScreen />} />
        <Route path="trening/:date" element={<WorkoutScreen />} />
        <Route path="tydzien" element={<WeekScreen />} />
        <Route path="tydzien/:monday" element={<WeekScreen />} />
        <Route path="postep" element={<ProgressScreen />} />
        <Route path="wiecej" element={<MoreScreen />} />
        <Route path="*" element={<Navigate to="/i" replace />} />
      </Routes>
      <TabBar />
    </div>
  )
}
