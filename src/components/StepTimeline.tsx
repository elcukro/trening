import type { ResolvedStep, ResolvedWorkout } from '@/engine/types'
import { zoneColor, zoneText } from '@/lib/zones'
import { bpm, rpe, seconds } from '@/lib/format'
import { INTENSITY_LABEL } from '@/lib/labels'

/** Pasek osi czasu: szerokość ∝ czas, kolor = strefa. */
export function TimelineBar({ steps, className = '' }: { steps: ResolvedStep[]; className?: string }) {
  const total = steps.reduce((a, s) => a + s.duration_s, 0) || 1
  return (
    <div className={`flex h-6 w-full overflow-hidden rounded-lg ${className}`} role="img" aria-label="Struktura treningu">
      {steps.map((s, i) => (
        <div key={i} className={`${zoneColor(s.zone)} h-full`} style={{ width: `${(s.duration_s / total) * 100}%`, minWidth: s.duration_s > 0 ? 2 : 0 }} title={`${s.name} – ${seconds(s.duration_s)}`} />
      ))}
    </div>
  )
}

/**
 * Lista kroków: stała siatka (kropka strefy | nazwa + parametry | czas).
 * Kroki wewnątrz powtórzeń są wcięte; każdy krok pokazujemy osobno – tak samo jak na Bolcie.
 */
export function StepList({ workout, compact = false }: { workout: ResolvedWorkout; compact?: boolean }) {
  return (
    <ol className="divide-y divide-slate-100 dark:divide-slate-700/80">
      {workout.steps.map((s, i) => (
        <li key={i} className={`grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2 ${s.depth > 0 ? 'pl-3' : ''}`}>
          <span className={`mt-1.5 h-3 w-3 rounded-full ${zoneColor(s.zone)}`} aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium leading-5" title={s.name}>
              {s.name}
              {s.repeat_label && <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">({s.repeat_label})</span>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-4 text-slate-600 dark:text-slate-300">
              <span className={`font-semibold ${zoneText(s.zone)}`}>{s.zone}</span>
              {s.watts && <span className="font-semibold tabular-nums">{s.watts[0]}–{s.watts[1]} W</span>}
              <span className="tabular-nums">{s.bpm ? bpm(s.bpm) : rpe(s.rpe)}</span>
              {s.bpm && <span className="tabular-nums">{rpe(s.rpe)}</span>}
              {s.cadence_rpm && <span className="tabular-nums">{s.cadence_rpm[0]}–{s.cadence_rpm[1]} rpm</span>}
              <span className="text-slate-400 dark:text-slate-500">{INTENSITY_LABEL[s.intensity_type]}</span>
            </div>
            {!compact && s.note && <p className="mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400">{s.note}</p>}
          </div>
          <span className="pt-0.5 text-sm leading-5 tabular-nums whitespace-nowrap">{seconds(s.duration_s)}</span>
        </li>
      ))}
    </ol>
  )
}
