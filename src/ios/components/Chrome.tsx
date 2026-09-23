import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { IconChevronLeft, IconClose } from './Icons'

/* ------------------------------------------------------------------ ekran */

/**
 * Ekran z paskiem nawigacji w stylu iOS: duży tytuł zwija się do środka paska,
 * gdy strona zjedzie w dół. Tło paska pojawia się dopiero po przewinięciu.
 */
export function Screen({ title, subtitle, back, backLabel = 'Wróć', action, children }: { title: string; subtitle?: ReactNode; back?: string | (() => void); backLabel?: string; action?: ReactNode; children: ReactNode }) {
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
    <div className="ios-pb-tab">
      <div className="ios-nav" data-scrolled={scrolled}>
        <div className="ios-nav-inner">
          {back ? (
            <button className="ios-back" onClick={() => (typeof back === 'string' ? navigate(back) : back())}>
              <IconChevronLeft size={22} />
              {backLabel}
            </button>
          ) : (
            <span className="w-2" />
          )}
          <span className="ios-nav-title">{title}</span>
          <span className="ml-auto">{action}</span>
        </div>
      </div>
      <header className="px-4 pt-1 pb-2">
        <h1 className="ios-large-title">{title}</h1>
        {subtitle && <p className="ios-subhead ios-dim mt-0.5">{subtitle}</p>}
      </header>
      <div ref={sentinel} className="h-px" />
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ sekcje i listy */

export function Section({ header, footer, children, className = '' }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ios-section ${className}`}>
      {header && <h2 className="ios-section-header uppercase">{header}</h2>}
      {children}
      {footer && <p className="ios-section-footer">{footer}</p>}
    </section>
  )
}

export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ios-list ${className}`}>{children}</div>
}

/** Kolorowy kafelek ikony po lewej stronie wiersza – jak w Ustawieniach iOS. */
export function RowIcon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="ios-icon-tile" style={{ background: color }}>
      {children}
    </span>
  )
}

export function Row({ icon, title, subtitle, value, accessory, onClick, to, className = '', danger, wrap }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; value?: ReactNode; accessory?: ReactNode; onClick?: () => void; to?: string; className?: string; danger?: boolean; wrap?: boolean }) {
  const navigate = useNavigate()
  const interactive = !!(onClick || to)
  const Tag = interactive ? 'button' : 'div'
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? () => (to ? navigate(to) : onClick?.()) : undefined}
      className={`ios-row ${icon ? 'ios-row-icon' : ''} ${className}`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className={`ios-body block ${wrap ? '' : 'truncate'}`} style={danger ? { color: 'var(--red)' } : undefined}>
          {title}
        </span>
        {subtitle && <span className="ios-foot ios-dim mt-0.5 block">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="ios-body ios-dim ios-num shrink-0 text-right">{value}</span>}
      {accessory !== undefined && <span className="flex shrink-0 items-center">{accessory}</span>}
    </Tag>
  )
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={`ios-card ios-press block w-full text-left ${className}`}>
        {children}
      </button>
    )
  return <div className={`ios-card ${className}`}>{children}</div>
}

/* ------------------------------------------------------------------ przyciski */

type BtnKind = 'filled' | 'tinted' | 'gray' | 'plain'

export function Btn({ children, onClick, kind = 'filled', disabled, className = '', small, type = 'button' }: { children: ReactNode; onClick?: () => void; kind?: BtnKind; disabled?: boolean; className?: string; small?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`ios-btn ios-btn-${kind} ${small ? 'ios-btn-sm' : ''} ${className}`}>
      {children}
    </button>
  )
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="ios-seg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ arkusz */

/** Arkusz wysuwany od dołu; zamyka go tło, przycisk „Gotowe” i klawisz Escape. */
export function Sheet({ title, onClose, children, done }: { title: string; onClose: () => void; children: ReactNode; done?: { label: string; onClick: () => void; disabled?: boolean } }) {
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
      <div className="ios-backdrop" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="ios-sheet focus:outline-none" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ios-grabber" />
        <div className="ios-hairline-t relative flex items-center justify-between gap-2 px-2 py-2" style={{ boxShadow: 'none' }}>
          <button className="ios-nav-action" onClick={onClose} aria-label="Zamknij">
            <IconClose size={20} />
          </button>
          <span className="ios-headline absolute left-1/2 -translate-x-1/2">{title}</span>
          {done ? (
            <button className="ios-nav-action font-semibold disabled:opacity-40" onClick={done.onClick} disabled={done.disabled}>
              {done.label}
            </button>
          ) : (
            <span className="w-10" />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pt-2 pb-6">{children}</div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ drobiazgi */

export function Pill({ children, color = 'var(--label-2)', bg }: { children: ReactNode; color?: string; bg?: string }) {
  return (
    <span className="ios-caption inline-flex items-center rounded-full px-2 py-0.5 font-semibold" style={{ color, background: bg ?? 'var(--fill)' }}>
      {children}
    </span>
  )
}

/** Liczba z podpisem – w siatkach po 3 i po 4 kolumny musi się zmieścić bez przycinania. */
const STAT_SIZE = { lg: 'text-[24px] leading-8', md: 'text-[19px] leading-6', sm: 'text-[17px] leading-6' }

export function Stat({ value, label, unit, tone, size = 'md' }: { value: ReactNode; label: string; unit?: string; tone?: string; size?: keyof typeof STAT_SIZE }) {
  return (
    <div className="min-w-0">
      <div className={`ios-num flex items-baseline gap-0.5 font-semibold tracking-[-0.4px] ${STAT_SIZE[size]}`} style={tone ? { color: tone } : undefined}>
        <span className="truncate">{value}</span>
        {unit && <span className="ios-dim shrink-0 text-[11px] leading-4 font-medium">{unit}</span>}
      </div>
      <div className="ios-caption ios-dim truncate">{label}</div>
    </div>
  )
}
