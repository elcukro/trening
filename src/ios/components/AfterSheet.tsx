import { useState } from 'react'
import type { SessionLog } from '@/db'
import { IconAdjust, IconCheck, IconClose } from './Icons'
import { List, Row, Section, Sheet } from './Chrome'
import { useT } from '@/i18n/react'
import type { Messages } from '@/i18n'

type Status = 'done' | 'modified' | 'skipped'

function options(t: Messages): { value: Status; title: string; sub: string; color: string; Icon: typeof IconCheck }[] {
  return [
    { value: 'done', title: t.ios.status.done, sub: t.ios.after.doneSub, color: 'var(--green)', Icon: IconCheck },
    { value: 'modified', title: t.ios.status.modified, sub: t.ios.after.modifiedSub, color: 'var(--orange)', Icon: IconAdjust },
    { value: 'skipped', title: t.ios.status.skipped, sub: t.ios.after.skippedSub, color: 'var(--red)', Icon: IconClose },
  ]
}

/** „Jak poszło?” – trzy stany, RPE i notatka. Domyślnie wybrany jest stan sugerowany przez dane. */
export function AfterSheet({ log, suggested, onClose, onSave }: { log: SessionLog | undefined; suggested: Status; onClose: () => void; onSave: (status: Status, extra: { rpe: number | null; notes: string | null }) => Promise<void> }) {
  const [status, setStatus] = useState<Status>((log?.status as Status | undefined) && ['done', 'modified', 'skipped'].includes(log!.status) ? (log!.status as Status) : suggested)
  const [rpe, setRpe] = useState<number | null>(log?.rpe ?? null)
  const [notes, setNotes] = useState(log?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const t = useT()
  const tx = t.ios.after
  const rpeHint = tx.rpeHint as Record<number, string>

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
    <Sheet title={tx.title} onClose={onClose} done={{ label: t.common.save, onClick: save, disabled: busy }}>
      <Section>
        <List>
          {options(t).map((o) => (
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
        <Section header={tx.rpeHeader} footer={rpe ? rpeHint[rpe] ?? '' : tx.rpeFooter}>
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

      <Section header={tx.note}>
        <List>
          <div className="ios-row">
            <input className="ios-input ios-input-block" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={status === 'skipped' ? tx.reasonPlaceholder : tx.notePlaceholder} aria-label={tx.note} />
          </div>
        </List>
      </Section>
    </Sheet>
  )
}
