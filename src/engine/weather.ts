/**
 * Odprawa przed jazdą (pkt 6, docs/14): z prognozy na okno treningu wyprowadza ostrzeżenia, propozycje (pod dachem,
 * krótszy sweet spot, upał), ubiór i żywienie w liczbach. Czysty TS – prognozę dostarcza `src/sync/weather.ts`.
 *
 * Progi z planu z 20.09 (docs/13): < −10 °C → 4×4 na rowerku (pod dachem), −5…−10 °C → sweet spot skrócony,
 * gołoledź (opady przy ≤ 1 °C) → pod dachem; upał ≥ 28 °C → cele tętna niżej (znacznik `heat`, R13).
 */

export interface HourForecast {
  /** ISO lokalny, np. 2026-09-22T18:00 */
  time: string
  temp_c: number
  feels_c: number
  precip_mm: number
  precip_prob: number
  wind_kmh: number
  gust_kmh: number
  /** kod WMO */
  code: number
}

export interface DayForecast {
  date: string
  sunrise: string
  sunset: string
  hours: HourForecast[]
}

export interface RideWindow {
  /** godzina startu (0–23) i czas trwania w minutach */
  start_hour: number
  duration_min: number
}

export interface WindowSummary {
  from: string
  to: string
  temp_c: number
  feels_c: number
  temp_min_c: number
  temp_max_c: number
  wind_kmh: number
  gust_kmh: number
  precip_mm: number
  precip_prob: number
  /** czy koniec jazdy wypada po zachodzie słońca (albo start przed wschodem) */
  dark: boolean
  sunset: string
  code: number
}

export type AdviceKind = 'indoor' | 'shorten_ss' | 'heat' | 'rain' | 'wind' | 'dark' | 'ice'

export interface Advice {
  kind: AdviceKind
  message: string
  /** propozycja akcji do zastosowania w planie */
  action?: 'indoor'
}

export interface ClothingBand {
  max_c: number
  label: string
  items: string[]
}

export interface ClothingTable {
  bands: ClothingBand[]
  extras: { rain: string[]; wind: string[]; dark: string[] }
}

export const INDOOR_BELOW_C = -10
export const SHORTEN_SS_BELOW_C = -5
export const HEAT_FROM_C = 28
export const RAIN_PROB_WARN = 50
export const WIND_WARN_KMH = 30
export const GUST_WARN_KMH = 50

function hourOf(iso: string): number {
  return Number(iso.slice(11, 13))
}

/** Prognoza w oknie treningu: średnie i maksima z godzin [start, start + czas). */
export function summarizeWindow(day: DayForecast, w: RideWindow): WindowSummary | null {
  const endHour = w.start_hour + Math.ceil(w.duration_min / 60)
  const hours = day.hours.filter((h) => hourOf(h.time) >= w.start_hour && hourOf(h.time) < Math.max(endHour, w.start_hour + 1))
  if (hours.length === 0) return null
  const avg = (f: (h: HourForecast) => number) => Math.round((hours.reduce((a, h) => a + f(h), 0) / hours.length) * 10) / 10
  const max = (f: (h: HourForecast) => number) => Math.max(...hours.map(f))
  const min = (f: (h: HourForecast) => number) => Math.min(...hours.map(f))
  const sunsetH = hourOf(day.sunset) + Number(day.sunset.slice(14, 16)) / 60
  const sunriseH = hourOf(day.sunrise) + Number(day.sunrise.slice(14, 16)) / 60
  const endH = w.start_hour + w.duration_min / 60
  const midHour = hours[Math.floor(hours.length / 2)]!
  return {
    from: hours[0]!.time,
    to: hours[hours.length - 1]!.time,
    temp_c: avg((h) => h.temp_c),
    feels_c: avg((h) => h.feels_c),
    temp_min_c: min((h) => h.temp_c),
    temp_max_c: max((h) => h.temp_c),
    wind_kmh: Math.round(max((h) => h.wind_kmh)),
    gust_kmh: Math.round(max((h) => h.gust_kmh)),
    precip_mm: Math.round(hours.reduce((a, h) => a + h.precip_mm, 0) * 10) / 10,
    precip_prob: Math.round(max((h) => h.precip_prob)),
    dark: endH > sunsetH || w.start_hour < sunriseH,
    sunset: day.sunset.slice(11, 16),
    code: midHour.code,
  }
}

/** Ostrzeżenia i propozycje na podstawie okna pogody; `hasSweetSpot` = trening z krokami SS/THR. */
export function adviseRide(s: WindowSummary, opts: { hasSweetSpot?: boolean; indoorAvailable?: boolean } = {}): Advice[] {
  const out: Advice[] = []
  const icy = s.temp_min_c <= 1 && (s.precip_mm > 0 || s.precip_prob >= RAIN_PROB_WARN)
  if (s.feels_c < INDOOR_BELOW_C) out.push({ kind: 'indoor', message: `Odczuwalne ${s.feels_c} °C – poniżej −10 °C plan zakłada 4×4 pod dachem.`, action: opts.indoorAvailable === false ? undefined : 'indoor' })
  else if (icy) out.push({ kind: 'ice', message: `Opady przy ${s.temp_min_c} °C – ryzyko gołoledzi. Lepiej pod dachem (R4).`, action: opts.indoorAvailable === false ? undefined : 'indoor' })
  else if (s.feels_c < SHORTEN_SS_BELOW_C && opts.hasSweetSpot) out.push({ kind: 'shorten_ss', message: `Odczuwalne ${s.feels_c} °C – skróć interwały sweet spot o jedną trzecią i wydłuż rozgrzewkę.` })
  if (s.temp_max_c >= HEAT_FROM_C) out.push({ kind: 'heat', message: `Do ${s.temp_max_c} °C – upał: cele tętna 3–5 bpm niżej, 750 ml/h z solą (R13).` })
  if (!icy && s.precip_prob >= RAIN_PROB_WARN) out.push({ kind: 'rain', message: `Deszcz ${s.precip_prob} % (${s.precip_mm} mm) – kurtka, światła, ostrożnie w zakrętach.` })
  if (s.gust_kmh >= GUST_WARN_KMH || s.wind_kmh >= WIND_WARN_KMH) out.push({ kind: 'wind', message: `Wiatr ${s.wind_kmh} km/h (porywy ${s.gust_kmh}) – trasa pod wiatr na wyjeździe, z wiatrem do domu.` })
  if (s.dark) out.push({ kind: 'dark', message: `Koniec jazdy po zachodzie (${s.sunset}) – światła i odblaski.` })
  return out
}

/** Ubiór: pas temperatury odczuwalnej + dodatki na deszcz, wiatr i ciemność. */
export function clothingFor(s: WindowSummary, table: ClothingTable): { label: string; items: string[] } {
  const band = table.bands.find((b) => s.feels_c <= b.max_c) ?? table.bands[table.bands.length - 1]!
  const items = [...band.items]
  if (s.precip_prob >= RAIN_PROB_WARN || s.precip_mm > 0) items.push(...table.extras.rain)
  if (s.wind_kmh >= WIND_WARN_KMH && s.feels_c > 9) items.push(...table.extras.wind)
  if (s.dark) items.push(...table.extras.dark)
  return { label: band.label, items: [...new Set(items)] }
}

export interface FuelPlan {
  carbs_g: [number, number]
  fluid_ml: [number, number]
  /** przykładowe porcje na całą jazdę (≈ 25 g węgli każda) */
  portions: number
  note: string
}

/** Żywienie w liczbach: g węgli i ml płynów na cały trening (upał: górne widełki + sól). */
export function fuelPlan(durationMin: number, carbsPerHour: [number, number], tempMaxC: number | null): FuelPlan | null {
  const h = durationMin / 60
  if (carbsPerHour[1] <= 0 || durationMin < 60) return { carbs_g: [0, 0], fluid_ml: [Math.round(h * 500), Math.round(h * 750)], portions: 0, note: durationMin < 60 ? 'Do godziny wystarczy woda; jedz po treningu.' : 'Trening na czczo/bez jedzenia – tylko picie.' }
  const hot = tempMaxC != null && tempMaxC >= HEAT_FROM_C
  const carbs: [number, number] = [Math.round(h * carbsPerHour[0]), Math.round(h * carbsPerHour[1])]
  const fluid: [number, number] = hot ? [Math.round(h * 750), Math.round(h * 1000)] : [Math.round(h * 500), Math.round(h * 750)]
  const portions = Math.max(1, Math.round(((carbs[0] + carbs[1]) / 2) / 25))
  return { carbs_g: carbs, fluid_ml: fluid, portions, note: hot ? 'Upał: sól w bidonie (0,5 g/l), pij co 15 min.' : 'Zacznij jeść po 30–40 min, potem co 20 min.' }
}

/** Opis kodu WMO po polsku (skrót). */
export function weatherLabel(code: number): string {
  if (code === 0) return 'słonecznie'
  if (code <= 2) return 'częściowo pochmurno'
  if (code === 3) return 'pochmurno'
  if (code === 45 || code === 48) return 'mgła'
  if (code >= 51 && code <= 57) return 'mżawka'
  if (code >= 61 && code <= 67) return 'deszcz'
  if (code >= 71 && code <= 77) return 'śnieg'
  if (code >= 80 && code <= 82) return 'przelotny deszcz'
  if (code >= 85 && code <= 86) return 'przelotny śnieg'
  if (code >= 95) return 'burza'
  return 'zmiennie'
}
