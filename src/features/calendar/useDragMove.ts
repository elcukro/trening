import { useCallback, useEffect, useRef, useState } from 'react'
import type { ISODate } from '@/engine/dates'

/**
 * Przeciąganie treningu w kalendarzu (pkt: przenoszenie jazd) – na palec i na mysz.
 *
 * Sekwencja: przytrzymanie (320 ms) „podnosi” jazdę, potem można ją przeciągnąć i upuścić na dzień wolny
 * albo puścić w miejscu i dotknąć celu (tryb `armed`) – to samo działa, gdy iOS przechwyci przeciąganie na scroll.
 * Krótkie dotknięcie zostaje zwykłym kliknięciem (wejście w dzień), a ruch palcem przed upływem 320 ms
 * traktujemy jako przewijanie i anulujemy.
 */

const HOLD_MS = 320
const MOVE_TOLERANCE_PX = 10

export interface DragMove {
  from: ISODate
  label: string
  /** pozycja „ducha” pod palcem – null, gdy trening czeka na dotknięcie celu */
  point: { x: number; y: number } | null
  /** dzień pod palcem, jeśli jest dozwolonym celem */
  over: ISODate | null
  /** true = palec puszczony, czekamy na dotknięcie dnia docelowego */
  armed: boolean
}

interface Origin {
  x: number
  y: number
  from: ISODate
  label: string
}

export function useDragMove(opts: { canDrop: (from: ISODate, to: ISODate) => boolean; onDrop: (from: ISODate, to: ISODate) => void }): {
  drag: DragMove | null
  /** podpinane do `onPointerDown` komórki z jazdą */
  onPointerDown: (e: React.PointerEvent, from: ISODate, label: string) => void
  /** kliknięcie w komórkę; zwraca true, gdy zostało obsłużone przez przenoszenie (nie nawigujemy) */
  handleClick: (date: ISODate) => boolean
  cancel: () => void
} {
  const [drag, setDrag] = useState<DragMove | null>(null)
  const dragRef = useRef<DragMove | null>(null)
  const origin = useRef<Origin | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const set = useCallback((d: DragMove | null) => {
    dragRef.current = d
    setDrag(d)
  }, [])

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    origin.current = null
    set(null)
  }, [set])

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const o = origin.current
      if (!o) return
      const moved = Math.abs(ev.clientX - o.x) > MOVE_TOLERANCE_PX || Math.abs(ev.clientY - o.y) > MOVE_TOLERANCE_PX
      if (!dragRef.current) {
        if (moved) cancel() // przewijanie, nie przeciąganie
        return
      }
      if (ev.cancelable) ev.preventDefault()
      const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-date]') as HTMLElement | null
      const date = target?.dataset.date ?? null
      const from = dragRef.current.from
      set({ ...dragRef.current, point: { x: ev.clientX, y: ev.clientY }, over: date && optsRef.current.canDrop(from, date) ? date : null })
    }
    const onUp = () => {
      const o = origin.current
      const d = dragRef.current
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      origin.current = null
      if (!d) return
      suppressClick.current = true
      setTimeout(() => {
        suppressClick.current = false
      }, 50)
      if (d.over) {
        optsRef.current.onDrop(d.from, d.over)
        set(null)
        return
      }
      // puszczone bez ruchu → zostaje „podniesione”, czeka na dotknięcie celu
      const stationary = !d.point || !o || (Math.abs(d.point.x - o.x) <= MOVE_TOLERANCE_PX && Math.abs(d.point.y - o.y) <= MOVE_TOLERANCE_PX)
      set(stationary ? { ...d, point: null, over: null, armed: true } : null)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cancel()
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKey)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [cancel, set])

  const onPointerDown = useCallback(
    (e: React.PointerEvent, from: ISODate, label: string) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (dragRef.current?.armed) return // trwa wybór celu – dotknięcie obsłuży handleClick
      const x = e.clientX
      const y = e.clientY
      origin.current = { x, y, from, label }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        navigator.vibrate?.(25)
        set({ from, label, point: { x, y }, over: null, armed: false })
      }, HOLD_MS)
    },
    [set],
  )

  const handleClick = useCallback(
    (date: ISODate) => {
      if (suppressClick.current) return true
      const d = dragRef.current
      if (!d?.armed) return false
      if (date !== d.from && optsRef.current.canDrop(d.from, date)) optsRef.current.onDrop(d.from, date)
      cancel()
      return true
    },
    [cancel],
  )

  return { drag, onPointerDown, handleClick, cancel }
}
