import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { upsertCheckin } from '@/db/repo'
import { Actions, Button, Card, CardTitle, Field, Input } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { num } from '@/lib/format'

function Scale({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="w-20 shrink-0 text-sm">{label}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`h-11 w-11 rounded-xl text-sm font-semibold tabular-nums transition-colors ${value === v ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'}`}
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
      <Card tone="muted" className="py-3 lg:py-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-base leading-none dark:bg-amber-900/50" aria-hidden>
              ☀️
            </span>
            <span className="min-w-0">
              Check-in: {checkin.weight_kg != null && <b className="tabular-nums">{num(checkin.weight_kg)} kg</b>}
              {checkin.resting_hr != null && <> · tętno sp. <b className="tabular-nums">{checkin.resting_hr}</b></>}
              {checkin.sleep != null && <> · sen/nogi/motywacja <b className="tabular-nums">{checkin.sleep}/{checkin.legs}/{checkin.motivation}</b></>}
              {score > 0 && score <= 6 && <span className="ml-1 text-amber-700 dark:text-amber-300">(słaby dzień – R6 w Etapie 5)</span>}
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            Edytuj
          </Button>
        </div>
      </Card>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-600 dark:text-slate-300 dark:hover:border-sky-500 dark:hover:bg-slate-800 dark:hover:text-sky-200"
      >
        <span aria-hidden>☀️</span>
        <span>Poranny check-in (20 s): waga, tętno, sen, nogi, motywacja</span>
      </button>
    )
  }

  return (
    <Card>
      <CardTitle icon="☀️">Poranny check-in</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Waga (kg)">
          <Input inputMode="decimal" placeholder={checkin?.weight_kg != null ? String(checkin.weight_kg) : 'np. 104,5'} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <Field label="Tętno spoczynkowe">
          <Input inputMode="numeric" placeholder={checkin?.resting_hr != null ? String(checkin.resting_hr) : 'np. 52'} value={rhr} onChange={(e) => setRhr(e.target.value)} />
        </Field>
      </div>
      <div className="mt-2">
        <Scale label="Sen" value={draft.sleep ?? checkin?.sleep ?? null} onChange={(v) => setDraft((d) => ({ ...d, sleep: v }))} />
        <Scale label="Nogi" value={draft.legs ?? checkin?.legs ?? null} onChange={(v) => setDraft((d) => ({ ...d, legs: v }))} />
        <Scale label="Motywacja" value={draft.motivation ?? checkin?.motivation ?? null} onChange={(v) => setDraft((d) => ({ ...d, motivation: v }))} />
      </div>
      <Actions className="mt-3">
        <Button onClick={save} className="flex-1">
          Zapisz
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Anuluj
        </Button>
      </Actions>
    </Card>
  )
}
