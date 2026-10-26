import { useState } from 'react'
import { useEngine } from '@/app/useSettings'
import { geocode, setLocation, type WeatherLocation } from '@/sync/weather'
import { useToast } from '@/components/Toast'
import { Btn, Sheet } from './Chrome'

/** Przełącznik w stylu systemowym. */
export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-40" style={{ background: on ? 'var(--green)' : 'var(--fill-2)' }}>
      <span className="absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
    </button>
  )
}

/**
 * Progi i miernik – jedyne ustawienia zmieniane często (po każdym teście).
 * `useSettings` przy pierwszym renderze zwraca domyślne ustawienia programu (Dexie jeszcze nie odpowiedziała) – arkusz
 * montujemy dopiero po wczytaniu, inaczej pola startują z cudzych wartości domyślnych (220 W, brak LTHR, bez miernika),
 * a „Zapisz” nadpisuje nimi prawdziwe progi zawodnika (18.10.2026, drugie konto).
 */
export function NumbersSheet({ onClose }: { onClose: () => void }) {
  const engine = useEngine()
  if (!engine.settingsApi.loaded) return null
  return <NumbersSheetLoaded onClose={onClose} />
}

function NumbersSheetLoaded({ onClose }: { onClose: () => void }) {
  const engine = useEngine()
  const settings = engine.ctx.settings
  const [ftp, setFtp] = useState(String(settings.ftp_w_estimate))
  const [lthr, setLthr] = useState(settings.lthr_bpm != null ? String(settings.lthr_bpm) : '')
  const [power, setPower] = useState(settings.power_meter)
  const [height, setHeight] = useState(settings.height_cm != null ? String(settings.height_cm) : '')
  const [born, setBorn] = useState(settings.birth_year != null ? String(settings.birth_year) : '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const f = Number(ftp)
      const l = Number(lthr)
      const intIn = (v: string, lo: number, hi: number, old: number | null | undefined) => {
        if (!v.trim()) return null
        const n = Math.round(Number(v))
        return Number.isFinite(n) && n >= lo && n <= hi ? n : (old ?? null)
      }
      await engine.settingsApi.update({
        height_cm: intIn(height, 120, 230, settings.height_cm),
        birth_year: intIn(born, 1920, 2020, settings.birth_year),
        ftp_w_estimate: Number.isFinite(f) && f > 0 ? Math.round(f) : settings.ftp_w_estimate,
        lthr_bpm: lthr.trim() && Number.isFinite(l) && l > 0 ? Math.round(l) : null,
        power_meter: power,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Progi i miernik" onClose={onClose} action={<button className="m-nav-btn font-semibold disabled:opacity-40" onClick={() => void save()} disabled={busy}>Zapisz</button>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="m-list p-3">
            <span className="m-eyebrow block">FTP</span>
            <input className="m-big mt-1 w-full bg-transparent outline-none" inputMode="numeric" value={ftp} onChange={(e) => setFtp(e.target.value)} aria-label="FTP w watach" />
            <span className="m-foot m-dim">W</span>
          </label>
          <label className="m-list p-3">
            <span className="m-eyebrow block">Tętno progowe</span>
            <input className="m-big mt-1 w-full bg-transparent outline-none" inputMode="numeric" placeholder="—" value={lthr} onChange={(e) => setLthr(e.target.value)} aria-label="Tętno progowe" />
            <span className="m-foot m-dim">bpm</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="m-list p-3">
            <span className="m-eyebrow block">Wzrost</span>
            <input className="m-big mt-1 w-full bg-transparent outline-none" inputMode="numeric" placeholder="—" value={height} onChange={(e) => setHeight(e.target.value)} aria-label="Wzrost w cm" />
            <span className="m-foot m-dim">cm</span>
          </label>
          <label className="m-list p-3">
            <span className="m-eyebrow block">Rok urodzenia</span>
            <input className="m-big mt-1 w-full bg-transparent outline-none" inputMode="numeric" placeholder="—" value={born} onChange={(e) => setBorn(e.target.value)} aria-label="Rok urodzenia" />
            <span className="m-foot m-dim">do budżetu kcal</span>
          </label>
        </div>
        <div className="m-list">
          <div className="m-row">
            <span className="min-w-0 flex-1">
              <span className="block">Mam miernik mocy</span>
              <span className="m-foot m-dim block">Cele w watach na Bolcie, TSS z mocy zamiast z tętna</span>
            </span>
            <Switch on={power} label="Mam miernik mocy" onChange={setPower} />
          </div>
        </div>
        <p className="m-foot m-dim px-1">Po teście progowym wpisz nowe wartości – strefy mocy i tętna przeliczą się same, a plany na Bolta pojadą z nowymi watami.</p>
        <Btn onClick={() => void save()} disabled={busy} className="w-full">
          Zapisz
        </Btn>
      </div>
    </Sheet>
  )
}

/** Miejscowość prognozy dla odprawy – zapis zostaje na tym urządzeniu. */
export function LocationSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<WeatherLocation[]>([])
  async function search() {
    if (!query.trim()) return
    const r = await toast.run('Szukam…', () => geocode(query), (list) => (list.length ? `Znaleziono ${list.length}` : 'Nic nie znaleziono'))
    setFound(r ?? [])
  }
  return (
    <Sheet title="Pogoda" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void search()
          }}
        >
          <input className="m-input flex-1" placeholder="Nazwa miejscowości" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Miejscowość" />
          <Btn type="submit" disabled={!query.trim()} className="!min-h-11">
            Szukaj
          </Btn>
        </form>
        {found.length > 0 && (
          <div className="m-list">
            {found.map((f) => (
              <button key={`${f.lat},${f.lon}`} className="m-row" onClick={() => void setLocation(f).then(onClose)}>
                <span className="flex-1 text-left">{f.name}</span>
              </button>
            ))}
          </div>
        )}
        <p className="m-foot m-dim px-1">Prognoza z Open-Meteo dla tej miejscowości trafia do odprawy przed jazdą.</p>
      </div>
    </Sheet>
  )
}
