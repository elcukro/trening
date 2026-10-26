import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { IS_IOS_APP, haptic } from '@/native'
import { friendlyError } from '@/lib/errors'
import './hud.css'

/**
 * Informacja zwrotna dla akcji sieciowych. `run` prowadzi jedną akcję od „w toku” do „gotowe” albo „błąd”, żeby nigdy
 * nie było ciszy po kliknięciu.
 *
 * Dwa wyglądy (docs/27 § 6): `web` (pełna aplikacja i `/i`) – pasek postępu u góry i komunikaty u dołu; `ios` (`/m`
 * i aplikacja iOS) – jak w systemie: krótka pigułka u góry pod paskiem statusu (potwierdzenie, błąd z radą),
 * „Cofnij” w pasku nad dolną nawigacją, a czekanie na miejscu akcji (`quiet` + stan przycisku/karty) zamiast
 * globalnego komunikatu. Haptyka sukcesu/ostrzeżenia/błędu w aplikacji iOS (`src/native/haptics.ts`).
 */

export type ToastKind = 'pending' | 'success' | 'error' | 'info'
export type ToastStyle = 'web' | 'ios'

/** Przycisk w komunikacie, np. „Cofnij” po zmianie planu albo „Ponów” po błędzie sieci. */
export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  /** w wyglądzie `web` – pełna treść błędu do rozwinięcia; w `ios` – druga linia (co zrobić) */
  detail?: string
  action?: ToastAction
}

export interface RunOptions {
  /** czekanie pokazuje sam ekran (przycisk, karta) – bez komunikatu „w toku” */
  quiet?: boolean
  /** tytuł błędu, np. „Nie wysłano na Bolta” – domyślnie „Nie udało się” */
  errorTitle?: string
}

interface ToastApi {
  notify: (message: string, kind?: ToastKind, detail?: string, action?: ToastAction) => number
  dismiss: (id: number) => void
  /** Wykonuje akcję, pokazując postęp i wynik. Zwraca wartość akcji albo `null` po błędzie. */
  run: <T>(pendingMessage: string, fn: () => Promise<T>, done?: (result: T) => string, action?: (result: T) => ToastAction | undefined, opts?: RunOptions) => Promise<T | null>
  /** true, gdy trwa jakakolwiek akcja – tylko do paska postępu, nie do blokowania przycisków */
  busy: boolean
  /** wygląd komunikatów – `/m` przełącza na `ios` na czas montowania (`useToastStyle`) */
  setStyle: (s: ToastStyle) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast poza ToastProvider')
  return api
}

/** Interfejs `/m` używa komunikatów w stylu iOS, dopóki jest zamontowany. */
export function useToastStyle(style: ToastStyle) {
  const { setStyle } = useToast()
  useEffect(() => {
    setStyle(style)
    return () => setStyle(IS_IOS_APP ? 'ios' : 'web')
  }, [style, setStyle])
}

/**
 * Akcja z czekaniem na miejscu (docs/27 § 6): `pending` steruje przyciskiem albo kartą, wynik i błąd idą przez
 * `toast.run` bez komunikatu „w toku”. Drugie dotknięcie w trakcie nic nie robi.
 */
export function useAction() {
  const { run: toastRun } = useToast()
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, done?: (result: T) => string, opts?: Omit<RunOptions, 'quiet'> & { action?: (result: T) => ToastAction | undefined }): Promise<T | null> => {
      if (busy.current) return null
      busy.current = true
      setPending(true)
      try {
        return await toastRun('', fn, done, opts?.action, { ...opts, quiet: true })
      } finally {
        busy.current = false
        setPending(false)
      }
    },
    [toastRun],
  )
  return { pending, run }
}

const TIMEOUT: Record<ToastStyle, Record<ToastKind, number>> = {
  web: { pending: 0, success: 4000, info: 5000, error: 12000 },
  // iOS: potwierdzenie krótko (jak systemowa pigułka), błąd dłużej – trzeba przeczytać radę
  ios: { pending: 0, success: 2200, info: 3500, error: 7000 },
}
/** Pigułka „w toku” w stylu iOS pokazuje się dopiero po tym czasie – krótka akcja kończy się bez migania. */
const PENDING_DELAY_MS = 700

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [busy, setBusy] = useState(0)
  const [style, setStyleState] = useState<ToastStyle>(IS_IOS_APP ? 'ios' : 'web')
  // `run` czyta wygląd w chwili wywołania, nie z domknięcia
  const styleRef = useRef(style)
  const setStyle = useCallback((s: ToastStyle) => {
    styleRef.current = s
    setStyleState(s)
  }, [])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    setToasts((list) => list.filter((x) => x.id !== id))
  }, [])

  const schedule = useCallback(
    (id: number, kind: ToastKind, withAction = false) => {
      const prev = timers.current.get(id)
      if (prev) clearTimeout(prev)
      // komunikat z przyciskiem zostaje dłużej – trzeba zdążyć go przeczytać i kliknąć
      const base = TIMEOUT[styleRef.current][kind]
      const ms = withAction && base ? Math.max(base, styleRef.current === 'ios' ? 7000 : 8000) : base
      if (!ms) return
      const t = setTimeout(() => dismiss(id), ms)
      timers.current.set(id, t)
    },
    [dismiss],
  )

  const notify = useCallback(
    (message: string, kind: ToastKind = 'info', detail?: string, action?: ToastAction) => {
      const id = nextId.current++
      setToasts((list) => [...list.filter((x) => x.kind !== 'pending' || kind === 'pending'), { id, kind, message, detail, action }])
      schedule(id, kind, !!action)
      if (kind === 'success') haptic.success()
      else if (kind === 'error') haptic.error()
      return id
    },
    [schedule],
  )

  const replace = useCallback(
    (id: number, message: string, kind: ToastKind, detail?: string, action?: ToastAction) => {
      setToasts((list) => (list.some((t) => t.id === id) ? list.map((t) => (t.id === id ? { ...t, message, kind, detail, action } : t)) : [...list.filter((x) => x.kind !== 'pending'), { id, kind, message, detail, action }]))
      schedule(id, kind, !!action)
    },
    [schedule],
  )

  const runRef = useRef<ToastApi['run'] | null>(null)
  const run = useCallback(
    async <T,>(pendingMessage: string, fn: () => Promise<T>, done?: (result: T) => string, action?: (result: T) => ToastAction | undefined, opts?: RunOptions): Promise<T | null> => {
      const ios = styleRef.current === 'ios'
      const id = nextId.current++
      let shown = false
      // web: od razu; iOS: tylko bez czekania na miejscu i dopiero po chwili
      const show = () => {
        shown = true
        setToasts((list) => [...list.filter((x) => x.kind !== 'pending'), { id, kind: 'pending', message: pendingMessage }])
      }
      const delay = !opts?.quiet && pendingMessage ? (ios ? setTimeout(show, PENDING_DELAY_MS) : (show(), null)) : null
      setBusy((n) => n + 1)
      try {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Przekroczono czas oczekiwania (60 s).')), 60_000)),
        ])
        const message = done ? done(result) : 'Gotowe'
        const act = action?.(result)
        if (shown || message || act) {
          replace(id, message, 'success', undefined, act)
          haptic.success()
        }
        return result
      } catch (e) {
        const f = friendlyError(e)
        const title = opts?.errorTitle ?? 'Nie udało się'
        const retry = f.retry ? { label: 'Ponów', onClick: () => void runRef.current?.(pendingMessage, fn, done, action, opts) } : undefined
        if (ios) replace(id, title, 'error', f.message, retry)
        else replace(id, title, 'error', f.detail ? `${f.message} (${f.detail})` : f.message, retry)
        haptic.error()
        return null
      } finally {
        if (delay) clearTimeout(delay)
        setBusy((n) => n - 1)
      }
    },
    [replace],
  )
  useEffect(() => {
    runRef.current = run
  }, [run])

  const api = useMemo<ToastApi>(() => ({ notify, dismiss, run, busy: busy > 0, setStyle }), [notify, dismiss, run, busy, setStyle])

  return (
    <Ctx.Provider value={api}>
      {style === 'web' && busy > 0 && (
        <div className="safe-top fixed inset-x-0 top-0 z-50" role="progressbar" aria-label="Trwa operacja">
          <div className="h-1 w-full overflow-hidden bg-sky-100 dark:bg-sky-950">
            <div className="h-full w-1/3 animate-[toastbar_1.1s_ease-in-out_infinite] bg-sky-500" />
          </div>
        </div>
      )}
      {children}
      {style === 'ios' ? (
        <IosToasts toasts={toasts} onDismiss={dismiss} />
      ) : (
        /* nad arkuszami /m (z-50/51) – komunikat z arkusza nie może chować się pod nim (docs/27 § 3.1) */
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]" aria-live="polite">
          {toasts.map((t) => (
            <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      )}
    </Ctx.Provider>
  )
}

/* ------------------------------------------------------------------ wygląd iOS */

/**
 * Góra: jedna pigułka naraz (najnowsza) – „w toku”, potwierdzenie, błąd z radą (i „Ponów”). Dół: pasek „Cofnij”
 * nad dolną nawigacją, jak „Cofnij wysyłkę” w Poczcie. Przesunięcie palcem (w górę / w dół) albo dotknięcie zamyka.
 */
function IosToasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const undo = toasts.findLast((t) => t.action && t.kind !== 'error')
  const top = toasts.findLast((t) => t !== undo)
  return (
    <>
      <div className="hud-top" aria-live="polite">
        {top && <HudPill key={top.id} toast={top} onDismiss={() => onDismiss(top.id)} />}
      </div>
      <div className="hud-bottom" aria-live="polite">
        {undo && <UndoBar key={undo.id} toast={undo} onDismiss={() => onDismiss(undo.id)} />}
      </div>
    </>
  )
}

/** Przeciągnięcie w kierunku krawędzi zamyka komunikat (dir −1 = w górę, 1 = w dół). */
function useSwipeAway(dir: 1 | -1, onDismiss: () => void) {
  const start = useRef<number | null>(null)
  const [dy, setDy] = useState(0)
  return {
    style: dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined,
    onPointerDown: (e: ReactPointerEvent) => {
      start.current = e.clientY
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (start.current == null) return
      const d = (e.clientY - start.current) * dir
      // przechwycenie dopiero przy ruchu – samo dotknięcie „Cofnij” ma zostać zwykłym kliknięciem przycisku
      if (Math.abs(d) > 6 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId)
      setDy(d > 0 ? d * dir : (d / 4) * dir)
    },
    onPointerUp: () => {
      if (start.current == null) return
      start.current = null
      if (dy * dir > 24) onDismiss()
      else setDy(0)
    },
    onPointerCancel: () => {
      start.current = null
      setDy(0)
    },
  }
}

function HudIcon({ kind }: { kind: ToastKind }) {
  if (kind === 'pending')
    return (
      <svg viewBox="0 0 24 24" width={18} height={18} className="hud-spinner" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1="12" y1="3" x2="12" y2="7.5" transform={`rotate(${i * 45} 12 12)`} style={{ opacity: 0.25 + (i / 8) * 0.75 }} />
        ))}
      </svg>
    )
  const color = kind === 'success' ? '#34c759' : kind === 'error' ? '#ff3b30' : '#0a7aff'
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden className="hud-icon">
      <circle cx="12" cy="12" r="11" fill={color} />
      {kind === 'success' && <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === 'error' && <path d="M12 6.5v7M12 17.2v.3" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
      {kind === 'info' && <path d="M12 10.8v6M12 7v.3" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
    </svg>
  )
}

function HudPill({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const swipe = useSwipeAway(-1, onDismiss)
  const banner = toast.kind === 'error' || !!toast.detail
  return (
    <div
      className={`hud-pill ${banner ? 'hud-banner' : ''}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      {...swipe}
      onClick={toast.kind === 'pending' || toast.action ? undefined : onDismiss}
    >
      <HudIcon kind={toast.kind} />
      <div className="hud-text">
        <p className="hud-title">{toast.message}</p>
        {toast.detail && <p className="hud-detail">{toast.detail}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          className="hud-action"
          onClick={(e) => {
            e.stopPropagation()
            toast.action?.onClick()
            onDismiss()
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}

function UndoBar({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const swipe = useSwipeAway(1, onDismiss)
  return (
    <div className="hud-undo" role="status" {...swipe}>
      <HudIcon kind={toast.kind} />
      <p className="hud-title min-w-0 flex-1">{toast.message}</p>
      <button
        type="button"
        className="hud-action"
        onClick={() => {
          haptic.light()
          toast.action?.onClick()
          onDismiss()
        }}
      >
        {toast.action?.label}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ wygląd web */

const STYLE: Record<ToastKind, string> = {
  pending: 'bg-slate-800 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-sky-700 text-white',
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 shadow-lg ${STYLE[toast.kind]}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <div className="flex items-start gap-2">
        {toast.kind === 'pending' ? (
          <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
        ) : (
          <span className="shrink-0" aria-hidden>
            {toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '✕' : 'ℹ'}
          </span>
        )}
        <div className="min-w-0 flex-1 text-sm font-medium">
          {toast.message}
          {toast.detail && (
            <button onClick={() => setOpen((v) => !v)} className="ml-2 text-xs underline opacity-90">
              {open ? 'ukryj' : 'szczegóły'}
            </button>
          )}
          {open && toast.detail && <p className="mt-1 break-words text-xs font-normal opacity-90">{toast.detail}</p>}
        </div>
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick()
              onDismiss()
            }}
            className="-my-2 min-h-11 shrink-0 rounded-lg bg-white/20 px-3 text-sm font-semibold active:bg-white/30"
          >
            {toast.action.label}
          </button>
        )}
        <button onClick={onDismiss} aria-label="Zamknij" className="-my-2 -mr-2 min-h-11 min-w-11 shrink-0 text-lg leading-none opacity-80">
          ×
        </button>
      </div>
    </div>
  )
}
