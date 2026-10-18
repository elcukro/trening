import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from '@/sync/auth'
import { useWahooAutoPush } from '@/sync/useWahoo'
import { useEmailSnapshots } from '@/sync/emailSnapshots'
import { usePushKeepalive } from '@/sync/usePush'
import { NO_ACCOUNT } from '@/day/useIos'
import { LoginScreen } from '@/ios/screens/LoginScreen'
// ekran logowania jest wspólny z /i i potrzebuje jego arkusza (reszta /m ma własny m.css)
import '@/ios/ios.css'
import { mobilePathFor } from '@/app/pushNav'
import './m.css'
import { TabBar } from './components/Chrome'
import { CoachSheet } from './components/CoachSheet'
import { useViewport } from './useViewport'
import { TodayScreen } from './screens/TodayScreen'
import { PlanScreen } from './screens/PlanScreen'
import { MeScreen } from './screens/MeScreen'
import { RideScreen } from './screens/RideScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { CoachContext } from './coach'

/**
 * Mobilny interfejs v2 (docs/24): trzy zakładki (Dziś, Plan, Ja) i przycisk Trener. Te same hooki konta,
 * synchronizacji i automatów co `/i` i pełna aplikacja – różni się tylko warstwa ekranów.
 */
export function MobileApp() {
  useWahooAutoPush()
  useEmailSnapshots()
  usePushKeepalive()
  useViewport()
  const auth = useAuth()
  const location = useLocation()
  // arkusz Trener otwierany z paska i z kart (CoachContext); `prefill` to początek wiadomości, np. „Waga ”
  const [coach, setCoach] = useState<false | { prefill?: string }>(false)
  const coachApi = useMemo(() => ({ open: (prefill?: string) => setCoach({ prefill }) }), [])
  // przewijanie w kontenerze, nie w oknie – nowy ekran zaczyna od góry
  const scroller = useRef<HTMLElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [location.pathname])
  const [skipped, setSkipped] = useState(() => {
    try {
      return sessionStorage.getItem(NO_ACCOUNT) === '1'
    } catch {
      return false
    }
  })

  if (auth.configured && !auth.session && !skipped) {
    // ekran logowania jest wspólny z `/i` (do przeniesienia do src/day po doszlifowaniu v2)
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
    <CoachContext.Provider value={coachApi}>
      <div className="m">
        <main ref={scroller} className="m-scroll">
          <Routes>
            <Route index element={<TodayScreen />} />
            <Route path="dzien/:date" element={<TodayScreen />} />
            <Route path="plan" element={<PlanScreen />} />
            <Route path="plan/:date" element={<PlanScreen />} />
            <Route path="jazda/:date" element={<RideScreen />} />
            <Route path="podsumowanie/:date" element={<SummaryScreen />} />
            <Route path="ja" element={<MeScreen />} />
            <Route path="*" element={<Navigate to={mobilePathFor(location.pathname) ?? '/m'} replace />} />
          </Routes>
        </main>
        <TabBar onCoach={() => setCoach({})} />
        {coach && <CoachSheet prefill={coach.prefill} onClose={() => setCoach(false)} />}
      </div>
    </CoachContext.Provider>
  )
}
