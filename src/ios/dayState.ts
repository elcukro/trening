import { diffDays, type ISODate } from '@/engine/dates'

/**
 * Stan dnia dla uproszczonego interfejsu: lista kroków „od rana do podsumowania”
 * i jedno wyróżnione działanie („co teraz?”). Czysta funkcja – testowana w `__tests__/dayState.test.ts`.
 */

export type StepKey = 'checkin' | 'bolt' | 'train' | 'log'

export interface DayStep {
  key: StepKey
  title: string
  detail: string | null
  done: boolean
  /** czy krok jest jeszcze sensowny (np. wysyłka na Bolta nie ma sensu po fakcie) */
  actionable: boolean
}

export type LogState = 'none' | 'planned' | 'in_progress' | 'done' | 'modified' | 'skipped'

export interface DayFlowInput {
  date: ISODate
  today: ISODate
  /** jazda tego dnia (po nadpisaniach) */
  ride: { name: string; minutes: number; pushable: boolean } | null
  gym: { name: string } | null
  checkedIn: boolean
  /** plan jazdy leży na Bolcie w aktualnej wersji */
  boltReady: boolean
  rideLog: LogState
  gymLog: LogState
  /** jest już jazda ze Stravy na ten dzień */
  hasActivity: boolean
}

export interface DayFlow {
  steps: DayStep[]
  /** pierwszy niezrobiony krok, który da się teraz wykonać */
  next: DayStep | null
  /** ile kroków zrobione / ile wszystkich */
  progress: { done: number; total: number }
  past: boolean
  future: boolean
}

const LOGGED: LogState[] = ['done', 'modified', 'skipped']

export function dayFlow(inp: DayFlowInput): DayFlow {
  const past = inp.date < inp.today
  const future = inp.date > inp.today
  const steps: DayStep[] = []

  steps.push({
    key: 'checkin',
    title: 'Poranny check-in',
    detail: inp.checkedIn ? null : 'Waga, sen, nogi, motywacja – 20 sekund',
    done: inp.checkedIn,
    actionable: !future,
  })

  if (inp.ride?.pushable) {
    steps.push({
      key: 'bolt',
      title: 'Plan na Bolcie',
      detail: inp.boltReady ? 'Wysłany – zsynchronizuj licznik' : 'Wyślij trening na licznik',
      done: inp.boltReady,
      actionable: !past,
    })
  }

  // dzień z jazdą prowadzi przez jazdę (siłownia ma wtedy własną kartę); dzień bez jazdy – przez siłownię
  const gymOnly = !inp.ride && !!inp.gym
  if (inp.ride || inp.gym) {
    const logged = gymOnly ? LOGGED.includes(inp.gymLog) : LOGGED.includes(inp.rideLog)
    steps.push({
      key: 'train',
      title: gymOnly ? inp.gym!.name : (inp.ride?.name ?? 'Trening'),
      detail: gymOnly ? 'Tryb siłowni: serie, ciężary, przerwy' : inp.ride ? `${inp.ride.minutes} min` : null,
      done: gymOnly ? logged : inp.hasActivity || logged,
      actionable: !future,
    })
    steps.push({
      key: 'log',
      title: 'Podsumowanie',
      detail: logged ? null : 'Jak poszło? Jedno dotknięcie',
      done: logged,
      actionable: !future,
    })
  }

  const actionable = steps.filter((s) => s.actionable)
  return {
    steps,
    next: actionable.find((s) => !s.done) ?? null,
    progress: { done: steps.filter((s) => s.done).length, total: steps.length },
    past,
    future,
  }
}

/** Ważenie co drugi dzień – bez presji codziennego stawania na wadze. */
export function weighDue(lastWeightDate: ISODate | null, today: ISODate): boolean {
  if (!lastWeightDate) return true
  return diffDays(today, lastWeightDate) >= 2
}

export interface FormLabel {
  text: string
  hint: string
  tone: 'good' | 'ok' | 'warn'
}

/** TSB (forma) w ludzkich słowach – zamiast liczby, której nikt rano nie interpretuje. */
export function formLabel(tsb: number | null): FormLabel | null {
  if (tsb == null || !Number.isFinite(tsb)) return null
  if (tsb > 20) return { text: 'Wypoczęty', hint: 'Dużo świeżości – można docisnąć', tone: 'good' }
  if (tsb > 5) return { text: 'Świeży', hint: 'Dobry moment na mocny trening', tone: 'good' }
  if (tsb > -12) return { text: 'W formie', hint: 'Równowaga między obciążeniem a odpoczynkiem', tone: 'ok' }
  if (tsb > -28) return { text: 'Zmęczony', hint: 'Normalne w bloku – pilnuj snu', tone: 'ok' }
  return { text: 'Przeciążony', hint: 'Rozważ lżejszy dzień', tone: 'warn' }
}

/** Ocena zgodności wykonania z planem – jedno zdanie zamiast tabeli kroków. */
export function rideVerdict(score: number | null): { text: string; tone: 'good' | 'ok' | 'warn' } | null {
  if (score == null) return null
  if (score >= 85) return { text: 'Zgodnie z planem', tone: 'good' }
  if (score >= 70) return { text: 'Blisko planu', tone: 'ok' }
  if (score >= 45) return { text: 'Sporo odstępstw od planu', tone: 'warn' }
  return { text: 'Inny trening niż zaplanowany', tone: 'warn' }
}

/** Postęp do celu programu: obecne FTP względem wymaganego. */
export function goalProgress(ftp: number | null, goalFtp: number): { pct: number; missing: number } | null {
  if (!ftp || !goalFtp) return null
  return { pct: Math.max(0, Math.min(100, Math.round((ftp / goalFtp) * 100))), missing: Math.max(0, Math.round(goalFtp - ftp)) }
}
