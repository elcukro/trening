import { Link } from 'react-router'
import type { GymSession, Program, Rx } from '@/engine/schema'

export function rxLabel(rx: Rx): string {
  const parts = [`${rx.sets}×${rx.reps}`]
  if (rx.rir !== undefined) parts.push(`RIR ${rx.rir}`)
  if (rx.rest_s) parts.push(`${rx.rest_s} s`)
  return parts.join(' · ')
}

/** Numer bloku w kółku o stałym rozmiarze; pusty blok (rozgrzewka, schłodzenie) – szare kółko. */
export function BlockBubble({ block }: { block?: string }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${block ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200' : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`}
      aria-hidden={!block}
    >
      {block ?? '·'}
    </span>
  )
}

/** Lista ćwiczeń sesji: stała siatka (blok | nazwa, preskrypcja, uwagi). */
export function GymItems({ session, program }: { session: GymSession; program: Program }) {
  return (
    <ol className="divide-y divide-slate-100 dark:divide-slate-700/80">
      {session.items.map((it, i) => {
        const ex = program.exercises[it.exercise]
        const hint = [it.rx.load_hint, it.rx.note].filter(Boolean).join(' · ')
        return (
          <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 py-2">
            <BlockBubble block={it.block} />
            <div className="min-w-0">
              <Link to={`/biblioteka/cwiczenie/${it.exercise}`} className="block text-sm font-medium leading-5 hover:text-sky-700 dark:hover:text-sky-300">
                {ex?.name ?? it.exercise}
              </Link>
              <div className="flex flex-wrap items-center gap-x-2 text-xs leading-4 text-slate-600 tabular-nums dark:text-slate-300">
                <span>{rxLabel(it.rx)}</span>
                {it.circuit && <span className="rounded bg-slate-100 px-1 text-slate-500 dark:bg-slate-700 dark:text-slate-400">obwód</span>}
              </div>
              {hint && <p className="mt-0.5 text-xs leading-4 text-slate-500 dark:text-slate-400">{hint}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
