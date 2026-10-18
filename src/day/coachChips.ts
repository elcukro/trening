/**
 * Podpowiedzi nad klawiaturą w rozmowie z trenerem (docs/24 § 4): zależą od stanu dnia, a nie od pory zegara.
 * `prefill` = tekst do wpisania w pole (zawodnik dokończy), `send` = wysyłane od razu. Czysty TS, testy w __tests__/coachChips.test.ts.
 */
import type { DayPhase } from './dayState'

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

const pl = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',')

export function coachChips(c: ChipContext): CoachChip[] {
  const askWeek: CoachChip = { label: 'Co w tym tygodniu?', send: 'Co mnie czeka w tym tygodniu?' }
  const lastRide: CoachChip = { label: 'Jak wyszła ostatnia jazda?', send: 'Jak wyszła moja ostatnia jazda?' }
  const cantTomorrow: CoachChip = { label: 'Jutro nie dam rady', prefill: 'Jutro nie dam rady jechać, bo ' }
  const tomorrow: CoachChip = c.tomorrowRide ? { label: 'Co jutro?', send: `Co mnie czeka jutro (${c.tomorrowRide})?` } : { label: 'Co jutro?', send: 'Co mnie czeka jutro?' }
  const form: CoachChip = { label: 'Jak moja forma?', send: 'Jak oceniasz moją formę w ostatnich dwóch tygodniach?' }
  const weight: CoachChip = { label: 'Jak idzie z wagą?', send: 'Jak idzie z wagą względem celu?' }
  const moveRide: CoachChip = { label: 'Przenieś jazdę…', prefill: 'Przenieś jazdę z ' }
  const bolt: CoachChip = { label: 'Wyślij na Bolta', send: 'Wyślij plan na Bolta' }
  const hurts: CoachChip = { label: 'Coś mnie boli', prefill: 'Boli mnie ' }
  switch (c.phase) {
    case 'morning':
      return [
        { label: c.lastWeightKg != null ? `Waga ${pl(c.lastWeightKg)}…` : 'Waga…', prefill: c.lastWeightKg != null ? `Waga ${pl(c.lastWeightKg)}, tętno ` : 'Waga ' },
        { label: 'Spałem słabo, nogi ciężkie', send: 'Spałem słabo, nogi ciężkie' },
        { label: 'Spałem dobrze, nogi lekkie', send: 'Spałem dobrze, nogi lekkie, motywacja pełna' },
        { label: 'Jestem chory', prefill: 'Jestem chory: ' },
        askWeek,
      ]
    case 'brief':
      return [{ label: 'Jak się dziś ubrać?', send: 'Jak się dziś ubrać na jazdę?' }, { label: 'Na co uważać?', send: c.rideName ? `Na co uważać dziś w treningu „${c.rideName}”?` : 'Na co uważać dziś w treningu?' }, lastRide, bolt, cantTomorrow]
    case 'riding':
      return [lastRide, askWeek, form, cantTomorrow, moveRide]
    case 'after':
      return [{ label: 'RPE…', prefill: 'RPE ' }, { label: 'Jak wyszło?', send: 'Jak wyszła dzisiejsza jazda?' }, { label: 'Było ciężko', send: 'Było ciężko, nogi padły w drugiej połowie' }, tomorrow, cantTomorrow]
    case 'evening':
      return [tomorrow, cantTomorrow, { label: 'Przenieś jutro na…', prefill: 'Przenieś jutrzejszą jazdę na ' }, form, weight]
    case 'rest':
      return [tomorrow, lastRide, { label: 'Chcę dziś pojechać', send: 'Mam dziś wolne, ale chcę pojechać – co proponujesz?' }, form, weight]
    case 'skipped':
      return [{ label: 'Odrobić w tym tygodniu?', send: 'Odpuściłem dzisiejszy trening – odrabiać go w tym tygodniu?' }, askWeek, tomorrow, cantTomorrow, hurts]
    case 'missed':
    case 'future':
      return [askWeek, lastRide, form, cantTomorrow, moveRide]
  }
}
