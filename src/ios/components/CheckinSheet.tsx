import { useState } from 'react'
import type { Checkin } from '@/db'
import { fmtDayMonth } from '@/lib/dates'
import { num } from '@/lib/format'
import { canParseCheckin, parseCheckinText } from '@/sync/checkinParse'
import { getLang } from '@/i18n/core'
import { useT } from '@/i18n/react'
import { Btn, List, Row, Section, Sheet } from './Chrome'

const SCALES = ['sleep', 'legs', 'motivation'] as const

type ScaleKey = (typeof SCALES)[number]

/** Liczba do pola: przecinek dziesiętny po polsku, kropka po angielsku. */
function decimalStr(x: number): string {
  return getLang() === 'pl' ? String(x).replace('.', ',') : String(x)
}

/** Liczba z pola (przecinek albo kropka dziesiętna); puste albo bezsensowne = null. */
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
export function CheckinSheet({ checkin, weighDue, lastWeight, onClose, onSave }: { checkin: Checkin | undefined; weighDue: boolean; lastWeight: { date: string; kg: number } | null; onClose: () => void; onSave: (patch: Partial<Checkin>) => Promise<void> }) {
  const [weight, setWeight] = useState(checkin?.weight_kg != null ? decimalStr(checkin.weight_kg) : '')
  const [rhr, setRhr] = useState(checkin?.resting_hr != null ? String(checkin.resting_hr) : '')
  const [scale, setScale] = useState<Record<ScaleKey, number | null>>({
    sleep: checkin?.sleep ?? null,
    legs: checkin?.legs ?? null,
    motivation: checkin?.motivation ?? null,
  })
  const [busy, setBusy] = useState(false)
  // check-in jednym zdaniem: tekst (także dyktowany) → pola do przejrzenia; uwagi i choroba idą z zapisem, gdy model je wyłowił
  const [sentence, setSentence] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<{ sick: boolean | null; notes: string | null } | null>(null)
  const [parseMsg, setParseMsg] = useState<string | null>(null)
  const t = useT()
  const tx = t.ios.checkin

  async function recognise() {
    setParsing(true)
    setParseMsg(null)
    try {
      const { fields, empty } = await parseCheckinText(sentence, { last_weight_kg: lastWeight?.kg ?? null, last_resting_hr: checkin?.resting_hr ?? null })
      if (empty) {
        setParseMsg(tx.nothingFound)
        return
      }
      if (fields.weight_kg != null) setWeight(decimalStr(fields.weight_kg))
      if (fields.resting_hr != null) setRhr(String(fields.resting_hr))
      setScale((x) => ({ sleep: fields.sleep ?? x.sleep, legs: fields.legs ?? x.legs, motivation: fields.motivation ?? x.motivation }))
      setParsed({ sick: fields.sick, notes: fields.notes })
      const f = tx.found
      const got = [fields.weight_kg != null && f.weight, fields.resting_hr != null && f.rhr, fields.sleep != null && f.sleep, fields.legs != null && f.legs, fields.motivation != null && f.motivation, fields.sick && f.sick, fields.notes && f.notes(fields.notes)].filter(Boolean)
      setParseMsg(tx.recognised(got.join(', ')))
    } catch (e) {
      setParseMsg(e instanceof Error ? e.message : tx.parseFailed)
    } finally {
      setParsing(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      await onSave({
        weight_kg: numOrNull(weight) ?? checkin?.weight_kg ?? null,
        resting_hr: numOrNull(rhr) ?? checkin?.resting_hr ?? null,
        sleep: scale.sleep,
        legs: scale.legs,
        motivation: scale.motivation,
        ...(parsed?.sick != null ? { sick: parsed.sick } : {}),
        ...(parsed?.notes ? { notes: [checkin?.notes, parsed.notes].filter(Boolean).join(' · ') } : {}),
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const nothing = !numOrNull(weight) && !numOrNull(rhr) && !scale.sleep && !scale.legs && !scale.motivation

  return (
    <Sheet title={tx.title} onClose={onClose} done={{ label: t.common.save, onClick: save, disabled: busy || nothing }}>
      {canParseCheckin && (
        <Section header={tx.sentenceHeader} footer={parseMsg ?? tx.sentenceFooter}>
          <div className="px-4 py-3">
            <textarea
              id="checkin-sentence"
              className="ios-input ios-input-block w-full"
              style={{ padding: '10px 12px', resize: 'none' }}
              rows={2}
              placeholder={tx.sentencePlaceholder}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              aria-label={tx.sentenceLabel}
            />
            <Btn kind="gray" className="mt-2 w-full" disabled={parsing || sentence.trim().length < 2} onClick={() => void recognise()}>
              {parsing ? tx.recognising : tx.recognise}
            </Btn>
          </div>
        </Section>
      )}
      <Section
        header={weighDue ? tx.measurementsWeighDue : tx.measurements}
        footer={
          <>
            {lastWeight ? tx.previous(num(lastWeight.kg, 1), fmtDayMonth(lastWeight.date)) : ''}
            {weighDue ? tx.weighDueHint : tx.noWeighHint}
          </>
        }
      >
        <List>
          <Row
            title={tx.weight}
            accessory={
              <span className="flex items-center gap-1">
                <input className="ios-input ios-num w-20 text-right" inputMode="decimal" placeholder={lastWeight ? num(lastWeight.kg, 1) : '—'} value={weight} onChange={(e) => setWeight(e.target.value)} aria-label={tx.weightLabel} />
                <span className="ios-body ios-dim shrink-0">kg</span>
              </span>
            }
          />
          <Row
            title={tx.rhr}
            accessory={
              <span className="flex items-center gap-1">
                <input className="ios-input ios-num w-20 text-right" inputMode="numeric" placeholder="—" value={rhr} onChange={(e) => setRhr(e.target.value)} aria-label={tx.rhr} />
                <span className="ios-body ios-dim shrink-0">bpm</span>
              </span>
            }
          />
        </List>
      </Section>
      <Section header={tx.feeling}>
        <List>
          {SCALES.map((key) => (
            <div key={key} className="ios-cell">
              <Scale label={tx.scales[key].label} low={tx.scales[key].low} high={tx.scales[key].high} value={scale[key]} onChange={(v) => setScale((x) => ({ ...x, [key]: v }))} />
            </div>
          ))}
        </List>
      </Section>
    </Sheet>
  )
}
