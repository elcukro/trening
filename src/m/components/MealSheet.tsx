import { useRef, useState } from 'react'
import type { MealItem, MealLabel, MealRow } from '@/db'
import { addMeal, deleteMeal, restoreMeal, updateMeal } from '@/db/repo'
import { labelTotals, scaleMeal } from '@/engine/intake'
import { parseMealPhotos, shrinkPhoto, canParseMeal, type ParsedMeal } from '@/sync/mealParse'
import { useToast } from '@/components/Toast'
import { nowHHMM, todayISO } from '@/lib/dates'
import { num } from '@/lib/format'
import { Btn, Sheet } from './Chrome'

const PORTIONS = [
  { f: 0.75, label: 'Mniej' },
  { f: 1, label: 'Tak jak jest' },
  { f: 1.25, label: 'Więcej' },
  { f: 2, label: 'Podwójna' },
] as const

const kcal = (n: number) => `${n.toLocaleString('pl-PL')} kcal`

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
      setError('Nie udało się wczytać zdjęcia')
    }
  }

  async function recognize() {
    setBusy(true)
    setError(null)
    try {
      setDraft(fromParsed(await parseMealPhotos(photos, note, { protein_target: proteinTarget })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!draft) return
    const t = totals(draft)
    const row = {
      name: draft.name.trim() || 'Posiłek',
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
        toast.notify(`Zmienione: ${kcal(t.kcal)} · białko ${t.protein_g} g`, 'success')
      } else {
        const saved = await addMeal({ ...row, date, time: date === todayISO() ? nowHHMM() : null, source: draft.source, confidence: draft.confidence, label: draft.label, note: note.trim() || null })
        toast.notify(`Zapisane: ${kcal(t.kcal)} · białko ${t.protein_g} g`, 'success', undefined, { label: 'Cofnij', onClick: () => void deleteMeal(saved.id) })
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!meal) return
    await deleteMeal(meal.id)
    toast.notify(`Usunięte: ${meal.name}`, 'info', undefined, { label: 'Cofnij', onClick: () => void restoreMeal(meal.id) })
    onClose()
  }

  const t = draft ? totals(draft) : null
  const saveBtn = draft && t && t.kcal > 0 && (
    <button className="m-nav-btn font-semibold disabled:opacity-40" onClick={() => void save()} disabled={busy}>
      Zapisz
    </button>
  )

  return (
    <Sheet title={meal ? 'Posiłek' : 'Dodaj posiłek'} onClose={onClose} dirty={dirty && !busy} action={saveBtn || undefined}>
      <div className="flex flex-col gap-4">
        {!draft && (
          <>
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addPhoto(e.target.files).then(() => (e.target.value = ''))} aria-label="Zdjęcie z aparatu" />
            <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => void addPhoto(e.target.files).then(() => (e.target.value = ''))} aria-label="Zdjęcie z galerii" />
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p} alt={`Zdjęcie ${i + 1}`} className="aspect-square w-full rounded-2xl object-cover" />
                    <button className="m-hit absolute right-2 top-2 h-8 w-8 rounded-full bg-black/60 text-white" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} aria-label="Usuń zdjęcie">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 2 && (
              <div className="grid grid-cols-2 gap-3">
                <Btn onClick={() => camera.current?.click()} soft={photos.length > 0}>
                  {photos.length ? 'Drugie zdjęcie' : 'Zrób zdjęcie'}
                </Btn>
                <Btn soft onClick={() => gallery.current?.click()}>
                  Z galerii
                </Btn>
              </div>
            )}
            <p className="m-foot m-dim px-1">
              Talerz z góry albo z boku. Produkt z opakowania (żelki, napój, baton) – zrób zdjęcie <b>tabeli wartości odżywczych</b>; drugie zdjęcie może pokazać przód opakowania. Zdjęć nie zapisujemy.
            </p>
            <input className="m-input" placeholder="Notatka, np. „duża porcja”, „bez sosu”" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Notatka do posiłku" />
            {error && <p className="m-sub" style={{ color: 'var(--red)' }}>{error}</p>}
            {!canParseMeal && <p className="m-sub m-dim">Rozpoznawanie zdjęć wymaga konta.</p>}
            <Btn onClick={() => void recognize()} disabled={busy || photos.length === 0 || !canParseMeal} className="w-full">
              {busy ? 'Analizuję zdjęcie… (ok. 10 s)' : 'Rozpoznaj'}
            </Btn>
          </>
        )}

        {draft && t && (
          <>
            <label className="m-list p-3">
              <span className="m-eyebrow block">{draft.label ? 'Produkt' : 'Danie'}</span>
              <input className="m-headline mt-1 w-full bg-transparent outline-none" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Nazwa posiłku" />
            </label>

            <div className="m-list p-4">
              <div className="flex items-baseline justify-between">
                <span className="m-big m-num">{kcal(t.kcal)}</span>
                {draft.confidence != null && draft.source === 'photo' && <Confidence value={draft.confidence} />}
              </div>
              <p className="m-sub m-dim mt-1">
                białko {t.protein_g} g{t.carbs_g != null ? ` · węgle ${t.carbs_g} g` : ''}
                {t.fat_g != null ? ` · tłuszcz ${t.fat_g} g` : ''}
              </p>
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
                <div className="m-chips" role="radiogroup" aria-label="Porcja">
                  {PORTIONS.map((p) => (
                    <button key={p.f} role="radio" aria-checked={draft.portion === p.f} className="m-chip" style={draft.portion === p.f ? { background: 'var(--accent)', color: '#fff' } : undefined} onClick={() => setDraft({ ...draft, portion: p.f })}>
                      {p.label}
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
              Zapisz
            </Btn>
            {meal ? (
              <Btn soft onClick={() => void remove()} className="w-full">
                Usuń posiłek
              </Btn>
            ) : (
              <button className="m-sub m-hit px-1 text-left" style={{ color: 'var(--accent)' }} onClick={() => setDraft(null)}>
                Inne zdjęcie
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function Confidence({ value }: { value: number }) {
  const dots = value >= 0.75 ? 3 : value >= 0.5 ? 2 : 1
  return (
    <span className="m-foot m-dim flex items-center gap-1" aria-label={`Pewność ${Math.round(value * 100)} %`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className="inline-block h-2 w-2 rounded-full" style={{ background: i <= dots ? 'var(--green)' : 'var(--fill-2)' }} />
      ))}
    </span>
  )
}

/** Ilość produktu z etykiety: całe opakowanie, połowa, porcja z etykiety albo dowolne g/ml. */
function LabelAmount({ draft, onChange }: { draft: Draft; onChange: (amount: number) => void }) {
  const l = draft.label!
  const u = l.unit
  const [text, setText] = useState(draft.amount != null ? String(draft.amount) : '')
  const options = [
    ...(l.package ? [{ v: l.package, label: `Całe opakowanie (${num(l.package, 0)} ${u})` }, { v: Math.round(l.package / 2), label: 'Połowa' }] : []),
    ...(l.serving && l.serving !== l.package ? [{ v: l.serving, label: `Porcja z etykiety (${num(l.serving, 0)} ${u})` }] : []),
  ]
  const pick = (v: number) => {
    setText(String(v))
    onChange(v)
  }
  return (
    <>
      <p className="m-foot m-dim px-1">
        Na 100 {u}: {num(l.per_100.kcal, 0)} kcal
        {l.per_100.protein_g != null ? ` · białko ${num(l.per_100.protein_g)} g` : ''}
        {l.per_100.carbs_g != null ? ` · węgle ${num(l.per_100.carbs_g)} g` : ''}
        {l.per_100.fat_g != null ? ` · tłuszcz ${num(l.per_100.fat_g)} g` : ''}
      </p>
      {options.length > 0 && (
        <div className="m-chips" role="radiogroup" aria-label="Ile zjedzone">
          {options.map((o) => (
            <button key={o.label} role="radio" aria-checked={draft.amount === o.v} className="m-chip" style={draft.amount === o.v ? { background: 'var(--accent)', color: '#fff' } : undefined} onClick={() => pick(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      <label className="m-list flex items-center gap-2 p-3">
        <span className="flex-1">Zjedzone</span>
        <input
          className="m-headline w-24 bg-transparent text-right outline-none"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value.replace(',', '.'))
            if (Number.isFinite(n) && n >= 0) onChange(n)
          }}
          aria-label={`Zjedzona ilość w ${u}`}
        />
        <span className="m-dim">{u}</span>
      </label>
    </>
  )
}
