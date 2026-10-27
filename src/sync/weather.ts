import { db } from '@/db'
import { withFieldStamps } from './profileMerge'
import { getLang } from '@/i18n/core'
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

export const DEFAULT_RIDE_HOURS: RideHours = { weekday: 18, weekend: 10 }
const TTL_MS = 3 * 60 * 60 * 1000

type ProfileKey = 'weather_location' | 'ride_hours'

/**
 * Miejscowość i godziny jazdy należą do konta (profil, `PROFILE_MAP`) – wracają po zalogowaniu na nowym urządzeniu.
 * Do 27.10.2026 leżały w `kv` urządzenia; stara wartość z `kv` jest zapasem, a do profilu przenosi ją synchronizacja
 * (`adoptDeviceWeather`). Bez konta (brak wiersza ustawień) zostają w `kv` – zapis ustawień ominąłby czekanie na profil.
 * Odczyt tylko czyta: wołają go `useLiveQuery`, w których Dexie zabrania zapisu („Readwrite transaction in liveQuery”).
 */
async function readField<T>(key: ProfileKey): Promise<T | null> {
  const own = (await db.settings.get('user'))?.value?.[key] as T | null | undefined
  if (own != null) return own
  return ((await db.kv.get(key))?.value as T | undefined) ?? null
}

/** Po pobraniu profilu: wartość z `kv` urządzenia trafia do profilu, jeśli konto jeszcze jej nie ma (raz, w synchronizacji). */
export async function adoptDeviceWeather(): Promise<void> {
  const row = await db.settings.get('user')
  if (!row) return
  for (const key of ['weather_location', 'ride_hours'] as const) {
    if (row.value?.[key] !== undefined) continue
    const local = (await db.kv.get(key))?.value
    if (local != null) await writeField(key, local)
  }
}

async function writeField(key: ProfileKey, value: unknown): Promise<void> {
  const now = new Date().toISOString()
  await db.kv.put({ key, value, updated_at: now })
  const row = await db.settings.get('user')
  if (!row) return
  const stamps = withFieldStamps({ value: row.value, updated_at: row.updated_at, field_updated_at: row.field_updated_at })
  await db.settings.put({ ...row, value: { ...row.value, [key]: value }, updated_at: now, field_updated_at: { ...stamps, [key]: now } })
}

/**
 * Miejscowość prognozy; `null` = jeszcze nieustawiona. Bez wartości domyślnej –
 * cudze miasto dawałoby odprawę z pogodą z niewłaściwego miejsca (docs/18, A8).
 */
export function getLocation(): Promise<WeatherLocation | null> {
  return readField<WeatherLocation>('weather_location')
}

export async function setLocation(loc: WeatherLocation): Promise<void> {
  await writeField('weather_location', loc)
  await db.kv.where('key').startsWith('weather:').delete()
}

export async function getRideHours(): Promise<RideHours> {
  return (await readField<RideHours>('ride_hours')) ?? DEFAULT_RIDE_HOURS
}

export async function setRideHours(h: RideHours): Promise<void> {
  await writeField('ride_hours', h)
}

/** Wyszukiwanie miejscowości (Open-Meteo geocoding). */
export async function geocode(name: string): Promise<WeatherLocation[]> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${getLang()}&format=json`)
  if (!res.ok) throw new Error(`Geocoding ${res.status}`)
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
