import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { addDays, type ISODate } from '@/engine/dates'

/**
 * Trzy tygodnie obok siebie z przyciąganiem (scroll-snap); środkowy jest bieżący. Gdy przewinięcie zatrzyma się na
 * sąsiednim panelu, zgłaszamy nowy poniedziałek, a rodzic zmienia trasę – wtedy panel wraca na środek bez animacji,
 * z identyczną treścią, więc nic nie skacze. Strzałki w nagłówku robią to samo bez gestu.
 */
export function WeekPager({ monday, onChange, renderWeek }: { monday: ISODate; onChange: (monday: ISODate) => void; renderWeek: (monday: ISODate, current: boolean) => ReactNode }) {
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
      if (idx === 0) onChange(addDays(monday, -7))
      else if (idx === 2) onChange(addDays(monday, 7))
    }, 120)
  }

  return (
    <div ref={ref} className="m-pager" onScroll={onScroll}>
      <div>{renderWeek(addDays(monday, -7), false)}</div>
      <div>{renderWeek(monday, true)}</div>
      <div>{renderWeek(addDays(monday, 7), false)}</div>
    </div>
  )
}
