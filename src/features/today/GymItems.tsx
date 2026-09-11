import { Link } from 'react-router'
import type { GymSession, Program, Rx } from '@/engine/schema'

export function rxLabel(rx: Rx): string {
  const parts = [`${rx.sets}×${rx.reps}`]
  if (rx.rir !== undefined) parts.push(`RIR ${rx.rir}`)
  if (rx.rest_s) parts.push(`${rx.rest_s} s`)
  return parts.join(' · ')
}

export function GymItems({ session, program }: { session: GymSession; program: Program }) {
  return (
    <ol className="divide-y divide-slate-100 dark:divide-slate-700">
      {session.items.map((it, i) => {
        const ex = program.exercises[it.exercise]
        return (
          <li key={i} className="flex items-start gap-3 py-2">
            <span className="w-7 shrink-0 text-xs font-semibold text-slate-400">{it.block ?? ''}</span>
            <div className="min-w-0 flex-1">
              <Link to={`/biblioteka/cwiczenie/${it.exercise}`} className="text-sm font-medium">
                {ex?.name ?? it.exercise}
              </Link>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {rxLabel(it.rx)}
                {it.circuit && <span className="ml-2 text-slate-400">obwód</span>}
              </div>
              {(it.rx.note || it.rx.load_hint) && <p className="text-xs text-slate-500">{[it.rx.load_hint, it.rx.note].filter(Boolean).join(' · ')}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
