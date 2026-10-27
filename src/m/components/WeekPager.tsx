import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { addDays, type ISODate } from '@/engine/dates'

/**
 * Trzy tygodnie obok siebie z przyciąganiem (scroll-snap); środkowy jest bieżący. Gdy przewinięcie zatrzyma się na
 * sąsiednim panelu, zgłaszamy nowy poniedziałek, a rodzic zmienia trasę – wtedy panel wraca na środek bez animacji,
 * z identyczną treścią, więc nic nie skacze. Strzałki w nagłówku robią to samo bez gestu.
 */
/**
 * `min`/`max` – pierwszy i ostatni poniedziałek, na który wolno przejść; za granicą zamiast tygodnia jest `renderEdge`,
 * a przesunięcie wraca na bieżący panel.
 */
export function WeekPager({ monday, onChange, renderWeek, min, max, renderEdge }: { monday: ISODate; onChange: (monday: ISODate) => void; renderWeek: (monday: ISODate, current: boolean) => ReactNode; min?: ISODate; max?: ISODate; renderEdge?: (side: 'start' | 'end') => ReactNode }) {
  const prev = addDays(monday, -7)
  const next = addDays(monday, 7)
  const canPrev = !min || prev >= min
  const canNext = !max || next <= max
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const settling = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    settling.current = true
    el.scrollLeft = el.clientWidth
    const id = window.setTimeout(() => (settling.current = false), 80)
    return () => window.clearTimeout(id)
  }, [monday])

  const onScroll = () => {
    if (settling.current) return
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const el = ref.current
      if (!el || !el.clientWidth) return
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      if (idx === 0 && canPrev) onChange(prev)
      else if (idx === 2 && canNext) onChange(next)
      else if (idx !== 1) el.scrollTo({ left: el.clientWidth, behavior: 'smooth' })
    }, 120)
  }

  return (
    <div ref={ref} className="m-pager" onScroll={onScroll}>
      <div>{canPrev ? renderWeek(prev, false) : renderEdge?.('start')}</div>
      <div>{renderWeek(monday, true)}</div>
      <div>{canNext ? renderWeek(next, false) : renderEdge?.('end')}</div>
    </div>
  )
}
