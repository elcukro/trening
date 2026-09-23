import { useState } from 'react'
import type { Checkin } from '@/db'
import { List, Row, Section, Sheet } from './Chrome'

const SCALES = [
  { key: 'sleep', label: 'Sen', low: 'fatalny', high: 'świetny' },
  { key: 'legs', label: 'Nogi', low: 'ciężkie', high: 'lekkie' },
  { key: 'motivation', label: 'Motywacja', low: 'żadna', high: 'pełna' },
] as const

type ScaleKey = (typeof SCALES)[number]['key']

/** Liczba z pola z przecinkiem dziesiętnym; puste albo bezsensowne = null. */
function numOrNull(v: string): number | null {
  const x = Number(v.replace(',', '.'))
  return v.trim() && Number.isFinite(x) ? x : null
}

function Scale({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="ios-body">{label}</span>
        <span className="ios-caption ios-dim">
          {low} → {high}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className="ios-num ios-press min-h-12 rounded-xl text-[17px] font-semibold"
            style={value === v ? { background: 'var(--blue)', color: '#fff' } : { background: 'var(--fill)', color: 'var(--label)' }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Poranny check-in: waga (co drugi dzień), tętno spoczynkowe i trzy suwaki samopoczucia. */
export function CheckinSheet({ checkin, weighDue, onClose, onSave }: { checkin: Checkin | undefined; weighDue: boolean; onClose: () => void; onSave: (patch: Partial<Checkin>) => Promise<void> }) {
  const [weight, setWeight] = useState(checkin?.weight_kg != null ? String(checkin.weight_kg).replace('.', ',') : '')
  const [rhr, setRhr] = useState(checkin?.resting_hr != null ? String(checkin.resting_hr) : '')
  const [scale, setScale] = useState<Record<ScaleKey, number | null>>({
    sleep: checkin?.sleep ?? null,
    legs: checkin?.legs ?? null,
    motivation: checkin?.motivation ?? null,
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await onSave({
        weight_kg: numOrNull(weight) ?? checkin?.weight_kg ?? null,
        resting_hr: numOrNull(rhr) ?? checkin?.resting_hr ?? null,
        sleep: scale.sleep,
        legs: scale.legs,
        motivation: scale.motivation,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const nothing = !numOrNull(weight) && !numOrNull(rhr) && !scale.sleep && !scale.legs && !scale.motivation

  return (
    <Sheet title="Check-in" onClose={onClose} done={{ label: 'Zapisz', onClick: save, disabled: busy || nothing }}>
      <Section header={weighDue ? 'Pomiary · dziś wypada ważenie' : 'Pomiary'} footer={weighDue ? 'Waż się co drugi dzień, rano, po toalecie – dzienne wahania to głównie woda.' : 'Dziś nie musisz się ważyć. Pole zostaw puste.'}>
        <List>
          <Row
            title="Waga"
            accessory={
              <span className="flex items-center gap-1">
                <input className="ios-input ios-num w-20 text-right" inputMode="decimal" placeholder="—" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Waga w kilogramach" />
                <span className="ios-body ios-dim shrink-0">kg</span>
              </span>
            }
          />
          <Row
            title="Tętno spoczynkowe"
            accessory={
              <span className="flex items-center gap-1">
                <input className="ios-input ios-num w-20 text-right" inputMode="numeric" placeholder="—" value={rhr} onChange={(e) => setRhr(e.target.value)} aria-label="Tętno spoczynkowe" />
                <span className="ios-body ios-dim shrink-0">bpm</span>
              </span>
            }
          />
        </List>
      </Section>
      <Section header="Jak się czujesz">
        <List>
          {SCALES.map((s) => (
            <div key={s.key} className="ios-cell">
              <Scale label={s.label} low={s.low} high={s.high} value={scale[s.key]} onChange={(v) => setScale((x) => ({ ...x, [s.key]: v }))} />
            </div>
          ))}
        </List>
      </Section>
    </Sheet>
  )
}
