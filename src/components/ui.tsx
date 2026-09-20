import type { ReactNode } from 'react'

export function Card({ children, className = '', tone = 'default' }: { children: ReactNode; className?: string; tone?: 'default' | 'accent' | 'muted' | 'warn' }) {
  const tones = {
    default: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    accent: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900',
    muted: 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700',
    warn: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  }
  return <section className={`rounded-2xl border p-4 shadow-sm lg:p-5 ${tones[tone]} ${className}`}>{children}</section>
}

export function CardTitle({ icon, children, right }: { icon?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-2 flex items-center justify-between gap-2 lg:mb-3">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold lg:text-lg">
        {icon && (
          <span className="shrink-0" aria-hidden>
            {icon}
          </span>
        )}
        <span className="min-w-0">{children}</span>
      </h2>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}

export function Badge({ children, color = 'bg-slate-500', className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${color} ${className}`}>{children}</span>
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  type = 'button',
  disabled,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  ariaLabel?: string
}) {
  const v = {
    primary: 'bg-sky-600 text-white hover:bg-sky-500 active:bg-sky-700 disabled:bg-slate-400',
    secondary: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600 active:bg-slate-300 dark:active:bg-slate-600',
    ghost: 'bg-transparent text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-800 active:bg-sky-50 dark:active:bg-slate-800',
    danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${v[variant]} ${className}`}>
      {children}
    </button>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

export function PageTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-3 flex items-end justify-between gap-3 lg:mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{children}</h1>
        {sub && <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-slate-500">{children}</p>
}

/** Mała kropka statusu/znacznika – w kalendarzu i na kartach. */
export function Dot({ color, title, className = '' }: { color: string; title?: string; className?: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color} ${className}`} title={title} aria-label={title} />
}
