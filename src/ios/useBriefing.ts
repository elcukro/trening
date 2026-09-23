import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import type { DayPlan } from '@/engine/plan'
import { adviseRide, clothingFor, fuelPlan, summarizeWindow, weatherLabel, type Advice, type ClothingTable, type DayForecast, type FuelPlan, type WindowSummary } from '@/engine/weather'
import { DEFAULT_LOCATION, DEFAULT_RIDE_HOURS, loadForecast, type RideHours, type WeatherLocation } from '@/sync/weather'
import clothingJson from '../../data/clothing.json'

const CLOTHING = clothingJson as ClothingTable

export interface Briefing {
  loading: boolean
  location: string
  startLabel: string
  summary: WindowSummary | null
  label: string | null
  advice: Advice[]
  clothing: { label: string; items: string[] } | null
  fuel: FuelPlan | null
  stale: boolean
}

/** Pogoda w oknie treningu plus ubiór i jedzenie – ta sama logika co „Odprawa” w pełnej aplikacji. */
export function useBriefing(day: DayPlan | null, hasIndoorOverride = false): Briefing | null {
  const loc = useLiveQuery(async () => ((await db.kv.get('weather_location'))?.value as WeatherLocation | undefined) ?? DEFAULT_LOCATION, [], DEFAULT_LOCATION)
  const hoursPref = useLiveQuery(async () => ((await db.kv.get('ride_hours'))?.value as RideHours | undefined) ?? DEFAULT_RIDE_HOURS, [], DEFAULT_RIDE_HOURS)
  const [forecast, setForecast] = useState<{ days: DayForecast[]; stale: boolean } | null | 'loading'>('loading')

  useEffect(() => {
    let alive = true
    loadForecast(loc)
      .then((f) => alive && setForecast(f ? { days: f.days, stale: f.stale } : null))
      .catch(() => alive && setForecast(null))
    return () => {
      alive = false
    }
  }, [loc])

  const w = day?.workout
  if (!day?.bike || !w || day.bike.workout_id === 'TRIP' || day.bike.workout_id === 'TRAVEL_REST') return null

  const dayF = forecast !== 'loading' && forecast ? forecast.days.find((d) => d.date === day.date) : undefined
  const weekend = day.weekday === 'sat' || day.weekday === 'sun'
  const startHour = weekend ? hoursPref.weekend : hoursPref.weekday
  const summary = dayF ? summarizeWindow(dayF, { start_hour: startHour, duration_min: day.bike.duration_min }) : null
  const hasSweetSpot = w.steps.some((s) => s.zone === 'SS' || s.zone === 'THR' || s.zone === 'Z4')

  return {
    loading: forecast === 'loading',
    location: loc.name,
    startLabel: `${String(startHour).padStart(2, '0')}:00`,
    summary,
    label: summary ? weatherLabel(summary.code) : null,
    advice: summary ? adviseRide(summary, { hasSweetSpot, indoorAvailable: !!day.fallback_workout && !hasIndoorOverride }) : [],
    clothing: summary ? clothingFor(summary, CLOTHING) : null,
    fuel: fuelPlan(day.bike.duration_min, day.nutrition.on_bike_carbs_g_per_h, summary?.temp_max_c ?? null),
    stale: forecast !== 'loading' && !!forecast?.stale,
  }
}
