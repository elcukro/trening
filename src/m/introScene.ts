import type { ISODate } from '@/engine/dates'

/**
 * Wybór sceny ekranu startowego aplikacji iOS (docs/27 § Stan wdrożenia): pora roku daje warstwy krajobrazu
 * (`public/m/intro/intro-<pora>-{far,near,road}.webp`), pora dnia – niebo, słońce/księżyc i odcień warstw w CSS.
 * Czysty TS bez UI i zegara; datę i godzinę w Europe/Warsaw podaje wywołujący (`todayISO`, `nowHour`).
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type DayTime = 'morning' | 'noon' | 'evening' | 'night'

export interface IntroScene {
  season: Season
  time: DayTime
}

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
const TIMES: DayTime[] = ['morning', 'noon', 'evening', 'night']

/** Pory roku meteorologiczne: marzec–maj wiosna, czerwiec–sierpień lato, wrzesień–listopad jesień, grudzień–luty zima. */
export function seasonOf(date: ISODate): Season {
  const month = Number(date.slice(5, 7))
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

/** Przybliżony wschód i zachód słońca w Polsce wg miesiąca, pełne godziny czasu lokalnego (z czasem letnim). */
const SUN: Record<number, [rise: number, set: number]> = {
  1: [8, 16], 2: [7, 17], 3: [6, 18], 4: [6, 19], 5: [5, 20], 6: [4, 21],
  7: [5, 21], 8: [5, 20], 9: [6, 19], 10: [7, 17], 11: [7, 16], 12: [8, 15],
}

/**
 * Pora dnia z godziny i miesiąca: noc przed wschodem i od godziny po zachodzie, rano do 11:00, wieczór od godziny
 * przed zachodem – w grudniu o 16:00 jest już noc, w czerwcu o 20:00 dopiero wieczór.
 */
export function dayTimeOf(date: ISODate, hour: number): DayTime {
  const [rise, set] = SUN[Number(date.slice(5, 7))] ?? [6, 18]
  if (hour < rise || hour > set) return 'night'
  if (hour < 11) return 'morning'
  if (hour < set - 1) return 'noon'
  return 'evening'
}

export function introScene(date: ISODate, hour: number): IntroScene {
  return { season: seasonOf(date), time: dayTimeOf(date, hour) }
}

/** Wariant zadany ręcznie (`autumn-morning`, podgląd i zrzuty) albo null, gdy napis nie jest wariantem. */
export function parseScene(value: string | null | undefined): IntroScene | null {
  const [season, time] = (value ?? '').split('-') as [Season, DayTime]
  if (!SEASONS.includes(season) || !TIMES.includes(time)) return null
  return { season, time }
}

/** Pliki warstw sceny (do wczytania przed pokazaniem intro – bez doczytywania w trakcie animacji). */
export function sceneImages(scene: Pick<IntroScene, 'season'>): string[] {
  return ['far', 'near', 'road'].map((l) => `/m/intro/intro-${scene.season}-${l}.webp`).concat('/m/intro/intro-rider.webp', '/m/intro/intro-title.webp')
}
