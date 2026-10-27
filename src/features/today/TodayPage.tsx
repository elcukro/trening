import { Link } from 'react-router'
import { useDayView } from '@/app/usePlan'
import { todayISO } from '@/lib/dates'
import { fmtDate } from '@/lib/dates'
import { DayView } from './DayView'
import { Card, Inset } from '@/components/ui'
import { useT } from '@/i18n/react'

export function TodayPage() {
  const today = todayISO()
  const view = useDayView(today)
  const t = useT()
  const { engine, day } = view
  if (!day) {
    const { program_start, trip_start } = engine.ctx.settings
    return (
      <Card tone="muted">
        <h1 className="text-lg font-bold">{t.classic.today.outTitle}</h1>
        <p className="mt-1 text-sm">
          {t.classic.today.outText(fmtDate(program_start), fmtDate(trip_start), engine.ctx.program.layout?.mode !== 'fixed', fmtDate(today))}
        </p>
        <Link to="/wiecej/ustawienia" className="mt-3 inline-block text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
          {t.classic.today.changeDates} →
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
