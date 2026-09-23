import { NavLink, Navigate, Route, Routes } from 'react-router'
import { useSyncRunner } from '@/sync/useSync'
import { useWahooAutoPush } from '@/sync/useWahoo'
import { usePushKeepalive } from '@/sync/usePush'
import './ios.css'
import { DayScreen } from './screens/DayScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'
import { WeekScreen } from './screens/WeekScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { MoreScreen } from './screens/MoreScreen'
import { IconMore, IconProgress, IconToday, IconWeek } from './components/Icons'

const TABS = [
  { to: '/i', label: 'Dziś', Icon: IconToday, end: true },
  { to: '/i/tydzien', label: 'Tydzień', Icon: IconWeek },
  { to: '/i/postep', label: 'Postęp', Icon: IconProgress },
  { to: '/i/wiecej', label: 'Więcej', Icon: IconMore },
]

function TabBar() {
  return (
    <nav className="ios-tabbar" aria-label="Nawigacja główna">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className="ios-tab">
          <t.Icon size={26} />
          {t.label}
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
  useSyncRunner()
  useWahooAutoPush()
  usePushKeepalive()
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
