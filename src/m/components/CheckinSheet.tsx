import { useState } from 'react'
import type { Checkin } from '@/db'
import { Btn, Sheet } from './Chrome'
import { haptic } from '@/native'
import { fromHealth, healthLine } from '@/day/health'

const SCALES = [
  { key: 'sleep', label: 'Sen', low: 'fatalny', high: 'świetny' },
  { key: 'legs', label: 'Nogi', low: 'ciężkie', high: 'lekkie' },
  { key: 'motivation', label: 'Motywacja', low: 'żadna', high: 'pełna' },
] as const
type ScaleKey = (typeof SCALES)[number]['key']

const numOrNull = (v: string): number | null => {
  const x = Number(v.replace(',', '.'))
  return v.trim() && Number.isFinite(x) ? x : null
}

/** Ręczny check-in w `/m` – droga zapasowa obok rozmowy z trenerem: dwa pola i trzy rzędy 1–5, zapis jednym przyciskiem. */
export function CheckinSheet({ checkin, lastWeight, onClose, onSave }: { checkin: Checkin | undefined; lastWeight: { date: string; kg: number } | null; onClose: () => void; onSave: (patch: Partial<Checkin>) => Promise<void> }) {
  const [weight, setWeight] = useState(checkin?.weight_kg != null ? String(checkin.weight_kg).replace('.', ',') : '')
  const [rhr, setRhr] = useState(checkin?.resting_hr != null ? String(checkin.resting_hr) : '')
  const [scale, setScale] = useState<Record<ScaleKey, number | null>>({ sleep: checkin?.sleep ?? null, legs: checkin?.legs ?? null, motivation: checkin?.motivation ?? null })
  const [busy, setBusy] = useState(false)
  const [initialWeight] = useState(weight)
  const [initialRhr] = useState(rhr)
  // stan z otwarcia – zamknięcie bez zapisu pyta tylko wtedy, gdy coś się zmieniło
  const [initial] = useState(() => JSON.stringify({ weight, rhr, scale }))
  const dirty = JSON.stringify({ weight, rhr, scale }) !== initial
  const nothing = !numOrNull(weight) && !numOrNull(rhr) && !scale.sleep && !scale.legs && !scale.motivation

  async function save() {
    setBusy(true)
    try {
      await onSave({ weight_kg: numOrNull(weight) ?? checkin?.weight_kg ?? null, resting_hr: numOrNull(rhr) ?? checkin?.resting_hr ?? null, sleep: scale.sleep, legs: scale.legs, motivation: scale.motivation })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Check-in" onClose={onClose} dirty={dirty && !busy} action={<button className="m-nav-btn font-semibold disabled:opacity-40" onClick={() => void save()} disabled={busy || nothing}>Zapisz</button>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="m-list p-3">
            <span className="m-eyebrow block">Waga</span>
            <input className="m-big mt-1 w-full bg-transparent outline-none" inputMode="decimal" placeholder={lastWeight ? String(lastWeight.kg).replace('.', ',') : '0,0'} value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Waga w kg" />
            <span className="m-foot m-dim">kg{fromHealth(checkin, 'weight_kg') && weight === initialWeight ? ' · ze Zdrowia' : lastWeight ? ` · ostatnio ${lastWeight.date.slice(8)}.${lastWeight.date.slice(5, 7)}` : ''}</span>
          </label>
          <label className="m-list p-3">
            <span className="m-eyebrow block">Tętno spocz.</span>
            <input className="m-big mt-1 w-full bg-transparent outline-none" inputMode="numeric" placeholder="52" value={rhr} onChange={(e) => setRhr(e.target.value)} aria-label="Tętno spoczynkowe" />
            <span className="m-foot m-dim">{fromHealth(checkin, 'resting_hr') && rhr === initialRhr ? 'bpm · ze Zdrowia' : 'bpm, zanim wstaniesz'}</span>
          </label>
        </div>
        {/* HRV i sen tylko ze Zdrowia – do odczytu; subiektywna ocena snu niżej zostaje (docs/27 § 2) */}
        {healthLine(checkin, (f) => f === 'hrv_ms' || f === 'sleep_min') && <p className="m-foot m-dim -mt-2 px-1">Ze Zdrowia: {healthLine(checkin, (f) => f === 'hrv_ms' || f === 'sleep_min')}</p>}
        {SCALES.map((s) => (
          <div key={s.key} className="m-list p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="m-headline">{s.label}</span>
              <span className="m-foot m-dim">
                {s.low} → {s.high}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={s.label}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} role="radio" aria-checked={scale[s.key] === v} onClick={() => {
                  haptic.selection()
                  setScale((x) => ({ ...x, [s.key]: v }))
                }} className="m-num min-h-12 rounded-xl text-[17px] font-semibold" style={scale[s.key] === v ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--fill)', color: 'var(--label)' }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
        <Btn onClick={() => void save()} disabled={busy || nothing} className="w-full">
          Zapisz
        </Btn>
      </div>
    </Sheet>
  )
}
