import { Link, useParams } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { resolveWorkout } from '@/engine/zones'
import { StepList, TimelineBar } from '@/components/StepTimeline'
import { Card, Empty, PageTitle } from '@/components/ui'
import { minutes } from '@/lib/format'

import { useT } from '@/i18n/react'

export function WorkoutPage() {
  const { id = '' } = useParams()
  const engine = useEngine()
  const t = useT()
  const L = t.classic.library
  const w = engine.ctx.program.bike_workouts[id]
  if (!w) return <Empty>{L.noWorkout}</Empty>
  const r = resolveWorkout(w, w.duration_min, engine.ctx.settings.lthr_bpm)
  return (
    <div className="space-y-3">
      <Link to="/biblioteka" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
        ‹ {L.title}
      </Link>
      <PageTitle sub={`${w.id} · ${w.parametric_duration ? L.parametric(minutes(w.duration_min)) : minutes(w.duration_min)}`}>{w.name}</PageTitle>
      <Card>
        <TimelineBar steps={r.steps} />
        <div className="mt-2">
          <StepList workout={r} />
        </div>
      </Card>
      <Card tone="muted">
        <p className="text-sm">{w.description}</p>
        {!engine.ctx.settings.lthr_bpm && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{L.needLthr}</p>}
      </Card>
    </div>
  )
}
