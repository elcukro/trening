import { Link, useParams } from 'react-router'
import { useDayView } from '@/app/usePlan'
import { addDays, isValidISODate, mondayOf } from '@/engine/dates'
import { DayView } from './DayView'
import { Empty } from '@/components/ui'
import { useT } from '@/i18n/react'

export function DayPage() {
  const { date = '' } = useParams()
  const valid = isValidISODate(date)
  const t = useT()
  const view = useDayView(valid ? date : '2026-09-14')
  if (!valid) return <Empty>{t.classic.day.invalidDate}</Empty>
  const { engine, day } = view
  return (
    <>
      <nav className="mb-2 flex items-center justify-between text-sm" aria-label={t.classic.day.neighbours}>
        <Link to={`/dzien/${addDays(date, -1)}`} className="flex min-h-11 items-center font-medium text-sky-700 hover:underline dark:text-sky-300">
          ‹ {t.classic.day.prev}
        </Link>
        <Link to={`/tydzien/${mondayOf(date)}`} className="flex min-h-11 items-center text-slate-500 hover:underline dark:text-slate-400">
          {t.common.week}
        </Link>
        <Link to={`/dzien/${addDays(date, 1)}`} className="flex min-h-11 items-center font-medium text-sky-700 hover:underline dark:text-sky-300">
          {t.classic.day.next} ›
        </Link>
      </nav>
      {day ? <DayView day={day} engine={engine} warnings={view.warnings} overrides={view.overrides} onAction={view.applyAction} onUndo={view.undo} /> : <Empty>{t.classic.day.outOfPlan}</Empty>}
    </>
  )
}
