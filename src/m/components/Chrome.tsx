import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { IconChevronLeft, IconClose, IconHeart, IconProgress, IconToday, IconWeek } from '@/ios/components/Icons'

/* ------------------------------------------------------------------ ekran z dużym tytułem */

/**
 * Ekran mobilnego v2: duży tytuł, który po przewinięciu zwija się do środka paska (jak w natywnym iOS).
 * `day` ustawia kolor dnia (`--day`) dla kart i przycisków na tym ekranie.
 */
export function Screen({ title, subtitle, back, action, day, children }: { title: string; subtitle?: ReactNode; back?: string | (() => void); action?: ReactNode; day?: { color: string; soft: string }; children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setScrolled(!e?.isIntersecting), { rootMargin: '-1px 0px 0px 0px', threshold: 1 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div className="m-pb-tab" style={day ? ({ '--day': day.color, '--day-soft': day.soft } as React.CSSProperties) : undefined}>
      <div className="m-nav" data-scrolled={scrolled}>
        <div className="m-nav-inner">
          {back ? (
            <button className="m-nav-btn" onClick={() => (typeof back === 'string' ? navigate(back) : back())} aria-label="Wróć">
              <IconChevronLeft size={22} />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <span className="m-nav-title">{title}</span>
          <span className="ml-auto">{action}</span>
        </div>
      </div>
      <header className="px-5 pt-1 pb-3">
        <h1 className="m-display">{title}</h1>
        {subtitle && <p className="m-sub m-dim mt-1">{subtitle}</p>}
      </header>
      <div ref={sentinel} className="h-px" />
      <div className="flex flex-col gap-4 px-4">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ karty i listy */

export function Card({ children, className = '', day }: { children: ReactNode; className?: string; day?: boolean }) {
  return <div className={`m-card ${day ? 'm-card-day' : ''} p-5 ${className}`}>{children}</div>
}

export function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {label && <h2 className="m-eyebrow px-1">{label}</h2>}
      <div className="m-list">{children}</div>
    </section>
  )
}

export function Row({ title, sub, value, onClick, to, icon, chevron }: { title: ReactNode; sub?: ReactNode; value?: ReactNode; onClick?: () => void; to?: string; icon?: ReactNode; chevron?: boolean }) {
  const navigate = useNavigate()
  const body = (
    <>
      {icon && <span className="shrink-0 m-dim">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {sub && <span className="m-foot m-dim block truncate">{sub}</span>}
      </span>
      {value && <span className="m-num m-dim shrink-0">{value}</span>}
      {(chevron ?? (!!onClick || !!to)) && (
        <span className="m-dim-3 shrink-0 rotate-180">
          <IconChevronLeft size={18} />
        </span>
      )}
    </>
  )
  if (onClick || to) {
    return (
      <button className="m-row" onClick={onClick ?? (() => navigate(to!))}>
        {body}
      </button>
    )
  }
  return <div className="m-row">{body}</div>
}

export function Btn({ children, onClick, soft, disabled, className = '', type = 'button' }: { children: ReactNode; onClick?: () => void; soft?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit' }) {
  return (
    <button type={type} className={`m-btn ${soft ? 'm-btn-soft' : ''} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ arkusz */

export function Sheet({ title, onClose, children, action }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <>
      <div className="m-backdrop" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="m-sheet focus:outline-none" role="dialog" aria-modal="true" aria-label={title}>
        <div className="m-grabber" />
        <div className="relative flex items-center justify-between px-2 py-1">
          <button className="m-nav-btn" onClick={onClose} aria-label="Zamknij">
            <IconClose size={20} />
          </button>
          <span className="m-headline absolute left-1/2 -translate-x-1/2">{title}</span>
          <span className="min-w-11">{action}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">{children}</div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ dolny pasek */

const TABS = [
  { to: '/m', label: 'Dziś', Icon: IconToday, end: true, col: 1 },
  { to: '/m/plan', label: 'Plan', Icon: IconWeek, end: false, col: 2 },
  { to: '/m/ja', label: 'Ja', Icon: IconProgress, end: false, col: 4 },
] as const

/** Trzy zakładki i wyróżniony przycisk Trener pośrodku (docs/24 § 3). */
export function TabBar({ onCoach }: { onCoach: () => void }) {
  return (
    <nav className="m-tabbar" aria-label="Nawigacja główna">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className="m-tab" style={{ gridColumn: t.col === 4 ? 5 : t.col }}>
          <t.Icon size={26} />
          {t.label}
        </NavLink>
      ))}
      <button className="m-tab-coach" onClick={onCoach} aria-label="Trener">
        <span className="m-tab-coach-btn">
          <IconHeart size={26} />
        </span>
        Trener
      </button>
    </nav>
  )
}
