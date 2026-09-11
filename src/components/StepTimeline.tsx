import type { ResolvedStep, ResolvedWorkout } from '@/engine/types'
import { zoneColor, zoneText } from '@/lib/zones'
import { bpm, rpe, seconds } from '@/lib/format'
import { INTENSITY_LABEL } from '@/lib/labels'

/** Pasek osi czasu: szerokość ∝ czas, kolor = strefa. */
export function TimelineBar({ steps }: { steps: ResolvedStep[] }) {
  const total = steps.reduce((a, s) => a + s.duration_s, 0) || 1
  return (
    <div className="flex h-6 w-full overflow-hidden rounded-md" role="img" aria-label="Struktura treningu">
      {steps.map((s, i) => (
        <div key={i} className={`${zoneColor(s.zone)} h-full`} style={{ width: `${(s.duration_s / total) * 100}%`, minWidth: s.duration_s > 0 ? 2 : 0 }} title={`${s.name} – ${seconds(s.duration_s)}`} />
      ))}
    </div>
  )
}

export function StepList({ workout, compact = false }: { workout: ResolvedWorkout; compact?: boolean }) {
  // scalamy powtórzenia o tej samej nazwie w rzędach, ale pokazujemy każdy krok – to czytelniejsze na Bolcie i w aplikacji
  return (
    <ol className="divide-y divide-slate-100 dark:divide-slate-700">
      {workout.steps.map((s, i) => (
        <li key={i} className={`flex items-start gap-3 py-2 ${s.depth > 0 ? 'pl-3' : ''}`}>
          <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${zoneColor(s.zone)}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {s.name}
                {s.repeat_label && <span className="ml-1 text-xs text-slate-500">({s.repeat_label})</span>}
              </span>
              <span className="shrink-0 text-sm tabular-nums">{seconds(s.duration_s)}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-slate-600 dark:text-slate-300">
              <span className={`font-semibold ${zoneText(s.zone)}`}>{s.zone}</span>
              <span>{s.bpm ? bpm(s.bpm) : rpe(s.rpe)}</span>
              {s.bpm && <span>{rpe(s.rpe)}</span>}
              {s.cadence_rpm && <span>{s.cadence_rpm[0]}–{s.cadence_rpm[1]} rpm</span>}
              <span className="text-slate-400">{INTENSITY_LABEL[s.intensity_type]}</span>
            </div>
            {!compact && s.note && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
