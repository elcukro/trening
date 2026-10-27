import { diffDays, type ISODate } from '@/engine/dates'
import { MODIFIED_BELOW } from '@/engine/analysis'
import { t } from '@/i18n'

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
  checkedIn: boolean
  /** plan jazdy leży na Bolcie w aktualnej wersji */
  boltReady: boolean
  rideLog: LogState
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
  const L = t().day.steps

  steps.push({
    key: 'checkin',
    title: L.checkin,
    detail: inp.checkedIn ? null : L.checkinDetail,
    done: inp.checkedIn,
    actionable: !future,
  })

  if (inp.ride?.pushable) {
    steps.push({
      key: 'bolt',
      title: L.bolt,
      detail: inp.boltReady ? L.boltSent : L.boltSend,
      done: inp.boltReady,
      actionable: !past,
    })
  }

  if (inp.ride) {
    const logged = LOGGED.includes(inp.rideLog)
    steps.push({
      key: 'train',
      title: inp.ride.name,
      detail: `${inp.ride.minutes} min`,
      done: inp.hasActivity || logged,
      actionable: !future,
    })
    steps.push({
      key: 'log',
      title: L.log,
      detail: logged ? null : L.logDetail,
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
  const f = t().day.form
  if (tsb > 20) return { ...f.rested, tone: 'good' }
  if (tsb > 5) return { ...f.fresh, tone: 'good' }
  if (tsb > -12) return { ...f.inForm, tone: 'ok' }
  if (tsb > -28) return { ...f.tired, tone: 'ok' }
  return { ...f.overloaded, tone: 'warn' }
}

/** Ocena zgodności wykonania z planem – jedno zdanie zamiast tabeli kroków. */
export function rideVerdict(score: number | null): { text: string; tone: 'good' | 'ok' | 'warn' } | null {
  if (score == null) return null
  const v = t().day.verdict
  if (score >= 85) return { text: v.onPlan, tone: 'good' }
  if (score >= MODIFIED_BELOW) return { text: v.close, tone: 'ok' }
  if (score >= 45) return { text: v.off, tone: 'warn' }
  return { text: v.different, tone: 'warn' }
}

/** Postęp do celu programu: obecne FTP względem wymaganego. */
export function goalProgress(ftp: number | null, goalFtp: number): { pct: number; missing: number } | null {
  if (!ftp || !goalFtp) return null
  return { pct: Math.max(0, Math.min(100, Math.round((ftp / goalFtp) * 100))), missing: Math.max(0, Math.round(goalFtp - ftp)) }
}

/* ------------------------------------------------------------------ stan dnia (mobilny v2, docs/24 § 4) */

/**
 * Jedna karta, która zmienia się w ciągu dnia – zamiast listy kroków.
 * morning → brief → riding → after → evening; dzień wolny: morning → rest; pominięte: skipped; przeszłość bez jazdy: missed.
 */
export type DayPhase = 'morning' | 'brief' | 'riding' | 'after' | 'evening' | 'rest' | 'skipped' | 'missed' | 'future'

export interface DayPhaseInput extends DayFlowInput {
  /** godzina teraz (Europe/Warsaw) – używana tylko dla dzisiejszego dnia */
  hour: number
  /** planowana godzina startu jazdy (ustawienie `ride_hours`) */
  startHour: number
  /** RPE zapisane dla jazdy */
  hasRpe: boolean
}

const EVENING_HOUR = 20

export function dayPhase(inp: DayPhaseInput): DayPhase {
  if (inp.date > inp.today) return 'future'
  const past = inp.date < inp.today
  if (inp.ride && inp.rideLog === 'skipped') return 'skipped'
  const trained = inp.hasActivity || LOGGED.includes(inp.rideLog)
  if (!inp.ride) {
    // jazda w dzień bez planu to „dodatkowa jazda” – karta pokazuje ją jak po treningu (docs/35 W3)
    if (inp.hasActivity) return !past && (inp.hasRpe || inp.hour >= EVENING_HOUR) ? 'evening' : 'after'
    if (!past && !inp.checkedIn) return 'morning'
    return 'rest'
  }
  if (past) return trained ? 'after' : 'missed'
  if (!inp.checkedIn && !trained) return 'morning'
  if (trained) return inp.hasRpe || inp.hour >= EVENING_HOUR ? 'evening' : 'after'
  if (inp.hour >= EVENING_HOUR) return 'evening'
  if (inp.hour >= inp.startHour) return 'riding'
  return 'brief'
}
