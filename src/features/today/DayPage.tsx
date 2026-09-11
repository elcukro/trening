import { Link, useParams } from 'react-router'
import { useDayView } from '@/app/usePlan'
import { addDays, isValidISODate, mondayOf } from '@/engine/dates'
import { DayView } from './DayView'
import { Empty } from '@/components/ui'

export function DayPage() {
  const { date = '' } = useParams()
  const valid = isValidISODate(date)
  const view = useDayView(valid ? date : '2026-09-14')
  if (!valid) return <Empty>Nieprawidłowa data.</Empty>
  const { engine, day } = view
  return (
    <>
      <nav className="mb-2 flex items-center justify-between text-sm">
        <Link to={`/dzien/${addDays(date, -1)}`} className="min-h-11 py-2 font-medium text-sky-600">
          ‹ Poprzedni
        </Link>
        <Link to={`/tydzien/${mondayOf(date)}`} className="min-h-11 py-2 text-slate-500">
          Tydzień
        </Link>
        <Link to={`/dzien/${addDays(date, 1)}`} className="min-h-11 py-2 font-medium text-sky-600">
          Następny ›
        </Link>
      </nav>
      {day ? <DayView day={day} engine={engine} warnings={view.warnings} overrides={view.overrides} onAction={view.applyAction} onUndo={view.undo} /> : <Empty>Ten dzień jest poza planem.</Empty>}
    </>
  )
}
