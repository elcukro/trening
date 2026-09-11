import type { ReactNode } from 'react'

export function Card({ children, className = '', tone = 'default' }: { children: ReactNode; className?: string; tone?: 'default' | 'accent' | 'muted' | 'warn' }) {
  const tones = {
    default: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    accent: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900',
    muted: 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700',
    warn: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  }
  return <section className={`rounded-2xl border p-4 shadow-sm ${tones[tone]} ${className}`}>{children}</section>
}

export function CardTitle({ icon, children, right }: { icon?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon && <span aria-hidden>{icon}</span>}
        {children}
      </h2>
      {right}
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
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const v = {
    primary: 'bg-sky-600 text-white active:bg-sky-700 disabled:bg-slate-400',
    secondary: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100 active:bg-slate-300 dark:active:bg-slate-600',
    ghost: 'bg-transparent text-sky-700 dark:text-sky-300 active:bg-sky-50 dark:active:bg-slate-800',
    danger: 'bg-red-600 text-white active:bg-red-700',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${v[variant]} ${className}`}>
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

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-3">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {sub && <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
    </header>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-slate-500">{children}</p>
}
