import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { upsertCheckin } from '@/db/repo'
import { Button, Card, CardTitle } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { num } from '@/lib/format'

function Scale({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="w-20 text-sm">{label}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`h-11 w-11 rounded-lg text-sm font-semibold ${value === v ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CheckinCard({ date }: { date: string }) {
  const toast = useToast()
  const checkin = useLiveQuery(() => db.checkins.where('date').equals(date).first(), [date])
  const [open, setOpen] = useState(false)
  const [weight, setWeight] = useState('')
  const [rhr, setRhr] = useState('')
  const [draft, setDraft] = useState<{ sleep: number | null; legs: number | null; motivation: number | null }>({ sleep: null, legs: null, motivation: null })
  const done = !!checkin && (checkin.sleep != null || checkin.weight_kg != null)

  async function save() {
    const doSave = async () => {
    const w = weight.trim() ? Number(weight.replace(',', '.')) : (checkin?.weight_kg ?? null)
    const r = rhr.trim() ? Number(rhr) : (checkin?.resting_hr ?? null)
    await upsertCheckin(date, {
      weight_kg: Number.isFinite(w as number) ? w : null,
      resting_hr: Number.isFinite(r as number) ? r : null,
      sleep: draft.sleep ?? checkin?.sleep ?? null,
      legs: draft.legs ?? checkin?.legs ?? null,
      motivation: draft.motivation ?? checkin?.motivation ?? null,
    })
    setOpen(false)
    }
    await toast.run('Zapisuję check-in…', doSave, () => 'Check-in zapisany')
  }

  if (done && !open) {
    const score = (checkin.sleep ?? 0) + (checkin.legs ?? 0) + (checkin.motivation ?? 0)
    return (
      <Card tone="muted" className="py-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>
            ☀️ Check-in: {checkin.weight_kg != null && <b>{num(checkin.weight_kg)} kg</b>}
            {checkin.resting_hr != null && <> · tętno sp. <b>{checkin.resting_hr}</b></>}
            {checkin.sleep != null && <> · sen/nogi/motywacja <b>{checkin.sleep}/{checkin.legs}/{checkin.motivation}</b></>}
            {score > 0 && score <= 6 && <span className="ml-1 text-amber-700 dark:text-amber-300">(słaby dzień – R6 w Etapie 5)</span>}
          </span>
          <button className="min-h-11 text-sky-600" onClick={() => setOpen(true)}>
            Edytuj
          </button>
        </div>
      </Card>
    )
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
        ☀️ Poranny check-in (20 s): waga, tętno, sen, nogi, motywacja
      </button>
    )
  }

  return (
    <Card>
      <CardTitle icon="☀️">Poranny check-in</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-slate-500">Waga (kg)</span>
          <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900" inputMode="decimal" placeholder={checkin?.weight_kg != null ? String(checkin.weight_kg) : 'np. 104,5'} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Tętno spoczynkowe</span>
          <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900" inputMode="numeric" placeholder={checkin?.resting_hr != null ? String(checkin.resting_hr) : 'np. 52'} value={rhr} onChange={(e) => setRhr(e.target.value)} />
        </label>
      </div>
      <Scale label="Sen" value={draft.sleep ?? checkin?.sleep ?? null} onChange={(v) => setDraft((d) => ({ ...d, sleep: v }))} />
      <Scale label="Nogi" value={draft.legs ?? checkin?.legs ?? null} onChange={(v) => setDraft((d) => ({ ...d, legs: v }))} />
      <Scale label="Motywacja" value={draft.motivation ?? checkin?.motivation ?? null} onChange={(v) => setDraft((d) => ({ ...d, motivation: v }))} />
      <div className="mt-2 flex gap-2">
        <Button onClick={save} className="flex-1">
          Zapisz
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Anuluj
        </Button>
      </div>
    </Card>
  )
}
