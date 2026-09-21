import { db } from '@/db'
import type { DayForecast } from '@/engine/weather'

/**
 * Prognoza z Open-Meteo (bez klucza, CORS) na 7 dni dla zapisanej lokalizacji; bufor w `kv` na 3 h,
 * żeby odprawa działała offline i nie odpytywała API przy każdym otwarciu ekranu Dziś.
 */

export interface WeatherLocation {
  name: string
  lat: number
  lon: number
}

export interface RideHours {
  weekday: number
  weekend: number
}

export const DEFAULT_LOCATION: WeatherLocation = { name: 'Łódź', lat: 51.77, lon: 19.46 }
export const DEFAULT_RIDE_HOURS: RideHours = { weekday: 18, weekend: 10 }
const TTL_MS = 3 * 60 * 60 * 1000

export async function getLocation(): Promise<WeatherLocation> {
  return ((await db.kv.get('weather_location'))?.value as WeatherLocation | undefined) ?? DEFAULT_LOCATION
}

export async function setLocation(loc: WeatherLocation): Promise<void> {
  await db.kv.put({ key: 'weather_location', value: loc, updated_at: new Date().toISOString() })
  await db.kv.where('key').startsWith('weather:').delete()
}

export async function getRideHours(): Promise<RideHours> {
  return ((await db.kv.get('ride_hours'))?.value as RideHours | undefined) ?? DEFAULT_RIDE_HOURS
}

export async function setRideHours(h: RideHours): Promise<void> {
  await db.kv.put({ key: 'ride_hours', value: h, updated_at: new Date().toISOString() })
}

/** Wyszukiwanie miejscowości (Open-Meteo geocoding). */
export async function geocode(name: string): Promise<WeatherLocation[]> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=pl&format=json`)
  if (!res.ok) throw new Error(`Geokodowanie ${res.status}`)
  const data = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[] }
  return (data.results ?? []).map((r) => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), lat: Math.round(r.latitude * 100) / 100, lon: Math.round(r.longitude * 100) / 100 }))
}

interface OpenMeteo {
  hourly: { time: string[]; temperature_2m: number[]; apparent_temperature: number[]; precipitation: number[]; precipitation_probability: number[]; wind_speed_10m: number[]; wind_gusts_10m: number[]; weather_code: number[] }
  daily: { time: string[]; sunrise: string[]; sunset: string[] }
}

function toDays(m: OpenMeteo): DayForecast[] {
  const byDate = new Map<string, DayForecast>()
  m.daily.time.forEach((date, i) => byDate.set(date, { date, sunrise: m.daily.sunrise[i]!, sunset: m.daily.sunset[i]!, hours: [] }))
  m.hourly.time.forEach((t, i) => {
    const d = byDate.get(t.slice(0, 10))
    if (!d) return
    d.hours.push({ time: t, temp_c: m.hourly.temperature_2m[i]!, feels_c: m.hourly.apparent_temperature[i]!, precip_mm: m.hourly.precipitation[i]!, precip_prob: m.hourly.precipitation_probability[i] ?? 0, wind_kmh: m.hourly.wind_speed_10m[i]!, gust_kmh: m.hourly.wind_gusts_10m[i]!, code: m.hourly.weather_code[i]! })
  })
  return [...byDate.values()]
}

/** Prognoza 7-dniowa (z bufora, gdy świeższa niż 3 h albo brak sieci). */
export async function loadForecast(loc: WeatherLocation): Promise<{ days: DayForecast[]; fetched_at: string; stale: boolean } | null> {
  const key = `weather:${loc.lat},${loc.lon}`
  const cached = (await db.kv.get(key))?.value as { days: DayForecast[]; fetched_at: string } | undefined
  const fresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS
  if (fresh) return { ...cached, stale: false }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return cached ? { ...cached, stale: true } : null
  try {
    const p = new URLSearchParams({
      latitude: String(loc.lat),
      longitude: String(loc.lon),
      hourly: 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code',
      daily: 'sunrise,sunset',
      timezone: 'Europe/Warsaw',
      forecast_days: '7',
    })
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`)
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    const value = { days: toDays((await res.json()) as OpenMeteo), fetched_at: new Date().toISOString() }
    await db.kv.put({ key, value, updated_at: value.fetched_at })
    return { ...value, stale: false }
  } catch {
    return cached ? { ...cached, stale: true } : null
  }
}
