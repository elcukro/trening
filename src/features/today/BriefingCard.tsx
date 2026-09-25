import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import type { DayPlan } from '@/engine/plan'
import type { RuleAction } from '@/engine/rules'
import { adviseRide, clothingFor, fuelPlan, summarizeWindow, weatherLabel, type Advice, type ClothingTable, type DayForecast, type WindowSummary } from '@/engine/weather'
import { DEFAULT_RIDE_HOURS, getLocation, loadForecast, type RideHours } from '@/sync/weather'
import clothingJson from '../../../data/clothing.json'
import { Button, Card, CardSection, CardTitle, Inset, Metric } from '@/components/ui'
import { num } from '@/lib/format'
import { boltLabel, useBoltState } from './WahooStatus'

const CLOTHING = clothingJson as ClothingTable
const ICON: Record<Advice['kind'], string> = { indoor: '🧊', ice: '🧊', shorten_ss: '🥶', heat: '🌡️', rain: '🌧️', wind: '💨', dark: '🔦' }

/**
 * Odprawa przed jazdą (pkt 6): prognoza na okno treningu, propozycje (pod dachem, krótszy SS, upał, deszcz, wiatr,
 * ciemność), ubiór i żywienie w liczbach. Tylko dla dni z jazdą w zasięgu prognozy (7 dni).
 */
export function BriefingCard({ day, onAction, hasOverride }: { day: DayPlan; onAction?: (a: RuleAction) => void; hasOverride?: boolean }) {
  // undefined = jeszcze czytam, null = miejscowość nieustawiona
  const loc = useLiveQuery(getLocation, [], undefined)
  const hoursPref = useLiveQuery(async () => ((await db.kv.get('ride_hours'))?.value as RideHours | undefined) ?? DEFAULT_RIDE_HOURS, [], DEFAULT_RIDE_HOURS)
  const [fetched, setForecast] = useState<{ days: DayForecast[]; stale: boolean } | null | 'loading'>('loading')
  // bez miejscowości nie ma czego pobierać – „brak prognozy” wynika z ustawień, nie z sieci
  const forecast = loc === null ? null : fetched
  const bolt = boltLabel(useBoltState(day))

  useEffect(() => {
    let alive = true
    if (!loc) return
    loadForecast(loc)
      .then((f) => {
        if (alive) setForecast(f ? { days: f.days, stale: f.stale } : null)
      })
      .catch(() => {
        if (alive) setForecast(null)
      })
    return () => {
      alive = false
    }
  }, [loc])

  const w = day.workout
  if (!day.bike || !w || day.bike.workout_id === 'TRIP' || day.bike.workout_id === 'TRAVEL_REST') return null
  const dayF = forecast !== 'loading' && forecast ? forecast.days.find((d) => d.date === day.date) : undefined
  const weekend = day.weekday === 'sat' || day.weekday === 'sun'
  const window = { start_hour: weekend ? hoursPref.weekend : hoursPref.weekday, duration_min: day.bike.duration_min }
  const summary: WindowSummary | null = dayF ? summarizeWindow(dayF, window) : null
  const hasSweetSpot = w.steps.some((s) => s.zone === 'SS' || s.zone === 'THR' || s.zone === 'Z4')
  const advice = summary ? adviseRide(summary, { hasSweetSpot, indoorAvailable: !!day.fallback_workout && !hasOverride }) : []
  const clothing = summary ? clothingFor(summary, CLOTHING) : null
  const fuel = fuelPlan(day.bike.duration_min, day.nutrition.on_bike_carbs_g_per_h, summary?.temp_max_c ?? null)
  const startLabel = `${String(window.start_hour).padStart(2, '0')}:00`

  return (
    <Card tone={advice.some((a) => a.action) ? 'warn' : 'default'}>
      <CardTitle icon="🧭" right={summary ? <Metric>{num(summary.temp_c, 0)} °C · {weatherLabel(summary.code)}</Metric> : undefined}>
        Odprawa przed jazdą
      </CardTitle>
      {forecast === 'loading' && <p className="text-xs text-slate-500 dark:text-slate-400">Pobieram prognozę…</p>}
      {forecast !== 'loading' && !summary && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{loc === null ? (
            <>
              Brak miejscowości prognozy – ustaw ją w{' '}
              <Link to="/wiecej/ustawienia" className="font-medium text-sky-700 underline dark:text-sky-300">
                Ustawieniach
              </Link>
              .
            </>
          ) : forecast === null ? 'Brak prognozy (offline i bez bufora).' : 'Prognoza obejmuje 7 dni – dla tego dnia jeszcze jej nie ma.'} Ubiór i żywienie liczę bez pogody.</p>
      )}
      {summary && (
        <>
          <p className="text-sm tabular-nums">
            {loc?.name}, start {startLabel} ({day.bike.duration_min} min): odczuwalne <b>{num(summary.feels_c, 0)} °C</b> ({num(summary.temp_min_c, 0)}–{num(summary.temp_max_c, 0)}), wiatr {summary.wind_kmh} km/h
            {summary.gust_kmh >= 40 ? ` (porywy ${summary.gust_kmh})` : ''}, deszcz {summary.precip_prob} %, zachód {summary.sunset}.
            {forecast !== 'loading' && forecast?.stale ? ' Prognoza z bufora (offline).' : ''}
          </p>
          {advice.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {advice.map((a) => (
                <li key={a.kind}>
                  <Inset tone={a.action ? 'warn' : 'info'} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>
                      {ICON[a.kind]} {a.message}
                    </span>
                    {a.action && onAction && (
                      <Button size="sm" variant="secondary" onClick={() => onAction({ kind: 'indoor', date: day.date, label: '', payload: {} })}>
                        Zastosuj: pod dachem
                      </Button>
                    )}
                  </Inset>
                </li>
              ))}
            </ul>
          )}
          {advice.length === 0 && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Warunki dobre – bez uwag.</p>}
        </>
      )}
      {bolt && (
        <p className={`mt-2 text-xs ${bolt.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : bolt.tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
          ⌚ Bolt: {bolt.text}
          {bolt.tone !== 'ok' ? ' – przycisk „Wyślij na Wahoo” jest pod treningiem.' : ' Zsynchronizuj licznik przed wyjazdem.'}
        </p>
      )}
      <CardSection className="grid gap-3 sm:grid-cols-2">
        {clothing && (
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">👕 Ubiór ({clothing.label.toLowerCase()})</p>
            <ul className="mt-1 list-disc pl-4 text-sm leading-5">
              {clothing.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        )}
        {fuel && (
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">🍌 Żywienie na {day.bike.duration_min} min</p>
            <ul className="mt-1 list-disc pl-4 text-sm leading-5 tabular-nums">
              {fuel.carbs_g[1] > 0 ? (
                <li>
                  {fuel.carbs_g[0]}–{fuel.carbs_g[1]} g węgli ≈ {fuel.portions} porcji (żel, banan, 500 ml izotoniku = ~25 g)
                </li>
              ) : (
                <li>bez jedzenia</li>
              )}
              <li>
                {fuel.fluid_ml[0]}–{fuel.fluid_ml[1]} ml płynów {fuel.fluid_ml[1] > 1000 ? '(2 bidony)' : '(1 bidon)'}
              </li>
              <li className="text-slate-500 dark:text-slate-400">{fuel.note}</li>
            </ul>
          </div>
        )}
      </CardSection>
    </Card>
  )
}
