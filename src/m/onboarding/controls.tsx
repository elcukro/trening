import type { ReactNode } from 'react'
import { IconCheck, IconChevronLeft } from '@/ios/components/Icons'
import { haptic } from '@/native'
import { useT } from '@/i18n/react'
import { fmtDate } from '@/lib/dates'

/**
 * Kontrolki onboardingu: wybór dotknięciem zamiast klawiatury (docs/24 § 6). Liczby z listy systemowej iOS
 * (przezroczysty `<select>` na całym wierszu – koło wyboru otwiera się na bieżącej wartości), daty z kalendarza.
 */

/** Sekcja kroku: etykieta nad kontrolką i opcjonalny przypis. */
export function Field({ label, foot, children }: { label: string; foot?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-eyebrow px-1">{label}</h2>
      {children}
      {foot && <p className="m-foot m-dim px-1">{foot}</p>}
    </section>
  )
}

/** Chipy: jeden wybór (`multi` = false) albo wiele; wartości w kolejności opcji. */
export function Chips<T extends string | number>({ label, options, value, onChange, multi }: { label: string; options: readonly { value: T; label: string }[]; value: T | T[] | undefined | null; onChange: (v: T[] | T) => void; multi?: boolean }) {
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v)
  return (
    <div className="ob-chips" role={multi ? 'group' : 'radiogroup'} aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role={multi ? 'checkbox' : 'radio'}
          aria-checked={selected(o.value)}
          className="ob-chip"
          onClick={() => {
            haptic.selection()
            if (!multi) return onChange(o.value)
            const cur = Array.isArray(value) ? value : []
            onChange(options.map((x) => x.value).filter((v) => (v === o.value ? !cur.includes(v) : cur.includes(v))))
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Duże karty wyboru (jeden z kilku) – z opisem pod tytułem i opcjonalną grafiką. */
export function Options<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { value: T; title: string; sub?: string; art?: string }[]; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <div className="m-list" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="m-row ob-option"
          onClick={() => {
            haptic.selection()
            onChange(o.value)
          }}
        >
          {o.art && <img src={o.art} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />}
          <span className="min-w-0 flex-1">
            <span className="m-headline block">{o.title}</span>
            {o.sub && <span className="m-foot m-dim block">{o.sub}</span>}
          </span>
          <span className="ob-radio" aria-hidden>
            {value === o.value && <IconCheck size={16} />}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Wiersz z wartością z listy: cały wiersz jest przezroczystym `<select>` (iOS otwiera koło wyboru), widać etykietę,
 * wartość i chevron. `null` = „—” (pole opcjonalne niewypełnione).
 */
export function PickRow<T extends number | string>({ label, value, options, format, onChange, placeholder: ph, optional }: { label: string; value: T | null | undefined; options: readonly T[]; format: (v: T) => string; onChange: (v: T | null) => void; placeholder?: string; optional?: boolean }) {
  const t = useT()
  const placeholder = ph ?? t.onboarding.controls.choose
  const list = value != null && !options.includes(value) ? [value, ...options] : options
  return (
    <label className="m-row ob-pick">
      <span className="flex-1">{label}</span>
      <span className={value != null ? 'm-num' : 'm-dim-3'}>{value != null ? format(value) : placeholder}</span>
      <span className="m-dim-3 rotate-180" aria-hidden>
        <IconChevronLeft size={16} />
      </span>
      <select
        aria-label={label}
        value={value != null ? String(value) : ''}
        onChange={(e) => {
          haptic.selection()
          const hit = list.find((v) => String(v) === e.target.value)
          onChange(hit ?? null)
        }}
      >
        {(optional || value == null) && <option value="">{optional ? t.onboarding.controls.dontKnowOption : placeholder}</option>}
        {list.map((v) => (
          <option key={String(v)} value={String(v)}>
            {format(v)}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Data z kalendarza systemowego (bez klawiatury). */
export function DateRow({ label, value, onChange, min, max, optional }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; min?: string; max?: string; optional?: boolean }) {
  const t = useT()
  return (
    <label className="m-row ob-pick">
      <span className="flex-1">{label}</span>
      <span className={value ? 'm-num' : 'm-dim-3'}>{value ? fmtDate(value) : optional ? t.onboarding.controls.noDate : t.onboarding.controls.choose}</span>
      <span className="m-dim-3 rotate-180" aria-hidden>
        <IconChevronLeft size={16} />
      </span>
      <input
        type="date"
        aria-label={label}
        value={value ?? ''}
        min={min}
        max={max}
        onChange={(e) => {
          const v = e.target.value
          onChange(/^\d{4}-\d{2}-\d{2}$/.test(v) && (!min || v >= min) && (!max || v <= max) ? v : null)
        }}
      />
    </label>
  )
}

/** Tak / Nie dla pytania przesiewowego. */
export function YesNo({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  const t = useT()
  return (
    <div className="ob-yesno" role="radiogroup" aria-label={label}>
      {[
        { v: false, t: t.common.no },
        { v: true, t: t.common.yes },
      ].map((o) => (
        <button
          key={o.t}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          data-yes={o.v}
          onClick={() => {
            haptic.selection()
            onChange(o.v)
          }}
        >
          {o.t}
        </button>
      ))}
    </div>
  )
}

/** Wartości lo..hi co `step` (bez błędów zmiennoprzecinkowych). */
export function range(lo: number, hi: number, step = 1): number[] {
  const n = Math.round((hi - lo) / step)
  return Array.from({ length: n + 1 }, (_, i) => Math.round((lo + i * step) * 100) / 100)
}
