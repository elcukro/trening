import { useState } from 'react'
import { useEngine } from '@/app/useSettings'
import { geocode, setLocation, type WeatherLocation } from '@/sync/weather'
import { useToast } from '@/components/Toast'
import { fmtDate } from '@/lib/dates'
import { Btn, Sheet } from './Chrome'
import { haptic } from '@/native'

/** Przełącznik w stylu systemowym. */
export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => {
        haptic.light()
        onChange(!on)
      }} className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-40" style={{ background: on ? 'var(--green)' : 'var(--fill-2)' }}>
      <span className="absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
    </button>
  )
}

// liczby z listy, data urodzenia z kalendarza – zamiast klawiatury, która na iOS chowała pola arkusza (26.10.2026)
const validBirth = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '1920-01-01' && v <= '2015-12-31'
/** Wartości lo..hi co 1; bieżąca spoza zakresu też trafia na listę, żeby zapis jej nie zgubił. */
function steps(lo: number, hi: number, current: string): string[] {
  const out = Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i))
  return current && !out.includes(current) ? [current, ...out] : out
}

/** Lista systemowa iOS w miejscu pola liczbowego: otwiera się na bieżącej wartości, bez klawiatury. */
function NumberPick({ value, onChange, lo, hi, label, empty }: { value: string; onChange: (v: string) => void; lo: number; hi: number; label: string; empty?: boolean }) {
  return (
    <select className="m-big mt-1 w-full appearance-none bg-transparent outline-none" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {(empty || !value) && <option value="">—</option>}
      {steps(lo, hi, value).map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
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
  // bez pełnej daty, a z samym rokiem – kalendarz startuje od 1 stycznia tego roku
  const [born, setBorn] = useState(settings.birth_date ?? (settings.birth_year != null ? `${settings.birth_year}-01-01` : ''))
  const [busy, setBusy] = useState(false)
  const [initial] = useState(() => JSON.stringify({ ftp, lthr, power, height, born }))
  const dirty = JSON.stringify({ ftp, lthr, power, height, born }) !== initial

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
        // iOS przy pustym polu podsuwa dzisiejszą datę – poza zakresem 1920–2015 zostaje poprzednia wartość
        birth_date: validBirth(born) ? born : (settings.birth_date ?? null),
        birth_year: validBirth(born) ? Number(born.slice(0, 4)) : (settings.birth_year ?? null),
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
    <Sheet title="Progi i miernik" onClose={onClose} dirty={dirty && !busy} action={<button className="m-nav-btn font-semibold disabled:opacity-40" onClick={() => void save()} disabled={busy}>Zapisz</button>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="m-list p-3">
            <span className="m-eyebrow block">FTP</span>
            <NumberPick value={ftp} onChange={setFtp} lo={100} hi={450} label="FTP w watach" />
            <span className="m-foot m-dim">W</span>
          </label>
          <label className="m-list p-3">
            <span className="m-eyebrow block">Tętno progowe</span>
            <NumberPick value={lthr} onChange={setLthr} lo={120} hi={200} label="Tętno progowe" empty />
            <span className="m-foot m-dim">bpm</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="m-list p-3">
            <span className="m-eyebrow block">Wzrost</span>
            <NumberPick value={height} onChange={setHeight} lo={140} hi={220} label="Wzrost w cm" empty />
            <span className="m-foot m-dim">cm</span>
          </label>
          {/* natywny kalendarz iOS: przezroczyste pole daty na całej karcie, pod nim sformatowana wartość */}
          <label className="m-list relative p-3">
            <span className="m-eyebrow block">Data urodzenia</span>
            <span className="m-big m-num mt-1 block">{born ? fmtDate(born) : '—'}</span>
            <span className="m-foot m-dim">do budżetu kcal</span>
            <input type="date" className="absolute inset-0 h-full w-full opacity-0" min="1920-01-01" max="2015-12-31" value={born} onChange={(e) => setBorn(e.target.value)} aria-label="Data urodzenia" />
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
        <p className="m-foot m-dim px-1">Po teście progowym wybierz nowe wartości – strefy mocy i tętna przeliczą się same, a plany na Bolta pojadą z nowymi watami.</p>
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
