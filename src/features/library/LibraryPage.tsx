import { Link } from 'react-router'
import { useMemo } from 'react'
import { useEngine } from '@/app/useSettings'
import { PageTitle } from '@/components/ui'
import { minutes } from '@/lib/format'
import { TimelineBar } from '@/components/StepTimeline'
import { resolveWorkout } from '@/engine/zones'

const CATEGORY_LABEL: Record<string, string> = {
  rest: 'Odpoczynek',
  recovery: 'Regeneracja',
  endurance: 'Baza',
  long: 'Długie jazdy',
  hills: 'Pagórki',
  test: 'Testy',
  sweet_spot: 'Sweet spot',
  threshold: 'Próg',
  vo2max: 'VO2max',
  indoor: 'Pod dachem',
  climb: 'Podjazdy',
  openers: 'Pobudzenie',
  mountain: 'Góry',
  b2b: 'Back-to-back',
  trip: 'Wyjazd',
}

export function LibraryPage() {
  const engine = useEngine()
  const program = engine.ctx.program
  const lthr = engine.ctx.settings.lthr_bpm
  const workouts = useMemo(() => Object.values(program.bike_workouts).filter((w) => !['REST', 'TRIP', 'TRAVEL_REST'].includes(w.id)), [program])

  return (
    <div>
      <PageTitle>Biblioteka</PageTitle>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link to="/biblioteka/strefy" className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-3 font-medium shadow-card transition-colors hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
          ❤️ Strefy i testy
        </Link>
        <Link to="/biblioteka/zasady" className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-3 font-medium shadow-card transition-colors hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
          📜 Zasady
        </Link>
      </div>
      <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {workouts.map((w) => {
          const r = resolveWorkout(w, w.duration_min, lthr)
          return (
            <li key={w.id}>
              <Link to={`/biblioteka/trening/${w.id}`} className="block h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-colors hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold" title={w.name}>
                    {w.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">{w.parametric_duration ? `od ${minutes(w.duration_min)}` : minutes(w.duration_min)}</span>
                </div>
                <div className="mb-2 truncate text-xs text-slate-500 dark:text-slate-400">
                  {CATEGORY_LABEL[w.category] ?? w.category} · {w.id}
                </div>
                <TimelineBar steps={r.steps} />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
