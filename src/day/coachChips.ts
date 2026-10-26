/**
 * Podpowiedzi nad klawiaturą w rozmowie z trenerem (docs/24 § 4): zależą od stanu dnia, a nie od pory zegara.
 * `prefill` = tekst do wpisania w pole (zawodnik dokończy), `send` = wysyłane od razu. Czysty TS, testy w __tests__/coachChips.test.ts.
 */
import type { DayPhase } from './dayState'
import { t } from '@/i18n'
import { num } from '@/lib/format'

export interface CoachChip {
  label: string
  /** wstaw do pola i daj dokończyć */
  prefill?: string
  /** wyślij od razu */
  send?: string
}

export interface ChipContext {
  phase: DayPhase
  lastWeightKg: number | null
  rideName: string | null
  /** jutro jest jazda */
  tomorrowRide: string | null
}

export function coachChips(c: ChipContext): CoachChip[] {
  const L = t().day.chips
  const askWeek: CoachChip = { ...L.askWeek }
  const lastRide: CoachChip = { ...L.lastRide }
  const cantTomorrow: CoachChip = { ...L.cantTomorrow }
  const tomorrow: CoachChip = { label: L.tomorrowLabel, send: L.tomorrowSend(c.tomorrowRide) }
  const form: CoachChip = { ...L.form }
  const weight: CoachChip = { ...L.weight }
  const moveRide: CoachChip = { ...L.moveRide }
  const bolt: CoachChip = { ...L.bolt }
  const hurts: CoachChip = { ...L.hurts }
  const kg = c.lastWeightKg != null ? num(c.lastWeightKg, 1) : null
  switch (c.phase) {
    case 'morning':
      return [
        { label: L.weighLabel(kg), prefill: L.weighPrefill(kg) },
        { ...L.sleptBadly },
        { ...L.sleptWell },
        { ...L.sick },
        askWeek,
      ]
    case 'brief':
      return [{ ...L.clothing }, { label: L.watchOutLabel, send: L.watchOutSend(c.rideName) }, lastRide, bolt, cantTomorrow]
    case 'riding':
      return [lastRide, askWeek, form, cantTomorrow, moveRide]
    case 'after':
      return [{ ...L.rpe }, { ...L.howWasIt }, { ...L.wasHard }, tomorrow, cantTomorrow]
    case 'evening':
      return [tomorrow, cantTomorrow, { ...L.moveTomorrow }, form, weight]
    case 'rest':
      return [tomorrow, lastRide, { ...L.wantToRide }, form, weight]
    case 'skipped':
      return [{ ...L.makeUp }, askWeek, tomorrow, cantTomorrow, hurts]
    case 'missed':
    case 'future':
      return [askWeek, lastRide, form, cantTomorrow, moveRide]
  }
}
