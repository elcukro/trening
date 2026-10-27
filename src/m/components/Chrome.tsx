import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { IconChevronLeft, IconClose } from '@/ios/components/Icons'
import { useEdgeBack } from '../useEdgeBack'
import { confirmAction } from '@/native'
import { Spinner } from './Waiting'
import { t as tr } from '@/i18n'
import { useT } from '@/i18n/react'

/* ------------------------------------------------------------------ ekran z dużym tytułem */

/**
 * Ekran mobilnego v2: duży tytuł, który po przewinięciu zwija się do środka paska (jak w natywnym iOS).
 * `day` ustawia kolor dnia (`--day`) dla kart i przycisków na tym ekranie.
 */
export function Screen({ title, subtitle, back, action, day, children }: { title: string; subtitle?: ReactNode; back?: string | (() => void); action?: ReactNode; day?: { color: string; soft: string; fill?: string }; children: ReactNode }) {
  const t = useT()
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const sentinel = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  /**
   * Wstecz = poprzedni ekran z historii (z Ja, „Jutro” czy innego tygodnia wraca tam, skąd przyszliśmy – docs/27 § 3.1).
   * Adres w `back` tylko wtedy, gdy historii nie ma (wejście z powiadomienia, odświeżenie) – bez dokładania wpisu.
   */
  const goBack = back
    ? () => {
        if (typeof back === 'function') return back()
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
        if (idx > 0) navigate(-1)
        else navigate(back, { replace: true })
      }
    : null
  useEdgeBack(root, goBack)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    // przewija wewnętrzny kontener `.m-scroll`, więc obserwujemy względem niego (root), nie względem okna
    const io = new IntersectionObserver(([e]) => setScrolled(!e?.isIntersecting), { root: el.closest('.m-scroll'), rootMargin: '-1px 0px 0px 0px', threshold: 1 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={root} className="m-pb-tab m-screen" style={day ? ({ '--day': day.color, '--day-soft': day.soft, '--day-fill': day.fill ?? day.color } as React.CSSProperties) : undefined}>
      <div className="m-nav" data-scrolled={scrolled}>
        <div className="m-nav-inner">
          {back ? (
            <button className="m-nav-btn" onClick={() => goBack?.()} aria-label={t.common.back}>
              <IconChevronLeft size={22} />
            </button>
          ) : (
            <span className="w-2" />
          )}
          {/* tytuł w pasku powtarza h1 – VoiceOver czyta go raz (docs/27 § 3.3) */}
          <span className="m-nav-title" aria-hidden>{title}</span>
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

/**
 * Przycisk. `busy` = akcja w toku (docs/27 § 6): kółko aktywności i opis zamiast etykiety, drugie dotknięcie nic nie
 * robi, a przycisk nie szarzeje jak wyłączony – czekanie widać tam, gdzie zawodnik dotknął.
 */
export function Btn({ children, onClick, soft, disabled, busy, className = '', style, type = 'button' }: { children: ReactNode; onClick?: () => void; soft?: boolean; disabled?: boolean; busy?: string | false; className?: string; style?: CSSProperties; type?: 'button' | 'submit' }) {
  return (
    <button type={type} className={`m-btn ${soft ? 'm-btn-soft' : ''} ${className}`} style={style} onClick={busy ? undefined : onClick} disabled={disabled && !busy} aria-busy={busy ? true : undefined}>
      {busy ? (
        <>
          <Spinner light={!soft} />
          {busy}
        </>
      ) : (
        children
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ arkusz */

/** Czas animacji zamykania arkusza (ms) – zgodny z `.m-sheet[data-closing]` w m.css. */
const SHEET_OUT_MS = 220

/** Arkusz wraca na miejsce po zbyt krótkim przeciągnięciu albo po „Anuluj” przy niezapisanych zmianach. */
function snapBack(panel: HTMLElement | null, backdrop: HTMLElement | null) {
  if (!panel) return
  panel.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
  panel.style.transform = ''
  if (backdrop) backdrop.style.opacity = ''
}

/**
 * Arkusz od dołu jak systemowy (docs/27 § 3.1): ściąga się go palcem w dół (za uchwyt i nagłówek zawsze, za treść,
 * gdy jest przewinięta na górę), zamyka się z animacją, a przy niezapisanych zmianach (`dirty`) pyta „Odrzucić
 * zmiany?” – tło, ✕, Esc i gest nie gubią już wpisanego check-inu ani posiłku. Zapis zamyka arkusz sam (`onClose`).
 */
export function Sheet({ title, onClose, children, action, dirty = false }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode; dirty?: boolean }) {
  const tx = useT()
  const panel = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const state = useRef({ dirty, onClose, closing: false })
  useLayoutEffect(() => {
    state.current.dirty = dirty
    state.current.onClose = onClose
  })

  /** Zamknięcie z gestu, tła, ✕ albo Esc: przy zmianach najpierw pytanie, potem animacja i `onClose`. */
  const requestClose = useCallback(async () => {
    const st = state.current
    if (st.closing) return
    if (st.dirty && !(await confirmAction({ title: tr().m.chrome.discardTitle, action: tr().m.chrome.discardAction }))) {
      snapBack(panel.current, backdrop.current)
      return
    }
    st.closing = true
    setClosing(true)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => state.current.onClose(), reduce ? 0 : SHEET_OUT_MS)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void requestClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // pasek zakładek znika na czas arkusza – przy otwartej klawiaturze wjeżdżał na pola (18.10.2026)
    document.body.classList.add('m-sheet-open')
    panel.current?.focus()
    // z klawiaturą arkusz kurczy się do obszaru nad nią, ale WebKit nie przewija treści do pola – pole w drugim
    // rzędzie (np. wzrost w „Progach”) chowało się pod krawędzią (26.10.2026); przewijamy je sami po zmianie viewportu
    const vv = window.visualViewport
    let pending: HTMLElement | null = null
    const reveal = () => {
      // tylko własny przewijany obszar arkusza – scrollIntoView przesuwał też stronę pod arkuszem (Ja „uciekało” pod pasek statusu)
      const box = body.current
      if (!pending || !box || document.activeElement !== pending) return
      const f = pending.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      if (f.top >= b.top + 8 && f.bottom <= b.bottom - 8) return
      box.scrollTo({ top: box.scrollTop + (f.top - b.top) - (b.height - f.height) / 2, behavior: 'smooth' })
    }
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return
      pending = t
      window.setTimeout(reveal, 350)
    }
    const el = panel.current
    el?.addEventListener('focusin', onFocusIn)
    vv?.addEventListener('resize', reveal)

    // przeciąganie w dół: za uchwyt/nagłówek zawsze, za treść tylko od jej górnej krawędzi
    let drag: { y: number; t: number; fromBody: boolean } | null = null
    let dy = 0
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      const target = e.target as HTMLElement | null
      if (!t || !target || e.touches.length > 1 || target.closest('input, textarea, select')) return
      const inBody = !!body.current?.contains(target)
      if (inBody && (body.current?.scrollTop ?? 0) > 0) return
      drag = { y: t.clientY, t: performance.now(), fromBody: inBody }
      dy = 0
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!drag || !t || !el) return
      const d = t.clientY - drag.y
      // treść przewija się w górę normalnie; gest zaczyna się dopiero przy ruchu w dół od samej góry
      if (drag.fromBody && (d <= 0 || (body.current?.scrollTop ?? 0) > 0)) {
        if (d < -4) drag = null
        return
      }
      e.preventDefault()
      dy = Math.max(0, d)
      el.style.transition = 'none'
      el.style.transform = `translate3d(0, ${dy}px, 0)`
      if (backdrop.current) backdrop.current.style.opacity = String(Math.max(0.2, 1 - dy / (el.offsetHeight || 1)))
    }
    const onEnd = () => {
      if (!drag || !el) return
      const speed = dy / Math.max(1, performance.now() - drag.t)
      drag = null
      if (dy < 4) return
      if (dy > Math.min(160, el.offsetHeight * 0.3) || (speed > 0.5 && dy > 40)) void requestClose()
      else snapBack(el, backdrop.current)
    }
    el?.addEventListener('touchstart', onStart, { passive: true })
    el?.addEventListener('touchmove', onMove, { passive: false })
    el?.addEventListener('touchend', onEnd)
    el?.addEventListener('touchcancel', onEnd)
    return () => {
      el?.removeEventListener('focusin', onFocusIn)
      el?.removeEventListener('touchstart', onStart)
      el?.removeEventListener('touchmove', onMove)
      el?.removeEventListener('touchend', onEnd)
      el?.removeEventListener('touchcancel', onEnd)
      vv?.removeEventListener('resize', reveal)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      document.body.classList.remove('m-sheet-open')
    }
  }, [requestClose])

  return (
    <>
      <div ref={backdrop} className="m-backdrop" data-closing={closing || undefined} onClick={() => void requestClose()} />
      {/* gospodarz dopasowany do visualViewport (jak .m-chat): z klawiaturą arkusz siedzi nad nią, nie pod nią */}
      <div className="m-sheet-host">
        <div ref={panel} tabIndex={-1} className="m-sheet focus:outline-none" data-closing={closing || undefined} role="dialog" aria-modal="true" aria-label={title}>
          <div className="m-grabber" aria-hidden />
          <div className="relative flex items-center justify-between px-2 py-1">
            <button className="m-nav-btn" onClick={() => void requestClose()} aria-label={tx.common.close}>
              <IconClose size={20} />
            </button>
            {/* długi tytuł skracany wielokropkiem między przyciskami, nie pod nimi */}
            <span className="m-headline absolute left-1/2 max-w-[calc(100%-7rem)] -translate-x-1/2 truncate">{title}</span>
            <span className="min-w-11">{action}</span>
          </div>
          <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-6">{children}</div>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ dolny pasek */

const TABS = [
  { to: '/m', label: 'today', icon: '/m/art/tab-today.png', end: true },
  { to: '/m/plan', label: 'plan', icon: '/m/art/tab-plan.png', end: false },
  { to: '/m/ja', label: 'me', icon: '/m/art/tab-me.png', end: false },
] as const

/**
 * Pływająca pigułka z trzema zakładkami (ikony 3D z `public/m/art`, nieaktywne wyszarzone) i okrągły przycisk
 * Trenera z jego twarzą (docs/24 § 3). Pasek nie dotyka krawędzi ekranu – treść przewija się pod nim.
 */
export function TabBar({ onCoach }: { onCoach: () => void }) {
  const t = useT()
  return (
    <nav className="m-tabbar" aria-label={t.m.chrome.mainNav}>
      <div className="m-tabs">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="m-tab">
            <img src={tab.icon} alt="" width={26} height={26} />
            {t.m.chrome.tabs[tab.label]}
          </NavLink>
        ))}
      </div>
      <button className="m-fab" onClick={onCoach} aria-label={t.m.chrome.coach}>
        <img src="/m/art/coach-face.png" alt="" width={64} height={64} />
      </button>
    </nav>
  )
}
