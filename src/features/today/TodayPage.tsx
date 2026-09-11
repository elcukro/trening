import { Link } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { getDayPlan } from '@/engine/plan'
import { todayISO } from '@/lib/dates'
import { fmtDate } from '@/lib/dates'
import { DayView } from './DayView'
import { Card } from '@/components/ui'

export function TodayPage() {
  const engine = useEngine()
  const today = todayISO()
  const day = getDayPlan(today, engine.ctx, engine.weeks)
  if (!day) {
    const { program_start, trip_start } = engine.ctx.settings
    return (
      <Card tone="muted">
        <h1 className="text-lg font-bold">Poza kalendarzem</h1>
        <p className="mt-1 text-sm">
          Plan obejmuje dni od {fmtDate(program_start)} (tydzień 0 od 3 dni wcześniej) do {fmtDate(trip_start)}. Dziś jest {fmtDate(today)}.
        </p>
        <Link to="/wiecej/ustawienia" className="mt-3 inline-block text-sm font-semibold text-sky-600">
          Zmień daty w ustawieniach →
        </Link>
      </Card>
    )
  }
  return (
    <>
      {engine.settingsError && <p className="mb-2 rounded-lg bg-red-100 px-3 py-2 text-xs text-red-800">{engine.settingsError}</p>}
      <DayView day={day} engine={engine} />
    </>
  )
}
