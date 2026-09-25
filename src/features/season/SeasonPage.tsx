import { Link } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { seasonSummary } from '@/engine/calendar'
import { buildCalendar } from '@/engine/calendar'
import { todayISO, fmtRange, fmtDate } from '@/lib/dates'
import { hours } from '@/lib/format'
import { PHASE_COLOR, PHASE_SHORT, WEEK_TYPE_LABEL } from '@/lib/labels'
import { Badge, Card, PageTitle } from '@/components/ui'
import { useMemo } from 'react'
import type { PhaseId } from '@/engine/types'

export function SeasonPage() {
  const engine = useEngine()
  const today = todayISO()
  const { summary, weeks } = useMemo(() => {
    const days = buildCalendar(engine.ctx)
    return { summary: seasonSummary(engine.ctx, days), weeks: engine.weeks }
  }, [engine.ctx, engine.weeks])

  const phases = useMemo(() => {
    const out: { id: PhaseId; from: string; to: string; count: number }[] = []
    for (const w of weeks) {
      const last = out.at(-1)
      if (last && last.id === w.phase) {
        last.count++
        last.to = w.monday
      } else out.push({ id: w.phase, from: w.monday, to: w.monday, count: 1 })
    }
    return out
  }, [weeks])
  const total = weeks.length

  return (
    <div className="space-y-4">
      <PageTitle sub={`${fmtDate(engine.ctx.settings.program_start)} → ${engine.ctx.program.meta.target.short} ${fmtDate(engine.ctx.settings.trip_start)}`}>Sezon</PageTitle>
      <Card>
        <div className="flex h-4 w-full overflow-hidden rounded-lg">
          {phases.map((p) => (
            <div key={p.id + p.from} className={PHASE_COLOR[p.id]} style={{ width: `${(p.count / total) * 100}%` }} title={PHASE_SHORT[p.id]} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
          {phases.map((p) => (
            <li key={p.id + p.from} className="flex min-w-0 items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PHASE_COLOR[p.id]}`} />
              <span className="truncate font-medium">{PHASE_SHORT[p.id]}</span>
              <span className="shrink-0 text-slate-500 tabular-nums dark:text-slate-400">{p.count} tyg.</span>
            </li>
          ))}
        </ul>
      </Card>
      {/* tabela szersza niż telefon przewija się wewnątrz karty, nie cała strona */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-xs">
          <thead className="text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1 pr-2">Tydz.</th>
              <th className="py-1 pr-2">Daty</th>
              <th className="py-1 pr-2">Typ</th>
              <th className="py-1 pr-2 text-right">Godz.</th>
              <th className="py-1 pr-2">Akcent</th>
              <th className="py-1">Sob / Nd</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((w) => {
              const lw = weeks[w.week]!
              const current = today >= w.start && today <= w.end
              return (
                <tr key={w.week} className={`border-t border-slate-100 dark:border-slate-700/80 ${current ? 'bg-sky-50 dark:bg-sky-950/40' : ''}`}>
                  <td className="py-1.5 pr-2">
                    <Link to={`/tydzien/${lw.monday}`} className="flex items-center gap-1 font-semibold text-sky-700 tabular-nums hover:underline dark:text-sky-300">
                      <span className={`h-2 w-2 rounded-full ${PHASE_COLOR[w.phase as PhaseId]}`} />
                      {w.week}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{fmtRange(w.start, w.end)}</td>
                  <td className="py-1.5 pr-2">
                    {w.type === 'build' ? <span className="text-slate-500 dark:text-slate-400">build</span> : <Badge color={w.type === 'deload' ? 'bg-teal-600' : w.type === 'test' ? 'bg-indigo-600' : 'bg-violet-500'}>{WEEK_TYPE_LABEL[w.type as keyof typeof WEEK_TYPE_LABEL]}</Badge>}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{hours(w.bike_min)}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{w.key.join(', ')}</td>
                  <td className="py-1.5 whitespace-nowrap">
                    {w.sat ?? '—'} / {w.sun ?? '—'}
                    {w.event && (
                      <div className="max-w-56 truncate text-orange-700 dark:text-orange-400" title={w.event}>
                        {w.event}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
