import { useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from '@/sync/auth'
import { useSyncRunner } from '@/sync/useSync'
import { useWahooAutoPush } from '@/sync/useWahoo'
import { useEmailSnapshots } from '@/sync/emailSnapshots'
import { usePushKeepalive } from '@/sync/usePush'
import { NO_ACCOUNT } from '@/day/useIos'
import { LoginScreen } from '@/ios/screens/LoginScreen'
import { mobilePathFor } from '@/app/pushNav'
import './m.css'
import { TabBar, Sheet } from './components/Chrome'
import { TodayScreen } from './screens/TodayScreen'
import { PlanScreen } from './screens/PlanScreen'
import { MeScreen } from './screens/MeScreen'
import { ART } from './art'

/**
 * Mobilny interfejs v2 (docs/24): trzy zakładki (Dziś, Plan, Ja) i przycisk Trener. Te same hooki konta,
 * synchronizacji i automatów co `/i` i pełna aplikacja – różni się tylko warstwa ekranów.
 */
export function MobileApp() {
  useSyncRunner()
  useWahooAutoPush()
  useEmailSnapshots()
  usePushKeepalive()
  const auth = useAuth()
  const location = useLocation()
  const [coach, setCoach] = useState(false)
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
    <div className="m flex min-h-dvh flex-col">
      <Routes>
        <Route index element={<TodayScreen />} />
        <Route path="dzien/:date" element={<TodayScreen />} />
        <Route path="plan" element={<PlanScreen />} />
        <Route path="plan/:date" element={<PlanScreen />} />
        <Route path="ja" element={<MeScreen />} />
        <Route path="*" element={<Navigate to={mobilePathFor(location.pathname) ?? '/m'} replace />} />
      </Routes>
      <TabBar onCoach={() => setCoach(true)} />
      {coach && (
        <Sheet title="Trener" onClose={() => setCoach(false)}>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <img src={ART.coachWave} alt="" width={160} height={214} className="h-[214px] w-[160px] object-contain" />
            <p className="m-sub m-dim">Rozmowa z trenerem w nowym wyglądzie powstaje (krok 3 w docs/24). Na razie jest w poprzednim widoku: Dziś → Trener.</p>
          </div>
        </Sheet>
      )}
    </div>
  )
}
