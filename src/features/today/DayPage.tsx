import { Link, useParams } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { getDayPlan } from '@/engine/plan'
import { addDays, isValidISODate, mondayOf } from '@/engine/dates'
import { DayView } from './DayView'
import { Empty } from '@/components/ui'

export function DayPage() {
  const { date = '' } = useParams()
  const engine = useEngine()
  if (!isValidISODate(date)) return <Empty>Nieprawidłowa data.</Empty>
  const day = getDayPlan(date, engine.ctx, engine.weeks)
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
      {day ? <DayView day={day} engine={engine} /> : <Empty>Ten dzień jest poza planem.</Empty>}
    </>
  )
}
