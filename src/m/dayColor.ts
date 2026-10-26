import type { DayType } from '@/engine/types'

/** Kolor dnia (docs/24 § 5): ekran mówi kolorem, jaki to dzień – Z2 zielony, akcent pomarańczowy, test czerwony, wolne szary. */
export function dayColor(dayType: DayType | null | undefined, test = false): { color: string; soft: string } {
  if (test) return { color: 'var(--red)', soft: 'rgb(255 59 48 / 0.14)' }
  switch (dayType) {
    case 'key':
      return { color: 'var(--orange)', soft: 'rgb(255 149 0 / 0.16)' }
    case 'easy':
    case 'long':
      return { color: 'var(--green)', soft: 'rgb(47 179 83 / 0.14)' }
    case 'trip':
      return { color: 'var(--accent)', soft: 'var(--accent-soft)' }
    default:
      return { color: 'var(--label-2)', soft: 'var(--fill)' }
  }
}
