import { Link } from 'react-router'
import { useDayView } from '@/app/usePlan'
import { todayISO } from '@/lib/dates'
import { fmtDate } from '@/lib/dates'
import { DayView } from './DayView'
import { Card, Inset } from '@/components/ui'

export function TodayPage() {
  const today = todayISO()
  const view = useDayView(today)
  const { engine, day } = view
  if (!day) {
    const { program_start, trip_start } = engine.ctx.settings
    return (
      <Card tone="muted">
        <h1 className="text-lg font-bold">Poza kalendarzem</h1>
        <p className="mt-1 text-sm">
          Plan obejmuje dni od {fmtDate(program_start)}{engine.ctx.program.layout?.mode === 'fixed' ? '' : ' (tydzień 0 od 3 dni wcześniej)'} do {fmtDate(trip_start)}. Dziś jest {fmtDate(today)}.
        </p>
        <Link to="/wiecej/ustawienia" className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
          Zmień daty w ustawieniach →
        </Link>
      </Card>
    )
  }
  return (
    <>
      {engine.settingsError && (
        <Inset tone="error" className="mb-2 text-xs">
          {engine.settingsError}
        </Inset>
      )}
      <DayView day={day} engine={engine} warnings={view.warnings} overrides={view.overrides} onAction={view.applyAction} onUndo={view.undo} />
    </>
  )
}
