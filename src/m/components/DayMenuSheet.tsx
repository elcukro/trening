import { useState } from 'react'
import type { DayPlan } from '@/engine/plan'
import type { CalendarDay } from '@/engine/types'
import type { PlanOverrideRow } from '@/db'
import { isFreeDay, validateMove, validateSwap } from '@/engine/rules'
import type { ISODate } from '@/engine/dates'
import { fmtShort } from '@/lib/dates'
import { minutes } from '@/lib/format'
import { Sheet } from './Chrome'
import { ART, dayArt } from '../art'
import { useT } from '@/i18n/react'

export type DayAction = { kind: 'move'; to: ISODate } | { kind: 'swap'; with: ISODate } | { kind: 'skip' } | { kind: 'indoor' } | { kind: 'undo'; ids: string[] }


/**
 * Menu dnia po przytrzymaniu w Planie (docs/24 § 4): przeniesienie na dzień wolny (walidacja R15 z silnika, zabronione
 * dni wyszarzone z powodem), zamiana z dniem tego tygodnia, pominięcie, wersja pod dachem, cofnięcie zmian dnia.
 */
export function DayMenuSheet({ day, window, overrides, today, onClose, onAction }: { day: DayPlan; window: CalendarDay[]; overrides: PlanOverrideRow[]; today: ISODate; onClose: () => void; onAction: (a: DayAction) => void }) {
  const t = useT()
  const tm = t.m.dayMenu
  const [mode, setMode] = useState<'menu' | 'move' | 'swap'>('menu')
  const hasRide = !!day.bike
  const hasAny = !!day.bike
  const indoorOn = overrides.some((o) => o.kind === 'indoor')
  const canSkip = hasAny && !overrides.some((o) => o.kind === 'skip')
  const past = day.date < today

  type Check = { ok: boolean; reason?: string; warning?: string }
  const moveTargets: { d: CalendarDay; v: Check }[] = window.filter((d) => d.date !== day.date && d.date >= today && d.date.slice(0, 7) === day.date.slice(0, 7) && isFreeDay(d)).map((d) => ({ d, v: validateMove(day.date, d.date, window, { today }) }))
  const swapTargets: { d: CalendarDay; v: Check }[] = window.filter((d) => d.date !== day.date && d.week === day.week && d.date >= today).map((d) => ({ d, v: validateSwap(day.date, d.date, window) }))

  const title = `${fmtShort(day.date)} · ${day.bike?.name ?? t.m.rest}`

  if (mode === 'move' || mode === 'swap') {
    const list = mode === 'move' ? moveTargets : swapTargets
    return (
      <Sheet title={mode === 'move' ? tm.moveTo : tm.swapWith} onClose={onClose} action={<button className="m-nav-btn m-sub" onClick={() => setMode('menu')}>{t.common.back}</button>}>
        <p className="m-foot m-dim mb-3">{mode === 'move' ? tm.moveHint(day.bike?.name ?? '') : tm.swapHint(fmtShort(day.date))}</p>
        {list.length === 0 && <p className="m-sub m-dim py-4 text-center">{mode === 'move' ? tm.noMoveTargets : tm.noSwapTargets}</p>}
        <div className="m-list">
          {list.map(({ d, v }) => (
            <button key={d.date} className="m-row" disabled={!v.ok} style={!v.ok ? { opacity: 0.5 } : undefined} onClick={() => onAction(mode === 'move' ? { kind: 'move', to: d.date } : { kind: 'swap', with: d.date })}>
              <img src={d.bike ? dayArt(d.day_type, d.flags.includes('test')) : ART.rest} alt="" width={28} height={28} className="h-7 w-7 object-contain" style={!d.bike ? { opacity: 0.45 } : undefined} />
              <span className="min-w-0 flex-1">
                <span className="block">
                  {fmtShort(d.date)} · {d.bike?.name ?? t.m.rest}
                  {d.bike ? ` · ${minutes(d.bike.duration_min)}` : ''}
                </span>
                {!v.ok && <span className="m-foot block" style={{ color: 'var(--red)' }}>{v.reason}</span>}
                {v.ok && v.warning && <span className="m-foot m-dim block">{v.warning}</span>}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {overrides.length > 0 && <p className="m-foot m-dim mb-3">{tm.changes(overrides.map((o) => (tm.overrides as Record<string, string>)[o.kind] ?? o.kind).join(', '))}</p>}
      <div className="m-list">
        {hasRide && !past && (
          <button className="m-row" onClick={() => setMode('move')}>
            <span className="min-w-0 flex-1">
              <span className="block">{tm.move}</span>
              <span className="m-foot m-dim block">{tm.moveSub}</span>
            </span>
          </button>
        )}
        {hasAny && !past && (
          <button className="m-row" onClick={() => setMode('swap')}>
            <span className="min-w-0 flex-1">
              <span className="block">{tm.swap}</span>
              <span className="m-foot m-dim block">{tm.swapSub}</span>
            </span>
          </button>
        )}
        {hasRide && day.fallback_workout && !indoorOn && !past && (
          <button className="m-row" onClick={() => onAction({ kind: 'indoor' })}>
            <span className="min-w-0 flex-1">
              <span className="block">{tm.indoor}</span>
              <span className="m-foot m-dim block">{day.fallback_workout.name} · {minutes(day.fallback_workout.duration_min)}</span>
            </span>
          </button>
        )}
        {canSkip && (
          <button className="m-row" onClick={() => onAction({ kind: 'skip' })}>
            <span className="min-w-0 flex-1">
              <span className="block" style={{ color: 'var(--red)' }}>
                {tm.skip}
              </span>
              <span className="m-foot m-dim block">{tm.skipSub}</span>
            </span>
          </button>
        )}
        {overrides.length > 0 && (
          <button className="m-row" onClick={() => onAction({ kind: 'undo', ids: overrides.map((o) => o.id) })}>
            <span className="min-w-0 flex-1">
              <span className="block">{tm.undo}</span>
              <span className="m-foot m-dim block">{tm.undoSub}</span>
            </span>
          </button>
        )}
        {!hasAny && overrides.length === 0 && (
          <div className="m-row">
            <span className="m-sub m-dim">{tm.restDay}</span>
          </div>
        )}
      </div>
    </Sheet>
  )
}
