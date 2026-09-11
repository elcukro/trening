import { Link, useParams } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { resolveWorkout } from '@/engine/zones'
import { StepList, TimelineBar } from '@/components/StepTimeline'
import { Card, Empty, PageTitle } from '@/components/ui'
import { minutes } from '@/lib/format'

export function WorkoutPage() {
  const { id = '' } = useParams()
  const engine = useEngine()
  const w = engine.ctx.program.bike_workouts[id]
  if (!w) return <Empty>Nie ma takiego treningu.</Empty>
  const r = resolveWorkout(w, w.duration_min, engine.ctx.settings.lthr_bpm)
  return (
    <div className="space-y-3">
      <Link to="/biblioteka" className="text-sm text-sky-600">
        ‹ Biblioteka
      </Link>
      <PageTitle sub={`${w.id} · ${w.parametric_duration ? 'czas z kalendarza, domyślnie ' : ''}${minutes(w.duration_min)}`}>{w.name}</PageTitle>
      <Card>
        <TimelineBar steps={r.steps} />
        <div className="mt-2">
          <StepList workout={r} />
        </div>
      </Card>
      <Card tone="muted">
        <p className="text-sm">{w.description}</p>
        {!engine.ctx.settings.lthr_bpm && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Cele w bpm pojawią się po wpisaniu LTHR w ustawieniach.</p>}
      </Card>
    </div>
  )
}
