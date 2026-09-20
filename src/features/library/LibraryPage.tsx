import { Link } from 'react-router'
import { useMemo, useState } from 'react'
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
  const [tab, setTab] = useState<'bike' | 'gym'>('bike')
  const program = engine.ctx.program
  const lthr = engine.ctx.settings.lthr_bpm
  const workouts = useMemo(() => Object.values(program.bike_workouts).filter((w) => !['REST', 'TRIP', 'TRAVEL_REST'].includes(w.id)), [program])
  const exercises = useMemo(() => Object.values(program.exercises), [program])

  return (
    <div>
      <PageTitle>Biblioteka</PageTitle>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-700">
        {(['bike', 'gym'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`min-h-10 rounded-lg text-sm font-semibold ${tab === t ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-600 dark:text-slate-300'}`}>
            {t === 'bike' ? 'Treningi rowerowe' : 'Ćwiczenia'}
          </button>
        ))}
      </div>
      <div className="mb-3 flex gap-2 text-sm">
        <Link to="/biblioteka/strefy" className="rounded-full bg-slate-100 px-3 py-1.5 font-medium dark:bg-slate-800">
          ❤️ Strefy i testy
        </Link>
        <Link to="/biblioteka/zasady" className="rounded-full bg-slate-100 px-3 py-1.5 font-medium dark:bg-slate-800">
          📜 Zasady
        </Link>
      </div>
      {tab === 'bike' ? (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
          {workouts.map((w) => {
            const r = resolveWorkout(w, w.duration_min, lthr)
            return (
              <li key={w.id}>
                <Link to={`/biblioteka/trening/${w.id}`} className="block rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{w.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{w.parametric_duration ? `od ${minutes(w.duration_min)}` : minutes(w.duration_min)}</span>
                  </div>
                  <div className="mb-1 text-xs text-slate-500">
                    {CATEGORY_LABEL[w.category] ?? w.category} · {w.id}
                  </div>
                  <TimelineBar steps={r.steps} />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {exercises.map((e) => (
            <li key={e.id}>
              <Link to={`/biblioteka/cwiczenie/${e.id}`} className="flex min-h-12 items-center justify-between gap-2 px-4 py-2">
                <span className="text-sm font-medium">{e.name}</span>
                <span className="text-xs text-slate-500">{e.pattern}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
