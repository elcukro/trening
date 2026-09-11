import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * Informacja zwrotna dla akcji sieciowych: pasek postępu u góry i komunikat u dołu.
 * `run` prowadzi jedną akcję od „w toku” do „gotowe” albo „błąd”, żeby nigdy nie było ciszy po kliknięciu.
 */

export type ToastKind = 'pending' | 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  /** pełna treść błędu do rozwinięcia */
  detail?: string
}

interface ToastApi {
  notify: (message: string, kind?: ToastKind, detail?: string) => number
  dismiss: (id: number) => void
  /** Wykonuje akcję, pokazując postęp i wynik. Zwraca wartość akcji albo `null` po błędzie. */
  run: <T>(pendingMessage: string, fn: () => Promise<T>, done?: (result: T) => string) => Promise<T | null>
  busy: boolean
}

const Ctx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast poza ToastProvider')
  return api
}

const TIMEOUT: Record<ToastKind, number> = { pending: 0, success: 4000, info: 5000, error: 12000 }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [busy, setBusy] = useState(0)
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    setToasts((list) => list.filter((x) => x.id !== id))
  }, [])

  const schedule = useCallback(
    (id: number, kind: ToastKind) => {
      const ms = TIMEOUT[kind]
      if (!ms) return
      const t = setTimeout(() => dismiss(id), ms)
      timers.current.set(id, t)
    },
    [dismiss],
  )

  const notify = useCallback(
    (message: string, kind: ToastKind = 'info', detail?: string) => {
      const id = nextId.current++
      setToasts((list) => [...list.filter((x) => x.kind !== 'pending' || kind === 'pending'), { id, kind, message, detail }])
      schedule(id, kind)
      return id
    },
    [schedule],
  )

  const replace = useCallback(
    (id: number, message: string, kind: ToastKind, detail?: string) => {
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, message, kind, detail } : t)))
      schedule(id, kind)
    },
    [schedule],
  )

  const run = useCallback(
    async <T,>(pendingMessage: string, fn: () => Promise<T>, done?: (result: T) => string): Promise<T | null> => {
      const id = notify(pendingMessage, 'pending')
      setBusy((n) => n + 1)
      try {
        const result = await fn()
        replace(id, done ? done(result) : 'Gotowe', 'success')
        return result
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        replace(id, 'Nie udało się', 'error', msg)
        return null
      } finally {
        setBusy((n) => n - 1)
      }
    },
    [notify, replace],
  )

  const api = useMemo<ToastApi>(() => ({ notify, dismiss, run, busy: busy > 0 }), [notify, dismiss, run, busy])

  return (
    <Ctx.Provider value={api}>
      {busy > 0 && (
        <div className="safe-top fixed inset-x-0 top-0 z-50" role="progressbar" aria-label="Trwa operacja">
          <div className="h-1 w-full overflow-hidden bg-sky-100 dark:bg-sky-950">
            <div className="h-full w-1/3 animate-[toastbar_1.1s_ease-in-out_infinite] bg-sky-500" />
          </div>
        </div>
      )}
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]" aria-live="polite">
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  )
}

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
        {toast.kind !== 'pending' && (
          <button onClick={onDismiss} aria-label="Zamknij" className="shrink-0 px-1 text-lg leading-none opacity-80">
            ×
          </button>
        )}
      </div>
    </div>
  )
}
