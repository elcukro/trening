import { useState } from 'react'
import { WEEKDAYS, type Weekday } from '@/engine/dates'
import { allowedTemplates, clampTuning, templateById, tuningBounds, type PlanTuning, type TuningKey } from '@/engine/generator'
import type { PlanInputs } from '@/engine/onboarding'
import { num } from '@/lib/format'
import { Group, Row, Sheet } from '../components/Chrome'
import { Chips } from './controls'
import { DAY_LONG } from './labels'

/**
 * „Dlaczego taki plan” (docs/33 § 8.2): każdy wybór dopasowania z uzasadnieniem (AI albo reguły) i arkusz do zmiany.
 * Zmiana przechodzi przez `clampTuning` – zawodnik, tak jak model, nie wyjdzie poza granice kodu; uzasadnienie
 * zmienionego pola pisze kod.
 */
export function PlanWhy({ inputs, tuning, source, onChange }: { inputs: PlanInputs; tuning: PlanTuning; source: 'ai' | 'rules' | 'user' | null; onChange: (t: PlanTuning) => void }) {
  const [open, setOpen] = useState<TuningKey | null>(null)
  const b = tuningBounds(inputs)
  const tpl = templateById(tuning.template)
  const set = (patch: Partial<PlanTuning>, key: TuningKey) => onChange(clampTuning(inputs, { ...tuning, ...patch, why: { ...tuning.why, [key]: '' } }).tuning)
  const hours = num(Math.round(inputs.weekly_hours * tuning.volume_pct) / 100)
  const days = tuning.long_day ? `długa: ${DAY_LONG[tuning.long_day].toLowerCase()}` : 'dobiera plan'
  const range = (lo: number, hi: number, step: number) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
  const dayOpts = (b.days as Weekday[]).toSorted((x, y) => WEEKDAYS.indexOf(x) - WEEKDAYS.indexOf(y)).map((d) => ({ value: d, label: DAY_LONG[d] }))

  const sheets: Record<TuningKey, { title: string; body: React.ReactNode }> = {
    template: {
      title: 'Rodzaj planu',
      body: (
        <>
          <Chips label="Rodzaj planu" options={allowedTemplates(inputs).map((t) => ({ value: t.id, label: t.name }))} value={tuning.template} onChange={(v) => set({ template: v as PlanTuning['template'] }, 'template')} />
          <p className="m-foot m-dim px-1">{tpl.summary} Rozkład: {tpl.intensity}.</p>
        </>
      ),
    },
    volume: {
      title: 'Ile czasu w tygodniu',
      body: <Chips label="Objętość" options={range(b.volume_pct[0], b.volume_pct[1], 10).map((v) => ({ value: v, label: `${v} %` }))} value={tuning.volume_pct} onChange={(v) => set({ volume_pct: v as number }, 'volume')} />,
    },
    ramp: {
      title: 'Jak szybko rosnąć',
      body: <Chips label="Wzrost objętości" options={[3, 5, 7, 10].filter((v) => v <= b.ramp_pct[1]).map((v) => ({ value: v, label: `${v} % / tydz.` }))} value={tuning.ramp_pct} onChange={(v) => set({ ramp_pct: v as number }, 'ramp')} />,
    },
    blocks: {
      title: 'Bloki i testy',
      body: (
        <>
          <Chips label="Tydzień lżejszy" options={b.block_weeks.map((v) => ({ value: v, label: `co ${v}. tydzień` }))} value={tuning.block_weeks} onChange={(v) => set({ block_weeks: v as 3 | 4 }, 'blocks')} />
          <Chips label="Test" options={[1, 2, 3].map((v) => ({ value: v, label: v === 1 ? 'co blok' : `co ${v} bloki` }))} value={tuning.test_every_blocks} onChange={(v) => set({ test_every_blocks: v as number }, 'blocks')} />
        </>
      ),
    },
    keys: {
      title: 'Akcenty w tygodniu',
      body: <Chips label="Akcenty" options={range(b.key_sessions[0], b.key_sessions[1], 1).map((v) => ({ value: v, label: v === 0 ? 'bez akcentów' : String(v) }))} value={tuning.key_sessions} onChange={(v) => set({ key_sessions: v as number, key_days: null }, 'keys')} />,
    },
    days: {
      title: 'Dni',
      body: (
        <>
          <p className="m-eyebrow px-1">Długa jazda</p>
          <Chips label="Długa jazda" options={[{ value: '', label: 'Dobierz sam' }, ...dayOpts]} value={tuning.long_day ?? ''} onChange={(v) => set({ long_day: (v as string) ? (v as Weekday) : null, key_days: null }, 'days')} />
          {tuning.long_day && tuning.key_sessions > 0 && (
            <>
              <p className="m-eyebrow px-1">Akcenty ({tuning.key_sessions})</p>
              <Chips
                label="Dni akcentów"
                multi
                options={dayOpts.filter((o) => o.value !== tuning.long_day)}
                value={tuning.key_days ?? []}
                onChange={(v) => {
                  const picked = (v as Weekday[]).slice(-tuning.key_sessions)
                  if (picked.length === tuning.key_sessions) set({ key_days: picked }, 'days')
                  else onChange({ ...tuning, key_days: picked.length ? picked : null })
                }}
              />
              <p className="m-foot m-dim px-1">Akcenty nigdy dzień po dniu ani dzień po długiej jeździe – niedozwolony wybór plan pominie.</p>
            </>
          )}
        </>
      ),
    },
  }

  const rows: { key: TuningKey; title: string; value: string }[] = [
    { key: 'template', title: 'Rodzaj planu', value: tpl.name },
    { key: 'volume', title: 'Czas w tygodniu', value: `do ${hours} h` },
    { key: 'ramp', title: 'Wzrost', value: `${tuning.ramp_pct} % / tydz.` },
    { key: 'blocks', title: 'Bloki', value: `${tuning.block_weeks} tyg.` },
    { key: 'keys', title: 'Akcenty', value: String(tuning.key_sessions) },
    { key: 'days', title: 'Dni', value: days },
  ]
  return (
    <>
      <div data-testid="plan-why">
        <Group label={source === 'ai' ? 'Dlaczego taki plan · dopasował trener' : 'Dlaczego taki plan'}>
          {rows.map((r) => (
            <Row key={r.key} title={r.title} sub={tuning.why[r.key]} value={r.value} onClick={() => setOpen(r.key)} chevron />
          ))}
        </Group>
      </div>
      {open && (
        <Sheet title={sheets[open].title} onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-3">
            {sheets[open].body}
            <p className="m-foot m-dim px-1">{tuning.why[open]}</p>
          </div>
        </Sheet>
      )}
    </>
  )
}
