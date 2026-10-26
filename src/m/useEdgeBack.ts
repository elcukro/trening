import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useLocation } from 'react-router'
import { isNative } from '@/native'

/** Pas przy lewej krawędzi, z którego zaczyna się gest „wstecz” (pt). */
const EDGE = 24

/**
 * Gest „wstecz” od lewej krawędzi (HIG, docs/27 § 3.1): ekran jedzie za palcem, po puszczeniu dalej niż 35 % szerokości
 * (albo szybkim ruchem) wraca do poprzedniego. Tylko w aplikacji iOS i w PWA z ekranu początkowego – w Safari ten gest
 * należy do przeglądarki i zadziałałby podwójnie. Ignoruje dotyk w arkuszach i czacie.
 */
export function useEdgeBack(ref: RefObject<HTMLElement | null>, onBack: (() => void) | null): void {
  const location = useLocation()
  const back = useRef(onBack)
  useLayoutEffect(() => {
    back.current = onBack
  })

  // ten sam komponent bywa użyty dla obu ekranów (np. Dziś i dzień z Planu) – po zmianie adresu zdejmujemy przesunięcie
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = ''
    el.style.transform = ''
  }, [location.key, ref])

  const enabled = !!onBack
  useEffect(() => {
    if (!enabled || !gestureAllowed()) return
    let start: { x: number; y: number; t: number } | null = null
    let locked = false
    let dx = 0
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start = null
      if (!t || e.touches.length > 1 || t.clientX > EDGE) return
      if ((e.target as Element | null)?.closest('.m-sheet, .m-chat, .m-backdrop')) return
      start = { x: t.clientX, y: t.clientY, t: performance.now() }
      locked = false
      dx = 0
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!start || !t) return
      const mx = t.clientX - start.x
      const my = t.clientY - start.y
      if (!locked) {
        // pionowy ruch to przewijanie – oddajemy go
        if (Math.abs(my) > 10 && Math.abs(my) > mx) {
          start = null
          return
        }
        if (mx < 10) return
        locked = true
      }
      e.preventDefault()
      dx = Math.max(0, mx)
      const el = ref.current
      if (el) {
        el.style.transition = 'none'
        el.style.transform = `translate3d(${dx}px, 0, 0)`
      }
    }
    const onEnd = () => {
      if (!start) return
      const el = ref.current
      const width = window.innerWidth
      const speed = dx / Math.max(1, performance.now() - start.t)
      const go = locked && (dx > width * 0.35 || (speed > 0.5 && dx > 40))
      const wasLocked = locked
      start = null
      locked = false
      if (!el || !wasLocked) return
      el.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
      el.style.transform = go ? `translate3d(${width}px, 0, 0)` : ''
      if (go) window.setTimeout(() => back.current?.(), 200)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, ref])
}

function gestureAllowed(): boolean {
  if (isNative()) return true
  const standalone = (navigator as { standalone?: boolean }).standalone === true
  return standalone || window.matchMedia('(display-mode: standalone)').matches
}
