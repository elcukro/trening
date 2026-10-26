import { useCallback, useRef, useState, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react'
import { haptic, isNative } from '@/native'

/**
 * Przytrzymanie (420 ms) bez ruchu palca – menu dnia w Planie (docs/24 § 4). Zwykłe dotknięcie zostaje dotknięciem.
 * Zwraca atrybuty do nałożenia na element-opakowanie; `held` do podświetlenia.
 */
export function useLongPress(onLongPress: () => void, ms = 420) {
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const [held, setHeld] = useState(false)

  const cancel = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
    start.current = null
    setHeld(false)
  }, [])

  const onPointerDown = useCallback(
    (e: RPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      // „wciśnięcie” dopiero po chwili – dotyk, który zaczyna przewijanie, nie zmniejsza wiersza (docs/27 § 3.3)
      const show = window.setTimeout(() => {
        if (start.current) setHeld(true)
      }, 150)
      timer.current = window.setTimeout(() => {
        window.clearTimeout(show)
        fired.current = true
        setHeld(false)
        if (isNative()) haptic.medium()
        else if (navigator.vibrate) navigator.vibrate(10)
        onLongPress()
      }, ms)
    },
    [onLongPress, ms],
  )
  const onPointerMove = useCallback(
    (e: RPointerEvent<HTMLElement>) => {
      if (!start.current) return
      if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) cancel()
    },
    [cancel],
  )
  /** Po przytrzymaniu zwykłe kliknięcie z tego samego dotknięcia nie ma iść dalej. */
  const onClickCapture = useCallback((e: RMouseEvent<HTMLElement>) => {
    if (fired.current) {
      e.preventDefault()
      e.stopPropagation()
      fired.current = false
    }
  }, [])
  const onContextMenu = useCallback((e: RMouseEvent<HTMLElement>) => e.preventDefault(), [])

  return { held, handlers: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel, onClickCapture, onContextMenu } }
}
