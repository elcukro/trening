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

export type DayAction = { kind: 'move'; to: ISODate } | { kind: 'swap'; with: ISODate } | { kind: 'skip' } | { kind: 'indoor' } | { kind: 'undo'; ids: string[] }

const OVERRIDE_LABEL: Record<string, string> = { indoor: 'pod dachem', sick: 'choroba', downgrade: 'obniżony', skip: 'pominięty', swap: 'zamieniony', move: 'przeniesiony' }

/**
 * Menu dnia po przytrzymaniu w Planie (docs/24 § 4): przeniesienie na dzień wolny (walidacja R15 z silnika, zabronione
 * dni wyszarzone z powodem), zamiana z dniem tego tygodnia, pominięcie, wersja pod dachem, cofnięcie zmian dnia.
 */
export function DayMenuSheet({ day, window, overrides, today, onClose, onAction }: { day: DayPlan; window: CalendarDay[]; overrides: PlanOverrideRow[]; today: ISODate; onClose: () => void; onAction: (a: DayAction) => void }) {
  const [mode, setMode] = useState<'menu' | 'move' | 'swap'>('menu')
  const hasRide = !!day.bike
  const hasAny = !!day.bike
  const indoorOn = overrides.some((o) => o.kind === 'indoor')
  const canSkip = hasAny && !overrides.some((o) => o.kind === 'skip')
  const past = day.date < today

  type Check = { ok: boolean; reason?: string; warning?: string }
  const moveTargets: { d: CalendarDay; v: Check }[] = window.filter((d) => d.date !== day.date && d.date >= today && d.date.slice(0, 7) === day.date.slice(0, 7) && isFreeDay(d)).map((d) => ({ d, v: validateMove(day.date, d.date, window, { today }) }))
  const swapTargets: { d: CalendarDay; v: Check }[] = window.filter((d) => d.date !== day.date && d.week === day.week && d.date >= today).map((d) => ({ d, v: validateSwap(day.date, d.date, window) }))

  const title = `${fmtShort(day.date)} · ${day.bike?.name ?? 'Wolne'}`

  if (mode === 'move' || mode === 'swap') {
    const list = mode === 'move' ? moveTargets : swapTargets
    return (
      <Sheet title={mode === 'move' ? 'Przenieś na…' : 'Zamień z…'} onClose={onClose} action={<button className="m-nav-btn m-sub" onClick={() => setMode('menu')}>Wstecz</button>}>
        <p className="m-foot m-dim mb-3">{mode === 'move' ? `„${day.bike?.name}” trafi na wybrany dzień wolny; dzisiejszy dzień zostanie wolny.` : `Zamiana treningów między ${fmtShort(day.date)} a wybranym dniem tego tygodnia.`}</p>
        {list.length === 0 && <p className="m-sub m-dim py-4 text-center">{mode === 'move' ? 'Brak wolnych dni w tym miesiącu od dziś.' : 'Brak dni do zamiany w tym tygodniu.'}</p>}
        <div className="m-list">
          {list.map(({ d, v }) => (
            <button key={d.date} className="m-row" disabled={!v.ok} style={!v.ok ? { opacity: 0.5 } : undefined} onClick={() => onAction(mode === 'move' ? { kind: 'move', to: d.date } : { kind: 'swap', with: d.date })}>
              <img src={d.bike ? dayArt(d.day_type, d.flags.includes('test')) : ART.rest} alt="" width={28} height={28} className="h-7 w-7 object-contain" style={!d.bike ? { opacity: 0.45 } : undefined} />
              <span className="min-w-0 flex-1">
                <span className="block">
                  {fmtShort(d.date)} · {d.bike?.name ?? 'Wolne'}
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
      {overrides.length > 0 && <p className="m-foot m-dim mb-3">Zmiany tego dnia: {overrides.map((o) => OVERRIDE_LABEL[o.kind] ?? o.kind).join(', ')}.</p>}
      <div className="m-list">
        {hasRide && !past && (
          <button className="m-row" onClick={() => setMode('move')}>
            <span className="min-w-0 flex-1">
              <span className="block">Przenieś na inny dzień</span>
              <span className="m-foot m-dim block">Tylko dzień wolny w tym miesiącu; reguły planu sprawdzane przy wyborze</span>
            </span>
          </button>
        )}
        {hasAny && !past && (
          <button className="m-row" onClick={() => setMode('swap')}>
            <span className="min-w-0 flex-1">
              <span className="block">Zamień z innym dniem</span>
              <span className="m-foot m-dim block">W obrębie tego tygodnia</span>
            </span>
          </button>
        )}
        {hasRide && day.fallback_workout && !indoorOn && !past && (
          <button className="m-row" onClick={() => onAction({ kind: 'indoor' })}>
            <span className="min-w-0 flex-1">
              <span className="block">Wersja pod dachem</span>
              <span className="m-foot m-dim block">{day.fallback_workout.name} · {minutes(day.fallback_workout.duration_min)}</span>
            </span>
          </button>
        )}
        {canSkip && (
          <button className="m-row" onClick={() => onAction({ kind: 'skip' })}>
            <span className="min-w-0 flex-1">
              <span className="block" style={{ color: 'var(--red)' }}>
                Pomiń ten trening
              </span>
              <span className="m-foot m-dim block">Znika z planu i z Bolta; raporty nie będą o niego pytać</span>
            </span>
          </button>
        )}
        {overrides.length > 0 && (
          <button className="m-row" onClick={() => onAction({ kind: 'undo', ids: overrides.map((o) => o.id) })}>
            <span className="min-w-0 flex-1">
              <span className="block">Cofnij zmiany tego dnia</span>
              <span className="m-foot m-dim block">Przywraca plan z programu</span>
            </span>
          </button>
        )}
        {!hasAny && overrides.length === 0 && (
          <div className="m-row">
            <span className="m-sub m-dim">Dzień wolny – nie ma czego zmieniać. Żeby coś tu przenieść, przytrzymaj dzień z jazdą.</span>
          </div>
        )}
      </div>
    </Sheet>
  )
}
