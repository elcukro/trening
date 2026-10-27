import { useState } from 'react'
import type { Checkin } from '@/db'
import { Btn, Sheet } from './Chrome'
import { haptic } from '@/native'
import { fromHealth, healthLine } from '@/day/health'
import { useToast } from '@/components/Toast'
import { friendlyError } from '@/lib/errors'
import { fmtDayMonth } from '@/lib/dates'
import { useT } from '@/i18n/react'
import { intlLocale } from '@/i18n/core'
import { num } from '@/lib/format'

const SCALES = ['sleep', 'legs', 'motivation'] as const
type ScaleKey = (typeof SCALES)[number]

const numOrNull = (v: string): number | null => {
  const x = Number(v.replace(',', '.'))
  return v.trim() && Number.isFinite(x) ? x : null
}

/** Ręczny check-in w `/m` – droga zapasowa obok rozmowy z trenerem: dwa pola i trzy rzędy 1–5, zapis jednym przyciskiem. */
export function CheckinSheet({ checkin, lastWeight, onClose, onSave }: { checkin: Checkin | undefined; lastWeight: { date: string; kg: number } | null; onClose: () => void; onSave: (patch: Partial<Checkin>) => Promise<void> }) {
  const t = useT()
  const [weight, setWeight] = useState(checkin?.weight_kg != null ? num(checkin.weight_kg, 2) : '')
  const [rhr, setRhr] = useState(checkin?.resting_hr != null ? String(checkin.resting_hr) : '')
  const [scale, setScale] = useState<Record<ScaleKey, number | null>>({ sleep: checkin?.sleep ?? null, legs: checkin?.legs ?? null, motivation: checkin?.motivation ?? null })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
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
      toast.notify(t.m.checkin.saved, 'success')
      onClose()
    } catch (e) {
      // arkusz zostaje otwarty z wpisanymi danymi – można spróbować jeszcze raz
      toast.notify(t.m.checkin.saveFailed, 'error', friendlyError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={t.m.checkin.title} onClose={onClose} dirty={dirty && !busy} action={<button className="m-nav-btn font-semibold disabled:opacity-40" onClick={() => void save()} disabled={busy || nothing}>{t.common.save}</button>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="m-list p-3">
            <span className="m-eyebrow block">{t.m.checkin.weight}</span>
            <input className="m-big mt-1 w-full bg-transparent outline-none" inputMode="decimal" placeholder={lastWeight ? num(lastWeight.kg, 2) : (0).toLocaleString(intlLocale(), { minimumFractionDigits: 1 })} value={weight} onChange={(e) => setWeight(e.target.value)} aria-label={t.m.checkin.weightAria} />
            <span className="m-foot m-dim">kg{fromHealth(checkin, 'weight_kg') && weight === initialWeight ? t.m.checkin.fromHealth : lastWeight ? t.m.checkin.lastOn(fmtDayMonth(lastWeight.date)) : ''}</span>
          </label>
          <label className="m-list p-3">
            <span className="m-eyebrow block">{t.m.checkin.rhr}</span>
            <input className="m-big mt-1 w-full bg-transparent outline-none" inputMode="numeric" placeholder="52" value={rhr} onChange={(e) => setRhr(e.target.value)} aria-label={t.m.checkin.rhrAria} />
            <span className="m-foot m-dim">{fromHealth(checkin, 'resting_hr') && rhr === initialRhr ? t.m.checkin.rhrFromHealth : t.m.checkin.rhrHint}</span>
          </label>
        </div>
        {/* HRV i sen tylko ze Zdrowia – do odczytu; subiektywna ocena snu niżej zostaje (docs/27 § 2) */}
        {healthLine(checkin, (f) => f === 'hrv_ms' || f === 'sleep_min') && <p className="m-foot m-dim -mt-2 px-1">{t.m.checkin.fromHealthLine(healthLine(checkin, (f) => f === 'hrv_ms' || f === 'sleep_min'))}</p>}
        {SCALES.map((key) => {
          const s = t.m.checkin.scales[key]
          return (
          <div key={key} className="m-list p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="m-headline">{s.label}</span>
              <span className="m-foot m-dim">
                {s.low} → {s.high}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={s.label}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} role="radio" aria-checked={scale[key] === v} onClick={() => {
                  haptic.selection()
                  setScale((x) => ({ ...x, [key]: v }))
                }} className="m-num min-h-12 rounded-xl text-[17px] font-semibold" style={scale[key] === v ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--fill)', color: 'var(--label)' }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          )
        })}
        <Btn onClick={() => void save()} disabled={busy || nothing} className="w-full">
          {t.common.save}
        </Btn>
      </div>
    </Sheet>
  )
}
