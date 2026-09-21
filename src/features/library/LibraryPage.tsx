import { Link } from 'react-router'
import { useMemo, useState } from 'react'
import { useEngine } from '@/app/useSettings'
import { PageTitle, Segmented } from '@/components/ui'
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
  const [tab, setTab] = useState<'bike' | 'gym'>('bike')
  const program = engine.ctx.program
  const lthr = engine.ctx.settings.lthr_bpm
  const workouts = useMemo(() => Object.values(program.bike_workouts).filter((w) => !['REST', 'TRIP', 'TRAVEL_REST'].includes(w.id)), [program])
  const exercises = useMemo(() => Object.values(program.exercises), [program])

  return (
    <div>
      <PageTitle>Biblioteka</PageTitle>
      <Segmented
        className="mb-3 lg:max-w-md"
        label="Dział biblioteki"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bike', label: 'Treningi rowerowe' },
          { value: 'gym', label: 'Ćwiczenia' },
        ]}
      />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link to="/biblioteka/strefy" className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-3 font-medium shadow-card transition-colors hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
          ❤️ Strefy i testy
        </Link>
        <Link to="/biblioteka/zasady" className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-white px-3 font-medium shadow-card transition-colors hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
          📜 Zasady
        </Link>
      </div>
      {tab === 'bike' ? (
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
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:shadow-none xl:grid-cols-3 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800 lg:dark:bg-transparent">
          {exercises.map((e) => (
            <li key={e.id} className="lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-card lg:transition-colors lg:hover:bg-sky-50 lg:dark:border-slate-700 lg:dark:bg-slate-800 lg:dark:hover:bg-slate-700">
              <Link to={`/biblioteka/cwiczenie/${e.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-sky-50 lg:py-3 dark:hover:bg-slate-700">
                <span className="min-w-0 text-sm font-medium">{e.name}</span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{e.pattern}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
