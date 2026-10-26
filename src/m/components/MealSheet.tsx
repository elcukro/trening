import { useEffect, useRef, useState } from 'react'
import type { MealItem, MealLabel, MealRow } from '@/db'
import { addMeal, deleteMeal, restoreMeal, updateMeal } from '@/db/repo'
import { labelTotals, scaleMeal } from '@/engine/intake'
import { parseMealPhotos, shrinkPhoto, canParseMeal, type ParsedMeal } from '@/sync/mealParse'
import { useToast } from '@/components/Toast'
import { friendlyError } from '@/lib/errors'
import { confirmAction, haptic } from '@/native'
import { nowHHMM, todayISO } from '@/lib/dates'
import { num } from '@/lib/format'
import { Btn, Sheet } from './Chrome'
import { Waiting } from './Waiting'
import { t as tr } from '@/i18n'
import { useT } from '@/i18n/react'

const PORTIONS = [
  { f: 0.75, label: 'less' },
  { f: 1, label: 'asIs' },
  { f: 1.25, label: 'more' },
  { f: 2, label: 'double' },
] as const

const kcal = (n: number) => `${num(n, 0)} kcal`
/** „białko 30 g · węglowodany 40 g · tłuszcz 10 g” – brakujące wartości pomijamy. */
function macros(protein: number | null, carbs: number | null, fat: number | null, digits = 1): string {
  const m = tr().m.meal
  return [protein != null ? m.protein(num(protein, digits)) : null, carbs != null ? m.carbs(num(carbs, digits)) : null, fat != null ? m.fat(num(fat, digits)) : null].filter(Boolean).join(' · ')
}

/** Szkic posiłku przed zapisem – to samo dla nowego zdjęcia i edycji zapisanego wpisu. */
interface Draft {
  name: string
  source: MealRow['source']
  confidence: number | null
  question: string | null
  warnings: string[]
  /** danie: wartości dla porcji „tak jak jest” (×1) */
  base: { kcal: number; protein_g: number; carbs_g: number | null; fat_g: number | null; items: MealItem[] }
  portion: number
  /** etykieta: wartości na 100 i zjedzona ilość */
  label: MealLabel | null
  amount: number | null
}

function fromParsed(p: ParsedMeal): Draft {
  const base = { kcal: p.total.kcal, protein_g: p.total.protein_g, carbs_g: p.total.carbs_g, fat_g: p.total.fat_g, items: p.items }
  const amount = p.label ? (p.label.package ?? p.label.serving ?? 100) : null
  return { name: p.name, source: p.kind === 'label' ? 'label' : 'photo', confidence: p.confidence, question: p.question, warnings: p.warnings, base, portion: 1, label: p.label, amount }
}

function fromRow(m: MealRow): Draft {
  const f = m.portion_factor || 1
  const base = scaleMeal({ kcal: m.kcal, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, items: m.items }, 1 / f)
  return { name: m.name, source: m.source, confidence: m.confidence, question: null, warnings: [], base, portion: f, label: m.label, amount: m.amount }
}

/** Sumy szkicu: etykieta – kod liczy z ilości; danie – mnożnik porcji. */
function totals(d: Draft): { kcal: number; protein_g: number; carbs_g: number | null; fat_g: number | null; items: MealItem[] } {
  if (d.label && d.amount != null) {
    const t = labelTotals(d.label.per_100, d.amount)
    return { ...t, items: [{ name: d.name, grams: Math.round(d.amount), kcal: t.kcal, protein_g: t.protein_g }] }
  }
  return scaleMeal(d.base, d.portion)
}

/**
 * Arkusz „Posiłek” (docs/25 § 3): zdjęcie talerza albo etykiety → podgląd → korekta porcji/ilości → zapis z „Cofnij”.
 * Zdjęcie zmniejszamy na telefonie i wysyłamy raz; nie zapisujemy go nigdzie.
 */
export function MealSheet({ date, meal, proteinTarget, onClose }: { date: string; meal?: MealRow; proteinTarget: number; onClose: () => void }) {
  const tx = useT()
  const tm = tx.m.meal
  const toast = useToast()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(meal ? fromRow(meal) : null)
  // nowy posiłek: zmiana = zdjęcie, opis albo rozpoznany szkic; istniejący: szkic inny niż zapisany
  const [initial] = useState(() => JSON.stringify(meal ? fromRow(meal) : null))
  const dirty = photos.length > 0 || note.trim() !== '' || JSON.stringify(draft) !== initial

  async function addPhoto(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setError(null)
    try {
      const url = await shrinkPhoto(f)
      setPhotos((p) => [...p, url].slice(0, 2))
    } catch {
      setError(tm.photoLoadFailed)
    }
  }

  // rozpoznawanie trwa ok. 10 s – animacja na miejscu przycisku i „Anuluj” (docs/27 § 6)
  const abort = useRef<AbortController | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  useEffect(() => () => abort.current?.abort(), [])
  async function recognize() {
    const ctl = new AbortController()
    abort.current = ctl
    setRecognizing(true)
    setError(null)
    try {
      const parsed = await parseMealPhotos(photos, note, { protein_target: proteinTarget }, ctl.signal)
      if (ctl.signal.aborted) return
      setDraft(fromParsed(parsed))
      haptic.success()
    } catch (e) {
      if (ctl.signal.aborted) return
      setError(tm.notRecognized(friendlyError(e).message))
      haptic.error()
    } finally {
      if (abort.current === ctl) abort.current = null
      setRecognizing(false)
    }
  }
  function cancelRecognize() {
    abort.current?.abort()
    setRecognizing(false)
  }

  async function save() {
    if (!draft) return
    const t = totals(draft)
    const row = {
      name: draft.name.trim() || tm.fallbackName,
      kcal: t.kcal,
      protein_g: t.protein_g,
      carbs_g: t.carbs_g,
      fat_g: t.fat_g,
      items: t.items,
      portion_factor: draft.label ? 1 : draft.portion,
      amount: draft.label ? draft.amount : null,
    }
    setBusy(true)
    try {
      if (meal) {
        await updateMeal(meal.id, row)
        toast.notify(tm.changed(kcal(t.kcal), t.protein_g), 'success')
      } else {
        const saved = await addMeal({ ...row, date, time: date === todayISO() ? nowHHMM() : null, source: draft.source, confidence: draft.confidence, label: draft.label, note: note.trim() || null })
        toast.notify(tm.saved(kcal(t.kcal), t.protein_g), 'success', undefined, { label: tx.common.undo, onClick: () => void deleteMeal(saved.id) })
      }
      onClose()
    } catch (e) {
      toast.notify(tm.saveFailed, 'error', friendlyError(e).message)
    } finally {
      setBusy(false)
    }
  }

  // usunięcie: systemowy arkusz z czerwonym „Usuń posiłek”, potem i tak „Cofnij” (docs/27 § 6)
  async function remove() {
    if (!meal) return
    if (!(await confirmAction({ title: tm.deleteTitle(meal.name), message: tm.deleteMessage, action: tm.deleteAction }))) return
    try {
      await deleteMeal(meal.id)
      toast.notify(tm.deleted(meal.name), 'success', undefined, { label: tx.common.undo, onClick: () => void restoreMeal(meal.id) })
      onClose()
    } catch (e) {
      toast.notify(tm.deleteFailed, 'error', friendlyError(e).message)
    }
  }

  const t = draft ? totals(draft) : null
  const saveBtn = draft && t && t.kcal > 0 && (
    <button className="m-nav-btn font-semibold disabled:opacity-40" onClick={() => void save()} disabled={busy}>
      {tx.common.save}
    </button>
  )

  return (
    <Sheet title={meal ? tm.title : tx.m.food.addMeal} onClose={onClose} dirty={dirty && !busy} action={saveBtn || undefined}>
      <div className="flex flex-col gap-4">
        {!draft && (
          <>
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addPhoto(e.target.files).then(() => (e.target.value = ''))} aria-label={tm.cameraAria} />
            <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => void addPhoto(e.target.files).then(() => (e.target.value = ''))} aria-label={tm.galleryAria} />
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p} alt={tm.photoAlt(i + 1)} className="aspect-square w-full rounded-2xl object-cover" />
                    <button className="m-hit absolute right-2 top-2 h-8 w-8 rounded-full bg-black/60 text-white" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} aria-label={tm.removePhoto}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 2 && (
              <div className="grid grid-cols-2 gap-3">
                <Btn onClick={() => camera.current?.click()} soft={photos.length > 0}>
                  {photos.length ? tm.secondPhoto : tm.takePhoto}
                </Btn>
                <Btn soft onClick={() => gallery.current?.click()}>
                  {tm.fromGallery}
                </Btn>
              </div>
            )}
            <p className="m-foot m-dim px-1">
              {tm.tipBefore} <b>{tm.tipBold}</b>
              {tm.tipAfter}
            </p>
            <input className="m-input" placeholder={tm.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} aria-label={tm.noteAria} />
            {error && (
              <p className="m-sub" role="alert" style={{ color: 'var(--red)' }}>
                {error}
              </p>
            )}
            {!canParseMeal && <p className="m-sub m-dim">{tm.needsAccount}</p>}
            {recognizing ? (
              <Waiting label={tm.recognizing} detail={tm.tenSeconds} onCancel={cancelRecognize} />
            ) : (
              <Btn onClick={() => void recognize()} disabled={busy || photos.length === 0 || !canParseMeal} className="w-full">
                {error ? tm.retry : tm.recognize}
              </Btn>
            )}
          </>
        )}

        {draft && t && (
          <>
            <label className="m-list p-3">
              <span className="m-eyebrow block">{draft.label ? tm.product : tm.dish}</span>
              <input className="m-headline mt-1 w-full bg-transparent outline-none" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label={tm.nameAria} />
            </label>

            <div className="m-list p-4">
              <div className="flex items-baseline justify-between">
                <span className="m-big m-num">{kcal(t.kcal)}</span>
                {draft.confidence != null && draft.source === 'photo' && <Confidence value={draft.confidence} />}
              </div>
              <p className="m-sub m-dim mt-1">{macros(t.protein_g, t.carbs_g, t.fat_g)}</p>
            </div>

            {draft.question && (
              <p className="m-sub px-1" style={{ color: 'var(--orange)' }}>
                {draft.question}
              </p>
            )}
            {draft.warnings.map((w) => (
              <p key={w} className="m-sub px-1" style={{ color: 'var(--orange)' }}>
                {w}
              </p>
            ))}

            {draft.label ? <LabelAmount draft={draft} onChange={(amount) => setDraft({ ...draft, amount })} /> : (
              <>
                <div className="m-chips" role="radiogroup" aria-label={tm.portionAria}>
                  {PORTIONS.map((p) => (
                    <button key={p.f} role="radio" aria-checked={draft.portion === p.f} className="m-chip" style={draft.portion === p.f ? { background: 'var(--accent)', color: '#fff' } : undefined} onClick={() => setDraft({ ...draft, portion: p.f })}>
                      {tm.portions[p.label]}
                    </button>
                  ))}
                </div>
                {t.items.length > 0 && (
                  <div className="m-list">
                    {t.items.map((i) => (
                      <div key={i.name} className="m-row">
                        <span className="min-w-0 flex-1 truncate">{i.name}</span>
                        <span className="m-foot m-dim m-num">
                          {i.grams != null ? `${i.grams} g · ` : ''}
                          {i.kcal} kcal
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <Btn onClick={() => void save()} disabled={busy || t.kcal <= 0} className="w-full">
              {tx.common.save}
            </Btn>
            {meal ? (
              <Btn soft onClick={() => void remove()} className="w-full" style={{ color: 'var(--red)' }}>
                {tm.deleteAction}
              </Btn>
            ) : (
              <button className="m-sub m-hit px-1 text-left" style={{ color: 'var(--accent)' }} onClick={() => setDraft(null)}>
                {tm.otherPhoto}
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function Confidence({ value }: { value: number }) {
  const t = useT()
  const dots = value >= 0.75 ? 3 : value >= 0.5 ? 2 : 1
  return (
    <span className="m-foot m-dim flex items-center gap-1" aria-label={t.m.meal.confidence(Math.round(value * 100))}>
      {[1, 2, 3].map((i) => (
        <span key={i} className="inline-block h-2 w-2 rounded-full" style={{ background: i <= dots ? 'var(--green)' : 'var(--fill-2)' }} />
      ))}
    </span>
  )
}

/** Ilość produktu z etykiety: całe opakowanie, połowa, porcja z etykiety albo dowolne g/ml. */
function LabelAmount({ draft, onChange }: { draft: Draft; onChange: (amount: number) => void }) {
  const tm = useT().m.meal
  const l = draft.label!
  const u = l.unit
  const [text, setText] = useState(draft.amount != null ? String(draft.amount) : '')
  const options = [
    ...(l.package ? [{ v: l.package, label: tm.wholePack(`${num(l.package, 0)} ${u}`) }, { v: Math.round(l.package / 2), label: tm.half }] : []),
    ...(l.serving && l.serving !== l.package ? [{ v: l.serving, label: tm.labelServing(`${num(l.serving, 0)} ${u}`) }] : []),
  ]
  const pick = (v: number) => {
    setText(String(v))
    onChange(v)
  }
  return (
    <>
      <p className="m-foot m-dim px-1">
        {tm.per100(u, num(l.per_100.kcal, 0))}
        {macros(l.per_100.protein_g, l.per_100.carbs_g, l.per_100.fat_g).replace(/^(?=.)/, ' · ')}
      </p>
      {options.length > 0 && (
        <div className="m-chips" role="radiogroup" aria-label={tm.howMuchAria}>
          {options.map((o) => (
            <button key={o.label} role="radio" aria-checked={draft.amount === o.v} className="m-chip" style={draft.amount === o.v ? { background: 'var(--accent)', color: '#fff' } : undefined} onClick={() => pick(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      <label className="m-list flex items-center gap-2 p-3">
        <span className="flex-1">{tm.eaten}</span>
        <input
          className="m-headline w-24 bg-transparent text-right outline-none"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value.replace(',', '.'))
            if (Number.isFinite(n) && n >= 0) onChange(n)
          }}
          aria-label={tm.eatenAria(u)}
        />
        <span className="m-dim">{u}</span>
      </label>
    </>
  )
}
