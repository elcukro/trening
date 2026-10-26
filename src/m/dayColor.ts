import type { DayType } from '@/engine/types'

/**
 * Kolor dnia (docs/24 § 5): ekran mówi kolorem, jaki to dzień – Z2 zielony, akcent pomarańczowy, test czerwony, wolne szary.
 * `fill` to ciemniejszy odcień pod biały tekst (przyciski, wybrane RPE): kontrast ≥ 4,5:1 – systemowe pomarańczowy
 * i zielony mają z bielą 2,2 i 2,7 (docs/27 § 3.1). `color` zostaje do akcentów bez tekstu na nim.
 */
export function dayColor(dayType: DayType | null | undefined, test = false): { color: string; soft: string; fill: string } {
  if (test) return { color: 'var(--red)', soft: 'rgb(255 59 48 / 0.14)', fill: '#d70015' }
  switch (dayType) {
    case 'key':
      return { color: 'var(--orange)', soft: 'rgb(255 149 0 / 0.16)', fill: '#b35c00' }
    case 'easy':
    case 'long':
      return { color: 'var(--green)', soft: 'rgb(47 179 83 / 0.14)', fill: '#1a7f37' }
    case 'trip':
      return { color: 'var(--accent)', soft: 'var(--accent-soft)', fill: 'var(--accent)' }
    default:
      return { color: 'var(--label-2)', soft: 'var(--fill)', fill: '#636366' }
  }
}
