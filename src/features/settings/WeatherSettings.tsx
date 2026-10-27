import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_RIDE_HOURS, geocode, getLocation, setLocation, setRideHours, getRideHours, type WeatherLocation } from '@/sync/weather'
import { Actions, Button, Card, CardTitle, Field, Input, Select } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useT } from '@/i18n/react'
import { num } from '@/lib/format'

const HOURS = Array.from({ length: 17 }, (_, i) => i + 5) // 5:00–21:00

/** Lokalizacja prognozy i typowe godziny startu jazdy – dla odprawy przed jazdą (pkt 6). Zapis lokalny (kv). */
export function WeatherSettings() {
  const toast = useToast()
  const tw = useT().settings.weather
  const loc = useLiveQuery(getLocation, [], null)
  const hours = useLiveQuery(getRideHours, [], DEFAULT_RIDE_HOURS)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<WeatherLocation[]>([])

  async function search() {
    if (!query.trim()) return
    const r = await toast.run(tw.searching, () => geocode(query), (list) => (list.length ? tw.found(list.length) : tw.notFound))
    setFound(r ?? [])
  }

  return (
    <Card>
      <CardTitle icon="🌤️">{tw.title}</CardTitle>
      <p className="text-sm">
        {loc ? (
          <>
            {tw.forecastFor} <b>{loc.name}</b> <span className="text-xs text-slate-500 dark:text-slate-400">({num(loc.lat, 2)}; {num(loc.lon, 2)})</span>
          </>
        ) : (
          <>
            {tw.forecast} <b>{tw.notSet}</b>
            {tw.notSetHint}
          </>
        )}
      </p>
      <div className="mt-2 flex gap-2">
        <Input aria-label={tw.place} placeholder={tw.placePlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} className="min-w-0 flex-1" />
        <Button variant="secondary" onClick={search} disabled={!query.trim()}>
          {tw.search}
        </Button>
      </div>
      {found.length > 0 && (
        <Actions className="mt-2">
          {found.map((f) => (
            <Button
              key={`${f.lat},${f.lon}`}
              size="sm"
              variant="ghost"
              onClick={() => {
                void setLocation(f)
                setFound([])
                setQuery('')
              }}
            >
              {f.name}
            </Button>
          ))}
        </Actions>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={tw.weekday} hint={tw.weekdayHint}>
          <Select value={hours.weekday} onChange={(e) => void setRideHours({ ...hours, weekday: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tw.weekend}>
          <Select value={hours.weekend} onChange={(e) => void setRideHours({ ...hours, weekend: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tw.foot}</p>
    </Card>
  )
}
