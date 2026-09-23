import { useState } from 'react'
import type { SessionLog } from '@/db'
import { IconAdjust, IconCheck, IconClose } from './Icons'
import { List, Row, Section, Sheet } from './Chrome'

type Status = 'done' | 'modified' | 'skipped'

const OPTIONS: { value: Status; title: string; sub: string; color: string; Icon: typeof IconCheck }[] = [
  { value: 'done', title: 'Zrobione', sub: 'Tak jak w planie', color: 'var(--green)', Icon: IconCheck },
  { value: 'modified', title: 'Inaczej', sub: 'Krócej, lżej, inna trasa', color: 'var(--orange)', Icon: IconAdjust },
  { value: 'skipped', title: 'Odpuszczone', sub: 'Nie było jazdy', color: 'var(--red)', Icon: IconClose },
]

const RPE_HINT: Record<number, string> = {
  1: 'spacer',
  3: 'bardzo lekko',
  5: 'umiarkowanie',
  6: 'równo, można gadać',
  7: 'ciężko',
  8: 'bardzo ciężko',
  9: 'na granicy',
  10: 'maksymalnie',
}

/** „Jak poszło?” – trzy stany, RPE i notatka. Domyślnie wybrany jest stan sugerowany przez dane. */
export function AfterSheet({ log, suggested, onClose, onSave }: { log: SessionLog | undefined; suggested: Status; onClose: () => void; onSave: (status: Status, extra: { rpe: number | null; notes: string | null }) => Promise<void> }) {
  const [status, setStatus] = useState<Status>((log?.status as Status | undefined) && ['done', 'modified', 'skipped'].includes(log!.status) ? (log!.status as Status) : suggested)
  const [rpe, setRpe] = useState<number | null>(log?.rpe ?? null)
  const [notes, setNotes] = useState(log?.notes ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await onSave(status, { rpe: status === 'skipped' ? null : rpe, notes: notes.trim() || null })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Jak poszło?" onClose={onClose} done={{ label: 'Zapisz', onClick: save, disabled: busy }}>
      <Section>
        <List>
          {OPTIONS.map((o) => (
            <Row
              key={o.value}
              onClick={() => setStatus(o.value)}
              title={o.title}
              subtitle={o.sub}
              icon={
                <span className="ios-icon-tile" style={{ background: o.color }}>
                  <o.Icon size={18} />
                </span>
              }
              accessory={status === o.value ? <span style={{ color: 'var(--blue)' }}><IconCheck size={20} /></span> : <span className="w-5" />}
            />
          ))}
        </List>
      </Section>

      {status !== 'skipped' && (
        <Section header="Jak ciężko było (RPE)" footer={rpe ? RPE_HINT[rpe] ?? '' : 'Subiektywna skala 1–10. Pomaga liczyć obciążenie, gdy nie ma mocy ani tętna.'}>
          <div className="mx-4 grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                onClick={() => setRpe(v)}
                aria-pressed={rpe === v}
                className="ios-num ios-press min-h-12 rounded-xl text-[17px] font-semibold"
                style={rpe === v ? { background: 'var(--blue)', color: '#fff' } : { background: 'var(--card)', color: 'var(--label)' }}
              >
                {v}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section header="Notatka">
        <List>
          <div className="ios-row">
            <input className="ios-input ios-input-block" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={status === 'skipped' ? 'Powód (opcjonalnie)' : 'Jedno zdanie (opcjonalnie)'} aria-label="Notatka" />
          </div>
        </List>
      </Section>
    </Sheet>
  )
}
