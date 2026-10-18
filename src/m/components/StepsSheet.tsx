import type { ResolvedWorkout } from '@/engine/types'
import { zoneColor } from '@/lib/zones'
import { Sheet } from './Chrome'

const dur = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`)

/** Kroki treningu z celami – arkusz do karty dnia (pełny ekran jazdy przyjdzie w kroku 4 docs/24). */
export function StepsSheet({ workout, onClose }: { workout: ResolvedWorkout; onClose: () => void }) {
  return (
    <Sheet title={workout.name} onClose={onClose}>
      {workout.description && <p className="m-sub m-dim mb-3">{workout.description}</p>}
      <div className="m-list">
        {workout.steps.map((s, i) => (
          <div key={i} className="m-row" style={{ paddingLeft: 16 + s.depth * 14 }}>
            <span className={`h-3 w-3 shrink-0 rounded-full ${zoneColor(s.zone)}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {s.name}
                {s.repeat_label ? <span className="m-dim"> {s.repeat_label}</span> : null}
              </span>
              <span className="m-foot m-dim block">
                {s.zone}
                {s.watts ? ` · ${s.watts[0]}–${s.watts[1]} W` : ''}
                {s.bpm ? ` · ${s.bpm[0]}–${s.bpm[1]} bpm` : ''}
                {s.cadence_rpm ? ` · ${s.cadence_rpm[0]}–${s.cadence_rpm[1]} rpm` : ''}
              </span>
            </span>
            <span className="m-num m-dim shrink-0">{dur(s.duration_s)}</span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
