import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { DEFAULT_RIDE_HOURS, geocode, getLocation, setLocation, setRideHours, type RideHours, type WeatherLocation } from '@/sync/weather'
import { Actions, Button, Card, CardTitle, Field, Input, Select } from '@/components/ui'
import { useToast } from '@/components/Toast'

const HOURS = Array.from({ length: 17 }, (_, i) => i + 5) // 5:00–21:00

/** Lokalizacja prognozy i typowe godziny startu jazdy – dla odprawy przed jazdą (pkt 6). Zapis lokalny (kv). */
export function WeatherSettings() {
  const toast = useToast()
  const loc = useLiveQuery(getLocation, [], null)
  const hours = useLiveQuery(async () => ((await db.kv.get('ride_hours'))?.value as RideHours | undefined) ?? DEFAULT_RIDE_HOURS, [], DEFAULT_RIDE_HOURS)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<WeatherLocation[]>([])

  async function search() {
    if (!query.trim()) return
    const r = await toast.run('Szukam miejscowości…', () => geocode(query), (list) => (list.length ? `Znaleziono ${list.length}` : 'Nic nie znaleziono'))
    setFound(r ?? [])
  }

  return (
    <Card>
      <CardTitle icon="🌤️">Pogoda i pora jazdy</CardTitle>
      <p className="text-sm">
        {loc ? (
          <>
            Prognoza dla: <b>{loc.name}</b> <span className="text-xs text-slate-500 dark:text-slate-400">({loc.lat}, {loc.lon})</span>
          </>
        ) : (
          <>Prognoza: <b>miejscowość nieustawiona</b> – wyszukaj ją poniżej, żeby odprawa przed jazdą miała pogodę.</>
        )}
      </p>
      <div className="mt-2 flex gap-2">
        <Input aria-label="Miejscowość" placeholder="Nazwa miejscowości" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} className="min-w-0 flex-1" />
        <Button variant="secondary" onClick={search} disabled={!query.trim()}>
          Szukaj
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
        <Field label="Start w tygodniu" hint="okno prognozy dla odprawy">
          <Select value={hours.weekday} onChange={(e) => void setRideHours({ ...hours, weekday: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start w weekend">
          <Select value={hours.weekend} onChange={(e) => void setRideHours({ ...hours, weekend: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Prognoza z Open-Meteo (bez konta), odświeżana co 3 h i buforowana na telefonie. Zapisane tylko na tym urządzeniu.</p>
    </Card>
  )
}
