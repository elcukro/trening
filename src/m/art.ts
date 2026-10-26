/**
 * Grafiki mobilnego v2 (docs/24 § 5): miękkie rendery 3D z przezroczystym tłem, generowane `node scripts/fal-art.mjs`
 * (fal.ai, klucz poza repo) do `public/m/art/`. Tu tylko mapowania na stany aplikacji.
 */
import type { DayType } from '@/engine/types'

export const ART = {
  coach: '/m/art/coach.png',
  coachWave: '/m/art/coach-wave.png',
  bolt: '/m/art/bolt.png',
  scale: '/m/art/scale.png',
  heart: '/m/art/heart.png',
  test: '/m/art/test.png',
  rest: '/m/art/rest.png',
  ride_key: '/m/art/ride-key.png',
} as const

/** Ikona typu dnia: Z2/lekko – gravel, akcent – błyskawica, długa – droga przez wzgórze, test – stoper, wolne – kawa. */
export function dayArt(dayType: DayType | null | undefined, test = false): string {
  if (test) return ART.test
  switch (dayType) {
    case 'easy':
      return '/m/art/ride-easy.png'
    case 'key':
      return '/m/art/ride-key.png'
    case 'long':
    case 'trip':
      return '/m/art/ride-long.png'
    default:
      return ART.rest
  }
}

/**
 * Ikona pogody z kodu WMO (Open-Meteo `weather_code`) i pory dnia – te same progi co opisy w `src/engine/weather.ts`.
 * 0 bezchmurnie · 1–2 częściowo · 3 zachmurzenie · 45/48 mgła · 51–67 deszcz/mżawka · 71–77 śnieg · 80–82 przelotny deszcz · 85–86 śnieg · 95–99 burza.
 */
export function weatherArt(code: number | null | undefined, opts: { night?: boolean; windKmh?: number | null } = {}): string {
  if (code == null) return '/m/art/cloud.png'
  if (code >= 95) return '/m/art/storm.png'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '/m/art/snow.png'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '/m/art/rain.png'
  if (code === 45 || code === 48) return '/m/art/fog.png'
  if ((opts.windKmh ?? 0) >= 25 && code <= 3) return '/m/art/wind.png'
  if (code === 0) return opts.night ? '/m/art/night.png' : '/m/art/sun.png'
  if (code <= 2) return opts.night ? '/m/art/night.png' : '/m/art/partly-cloudy.png'
  return '/m/art/cloud.png'
}
