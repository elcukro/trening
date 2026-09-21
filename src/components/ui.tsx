import type { ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

/*
 * Jeden system kart, przycisków i pól – wszystkie ekrany korzystają z tych samych klas.
 * Skala pisma: 12 (text-xs), 14 (text-sm), 16 (text-base), 20 (text-xl), 24 (text-2xl).
 * Role: tytuł strony 24, tytuł karty 16, treść 14, podpisy i metadane 12.
 */

type CardTone = 'default' | 'accent' | 'muted' | 'warn'

const CARD_TONE: Record<CardTone, string> = {
  default: 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700',
  accent: 'bg-sky-50 border-sky-200 dark:bg-sky-950/50 dark:border-sky-900',
  muted: 'bg-slate-50 border-slate-200 dark:bg-slate-800/70 dark:border-slate-700',
  warn: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900',
}

export function Card({ children, className = '', tone = 'default' }: { children: ReactNode; className?: string; tone?: CardTone }) {
  return <section className={`rounded-2xl border p-4 shadow-card lg:p-5 ${CARD_TONE[tone]} ${className}`}>{children}</section>
}

/** Nagłówek karty: ikona w kółku o stałym rozmiarze, tytuł 16 px, po prawej metryka albo akcja. */
export function CardTitle({ icon, children, right, className = '' }: { icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <header className={`mb-3 flex items-center justify-between gap-3 ${className}`}>
      <h2 className="flex min-w-0 items-center gap-2.5 text-base font-semibold leading-6">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base leading-none dark:bg-slate-700" aria-hidden>
            {icon}
          </span>
        )}
        <span className="min-w-0 break-words">{children}</span>
      </h2>
      {right && <div className="flex shrink-0 items-center">{right}</div>}
    </header>
  )
}

/** Metryka po prawej stronie nagłówka karty – zawsze w tym samym stylu. */
export function Metric({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`text-sm font-semibold tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300 ${className}`}>{children}</span>
}

/** Sekcja wewnątrz karty oddzielona linią od poprzedniej. */
export function CardSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-700 ${className}`}>{children}</div>
}

/** Wewnętrzny panel w karcie (formularz, sugestia, komunikat). */
export type InsetTone = 'default' | 'info' | 'warn' | 'error' | 'success'

const INSET_TONE: Record<InsetTone, string> = {
  default: 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-100',
  info: 'bg-sky-50 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100',
  warn: 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
  error: 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200',
  success: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100',
}

export function Inset({ children, tone = 'default', className = '', role }: { children: ReactNode; tone?: InsetTone; className?: string; role?: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 text-sm ${INSET_TONE[tone]} ${className}`} role={role}>
      {children}
    </div>
  )
}

export function Badge({ children, color = 'bg-slate-500', className = '', title }: { children: ReactNode; color?: string; className?: string; title?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium leading-4 text-white ${color} ${className}`} title={title}>
      <span className="truncate">{children}</span>
    </span>
  )
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-sky-600 text-white shadow-sm hover:bg-sky-500 active:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-400',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600 dark:active:bg-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500',
  ghost: 'bg-transparent text-sky-700 hover:bg-sky-50 active:bg-sky-100 disabled:text-slate-400 dark:text-sky-300 dark:hover:bg-slate-700 dark:active:bg-slate-600',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 active:bg-red-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm',
  sm: 'min-h-9 px-3 text-sm',
}

/** Klasy przycisku – także dla <Link>, żeby odnośniki-akcje wyglądały jak przyciski. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = ''): string {
  // bez `whitespace-nowrap`: w wąskiej siatce (np. dwa przyciski obok siebie na telefonie) etykieta ma się zawinąć, nie obciąć
  return `inline-flex items-center justify-center gap-1.5 rounded-xl text-center font-semibold leading-5 transition-colors select-none disabled:cursor-not-allowed ${BUTTON_SIZE[size]} ${BUTTON_VARIANT[variant]} ${className}`
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  disabled,
  ariaLabel,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  ariaLabel?: string
  title?: string
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title} className={buttonClass(variant, size, className)}>
      {children}
    </button>
  )
}

/** Przełącznik segmentowy (zakładki, motyw, wariant listy). Domyślnie zwykłe przyciski z aria-pressed; `radiogroup` – radio. */
export function Segmented<T extends string>({ value, onChange, options, label, className = '', role = 'group' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string; role?: 'group' | 'radiogroup' }) {
  const radio = role === 'radiogroup'
  return (
    <div className={`grid gap-1 rounded-xl bg-slate-200/80 p-1 dark:bg-slate-700 ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role={role} aria-label={label}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role={radio ? 'radio' : undefined}
            aria-checked={radio ? active : undefined}
            aria-pressed={radio ? undefined : active}
            onClick={() => onChange(o.value)}
            className={`min-h-10 truncate rounded-lg px-2 text-sm font-semibold transition-colors ${active ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{children}</span>
    </div>
  )
}

export function PageTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-3 flex items-end justify-between gap-3 lg:mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{children}</p>
}

/** Mała kropka statusu/znacznika – w kalendarzu i na kartach. */
export function Dot({ color, title, className = '' }: { color: string; title?: string; className?: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color} ${className}`} title={title} aria-label={title} />
}

/* ---------- Formularze: etykieta nad polem, równe wysokości, błąd pod polem ---------- */

export const inputCls =
  'block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/25'

/**
 * Pole formularza. Etykieta obejmuje kontrolkę (dostępna nazwa = tekst etykiety),
 * podpowiedź i błąd są pod polem.
 */
export function Field({ label, children, hint, error, className = '' }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: string | null; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500 dark:text-slate-500">{hint}</span> : null}
    </label>
  )
}

export function Input({ className = '', invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} aria-invalid={invalid || undefined} className={`${inputCls} ${className}`} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${className}`} />
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-20 py-2 ${className}`} />
}

export function Checkbox({ label, hint, checked, onChange, className = '' }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (e: ChangeEvent<HTMLInputElement>) => void; className?: string }) {
  return (
    <label className={`flex min-h-11 items-start gap-3 py-1.5 text-sm ${className}`}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded accent-sky-600" checked={checked} onChange={onChange} />
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
    </label>
  )
}

/** Zestaw przycisków akcji o równej wysokości. */
export function Actions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>
}
