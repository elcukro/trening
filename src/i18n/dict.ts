/** Słowniki wszystkich przestrzeni nazw (docs/34 § 3). Nowa przestrzeń = para plików w pl/ i en/ + wpis tutaj. */
import pl_common from './pl/common'
import pl_errors from './pl/errors'
import pl_login from './pl/login'
import pl_coach from './pl/coach'
import pl_m from './pl/m'
import pl_onboarding from './pl/onboarding'
import pl_ios from './pl/ios'
import pl_classic from './pl/classic'
import pl_progress from './pl/progress'
import pl_settings from './pl/settings'
import pl_day from './pl/day'
import pl_sync from './pl/sync'
import pl_engine from './pl/engine'
import en_common from './en/common'
import en_errors from './en/errors'
import en_login from './en/login'
import en_coach from './en/coach'
import en_m from './en/m'
import en_onboarding from './en/onboarding'
import en_ios from './en/ios'
import en_classic from './en/classic'
import en_progress from './en/progress'
import en_settings from './en/settings'
import en_day from './en/day'
import en_sync from './en/sync'
import en_engine from './en/engine'

export const pl = {
  common: pl_common,
  errors: pl_errors,
  login: pl_login,
  coach: pl_coach,
  m: pl_m,
  onboarding: pl_onboarding,
  ios: pl_ios,
  classic: pl_classic,
  progress: pl_progress,
  settings: pl_settings,
  day: pl_day,
  sync: pl_sync,
  engine: pl_engine,
}

export type Messages = typeof pl

export const en: Messages = {
  common: en_common,
  errors: en_errors,
  login: en_login,
  coach: en_coach,
  m: en_m,
  onboarding: en_onboarding,
  ios: en_ios,
  classic: en_classic,
  progress: en_progress,
  settings: en_settings,
  day: en_day,
  sync: en_sync,
  engine: en_engine,
}
