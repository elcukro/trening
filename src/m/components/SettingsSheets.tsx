import { useState } from 'react'
import { useEngine, useSettings } from '@/app/useSettings'
import { geocode, setLocation, type WeatherLocation } from '@/sync/weather'
import { useAction, useToast } from '@/components/Toast'
import { friendlyError } from '@/lib/errors'
import { fmtDate } from '@/lib/dates'
import { Btn, Sheet } from './Chrome'
import { currentPosition, haptic } from '@/native'
import { num } from '@/lib/format'
import { languagePatch, t as tr } from '@/i18n'
import { systemLang, type LangChoice } from '@/i18n/core'
import { useT } from '@/i18n/react'

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
  const t = useT()
  const tn = t.m.numbers
  const engine = useEngine()
  const settings = engine.ctx.settings
  const [ftp, setFtp] = useState(String(settings.ftp_w_estimate))
  const [lthr, setLthr] = useState(settings.lthr_bpm != null ? String(settings.lthr_bpm) : '')
  const [power, setPower] = useState(settings.power_meter)
  const [height, setHeight] = useState(settings.height_cm != null ? String(settings.height_cm) : '')
  // bez pełnej daty, a z samym rokiem – kalendarz startuje od 1 stycznia tego roku
  const [born, setBorn] = useState(settings.birth_date ?? (settings.birth_year != null ? `${settings.birth_year}-01-01` : ''))
  const [busy, setBusy] = useState(false)
  const toast = useToast()
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
      toast.notify(tn.saved, 'success')
      onClose()
    } catch (e) {
      toast.notify(tn.saveFailed, 'error', friendlyError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={tn.title} onClose={onClose} dirty={dirty && !busy} action={<button className="m-nav-btn font-semibold disabled:opacity-40" onClick={() => void save()} disabled={busy}>{t.common.save}</button>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="m-list p-3">
            <span className="m-eyebrow block">FTP</span>
            <NumberPick value={ftp} onChange={setFtp} lo={100} hi={450} label={tn.ftpAria} />
            <span className="m-foot m-dim">W</span>
          </label>
          <label className="m-list p-3">
            <span className="m-eyebrow block">{tn.lthr}</span>
            <NumberPick value={lthr} onChange={setLthr} lo={120} hi={200} label={tn.lthrAria} empty />
            <span className="m-foot m-dim">bpm</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="m-list p-3">
            <span className="m-eyebrow block">{tn.height}</span>
            <NumberPick value={height} onChange={setHeight} lo={140} hi={220} label={tn.heightAria} empty />
            <span className="m-foot m-dim">cm</span>
          </label>
          {/* natywny kalendarz iOS: przezroczyste pole daty na całej karcie, pod nim sformatowana wartość */}
          <label className="m-list relative p-3">
            <span className="m-eyebrow block">{tn.birth}</span>
            {/* data ma 10 znaków – w rozmiarze liczb obok rok łamał się do drugiej linii na iPhonie */}
            <span className="m-title m-num mt-2 block whitespace-nowrap">{born ? fmtDate(born) : '—'}</span>
            <span className="m-foot m-dim">{tn.birthHint}</span>
            <input type="date" className="absolute inset-0 h-full w-full opacity-0" min="1920-01-01" max="2015-12-31" value={born} onChange={(e) => setBorn(e.target.value)} aria-label={tn.birth} />
          </label>
        </div>
        <div className="m-list">
          <div className="m-row">
            <span className="min-w-0 flex-1">
              <span className="block">{tn.powerMeter}</span>
              <span className="m-foot m-dim block">{tn.powerMeterSub}</span>
            </span>
            <Switch on={power} label={tn.powerMeter} onChange={setPower} />
          </div>
        </div>
        <p className="m-foot m-dim px-1">{tn.hint}</p>
        <Btn onClick={() => void save()} disabled={busy} className="w-full">
          {t.common.save}
        </Btn>
      </div>
    </Sheet>
  )
}

/** Miejscowość prognozy dla odprawy – zapis zostaje na tym urządzeniu. */
export function LocationSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const tl = t.m.location
  const locate = useAction()
  const find = useAction()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<WeatherLocation[]>([])
  const [none, setNone] = useState(false)
  /** Pozycja telefonu zamiast wpisywania – pytanie o zgodę dopiero teraz, przy użyciu funkcji (docs/26 § 5). */
  async function useMyLocation() {
    const r = await locate.run(async () => {
      const pos = await currentPosition()
      // nazwy miejscowości nie zgadujemy (Open-Meteo nie ma geokodowania odwrotnego) – współrzędne w podpisie wystarczą
      await setLocation({ name: tr().m.location.myLocation(num(pos.lat, 2), num(pos.lon, 2)), ...pos })
    }, () => tl.set, { errorTitle: tl.locateFailed })
    if (r !== null) onClose()
  }
  async function search() {
    if (!query.trim()) return
    // wynik (albo jego brak) widać pod polem – bez komunikatu
    const r = await find.run(() => geocode(query), () => '', { errorTitle: tl.searchFailed })
    setFound(r ?? [])
    setNone(r !== null && r.length === 0)
  }
  return (
    <Sheet title={tl.title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Btn onClick={() => void useMyLocation()} busy={locate.pending && tl.locating} className="w-full">
          {tl.useMine}
        </Btn>
        <p className="m-foot m-dim -mt-1 px-1">{tl.orSearch}</p>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void search()
          }}
        >
          <input className="m-input flex-1" placeholder={tl.placeholder} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tl.placeAria} />
          <Btn type="submit" disabled={!query.trim()} busy={find.pending && tl.searching} className="!min-h-11">
            {tl.search}
          </Btn>
        </form>
        {none && <p className="m-sub m-dim px-1">{tl.none}</p>}
        {found.length > 0 && (
          <div className="m-list">
            {found.map((f) => (
              <button key={`${f.lat},${f.lon}`} className="m-row" onClick={() => void setLocation(f).then(onClose)}>
                <span className="flex-1 text-left">{f.name}</span>
              </button>
            ))}
          </div>
        )}
        <p className="m-foot m-dim px-1">{tl.foot}</p>
      </div>
    </Sheet>
  )
}

/** Wybór języka zawodnika (docs/34 § 4): nazwa języka zawsze we własnym języku. */
export function langChoiceLabel(choice: LangChoice): string {
  if (choice === 'system') {
    const sys = systemLang()
    return tr().common.language.system(tr(sys).common.language[sys])
  }
  return tr(choice).common.language[choice]
}

/**
 * Język aplikacji – lista jak systemowa, wybór jednym dotknięciem. `LangProvider` przełącza język i przemontowuje drzewo,
 * więc arkusz po wyborze znika razem z ekranem (zostaje zamknięty).
 */
export function LanguageSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { settings, update } = useSettings()
  const toast = useToast()
  const current: LangChoice = settings.language === 'pl' || settings.language === 'en' ? settings.language : 'system'
  const options: LangChoice[] = ['system', 'pl', 'en']
  async function choose(v: LangChoice) {
    haptic.selection()
    if (v === current) return onClose()
    try {
      await update(languagePatch(v))
      onClose()
    } catch (e) {
      toast.notify(t.m.language.saveFailed, 'error', friendlyError(e).message)
    }
  }
  return (
    <Sheet title={t.common.language.title} onClose={onClose}>
      <div className="m-list" role="radiogroup" aria-label={t.common.language.title}>
        {options.map((v) => (
          <button key={v} role="radio" aria-checked={v === current} className="m-row" onClick={() => void choose(v)}>
            <span className="flex-1 text-left">{langChoiceLabel(v)}</span>
            {v === current && (
              <span aria-hidden className="font-semibold" style={{ color: 'var(--accent)' }}>
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="m-foot m-dim mt-3 px-1">{t.common.language.hint}</p>
    </Sheet>
  )
}
