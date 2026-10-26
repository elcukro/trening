import { useLiveQuery } from 'dexie-react-hooks'
import { db, type OnboardingRow } from '@/db'
import { ONBOARDING_ID } from '@/engine/onboarding'
import { SYNCED_TABLES_KEY } from '@/sync/sync'
import { onboardingDue } from './onboarding'

/** sessionStorage: „Później” – onboarding nie wraca sam do końca sesji. */
export const ONBOARDING_LATER = 'trening:onboarding-later'

/** Wiersz onboardingu konta: `undefined` w trakcie ładowania, `null` – brak. */
export function useOnboardingRow(): OnboardingRow | null | undefined {
  return useLiveQuery(() => db.onboarding.get(ONBOARDING_ID).then((r) => r ?? null), [], undefined)
}

/** Czy pokazać onboarding samemu (docs/31 § Kiedy się pokazuje). */
export function useOnboardingDue(signedIn: boolean): boolean {
  const row = useOnboardingRow()
  const synced = useLiveQuery(async () => {
    const v = (await db.kv.get(SYNCED_TABLES_KEY))?.value
    return Array.isArray(v) && v.includes('onboarding')
  }, [], false)
  let later = false
  try {
    later = sessionStorage.getItem(ONBOARDING_LATER) === '1'
  } catch {
    /* prywatne okno */
  }
  return onboardingDue({ signedIn, synced, row, later })
}
