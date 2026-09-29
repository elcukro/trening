import { useCallback, useRef, useState } from 'react'
import type { ISODate } from '@/engine/dates'
import { Button } from '@/components/ui'
import type { DragMove, DropState } from './useDragMove'

/**
 * Wspólny język przenoszenia i zamiany dni (Kalendarz, Tydzień):
 * niebieska przerywana ramka = tu można upuścić, zielona pełna = puść teraz, czerwona = tu nie można (z powodem
 * w pasku), przygaszone = niedostępne. Po upuszczeniu: komunikat z „Cofnij” i krótki błysk na zmienionych dniach.
 */
export const DROP_CLASS: Record<DropState, string> = {
  source: 'opacity-50 outline-2 outline-dashed outline-slate-400 -outline-offset-2',
  slot: 'outline-2 outline-dashed outline-sky-500 -outline-offset-2 bg-sky-50! dark:bg-sky-950/50!',
  over: 'relative z-10 scale-[1.03] outline-[3px] outline-emerald-500 -outline-offset-2 bg-emerald-100! shadow-lg dark:bg-emerald-900/60!',
  denied: 'outline-2 outline-red-400 -outline-offset-2 bg-red-50! dark:bg-red-950/40!',
  blocked: 'opacity-40 saturate-50',
}

export const FLASH_CLASS = 'animate-[dropflash_1.6s_ease-out]'

/** Dni, które właśnie się zmieniły – podświetlane na chwilę po upuszczeniu. */
export function useFlash(ms = 1600): { flashing: (date: ISODate) => boolean; flash: (...dates: ISODate[]) => void } {
  const [dates, setDates] = useState<ISODate[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = useCallback(
    (...d: ISODate[]) => {
      if (timer.current) clearTimeout(timer.current)
      setDates(d)
      timer.current = setTimeout(() => setDates([]), ms)
    },
    [ms],
  )
  const flashing = useCallback((date: ISODate) => dates.includes(date), [dates])
  return { flashing, flash }
}

const dm = (iso: ISODate) => `${Number(iso.slice(8))}.${iso.slice(5, 7)}`

/** Pasek podpowiedzi przypięty do dołu ekranu (nie przesuwa siatki w trakcie przeciągania) i „duch” pod palcem. */
export function DragBar({ drag, verb, tapHint, dropHint, overHint, onCancel }: { drag: DragMove | null; verb: string; tapHint: string; dropHint: string; overHint?: (date: ISODate) => string; onCancel: () => void }) {
  if (!drag) return null
  const tone = drag.over ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : drag.reason ? 'border-red-400 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100' : 'border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100'
  return (
    <>
      <div className="pb-nav fixed inset-x-0 bottom-2 z-40 px-4 lg:bottom-6">
        <div className={`mx-auto flex max-w-md flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-sm shadow-lg transition-colors ${tone}`} role="status">
          <span className="min-w-0 flex-1">
            {verb}: <b>{drag.label}</b>
            <span className="block text-xs">
              {drag.over ? (overHint?.(drag.over) ?? `Puść tutaj: ${dm(drag.over)}`) : drag.reason ? `Tu nie można: ${drag.reason}` : `${drag.armed ? tapHint : dropHint} (niebieska ramka).`}
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Anuluj
          </Button>
        </div>
      </div>
      {drag.point && (
        <div
          className={`pointer-events-none fixed z-50 max-w-44 truncate rounded-lg px-2 py-1 text-xs font-semibold text-white shadow-lg ${drag.over ? 'bg-emerald-600' : drag.reason ? 'bg-red-600' : 'bg-sky-600'}`}
          style={{ left: drag.point.x + 12, top: drag.point.y - 12 }}
          aria-hidden
        >
          {drag.label}
        </div>
      )}
    </>
  )
}
