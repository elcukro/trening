import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useEngine } from '@/app/useSettings'
import { exerciseHistory } from '@/db/repo'
import { detectPlateau, sessionBestE1rm } from '@/engine/load'
import { Card, CardTitle, Empty, Inset, PageTitle } from '@/components/ui'
import { num } from '@/lib/format'
import { fmtDayMonth } from '@/lib/dates'
import { ExerciseMedia } from './ExerciseMedia'

export function ExercisePage() {
  const { id = '' } = useParams()
  const engine = useEngine()
  const e = engine.ctx.program.exercises[id]
  const history = useLiveQuery(() => exerciseHistory(id), [id], [] as Awaited<ReturnType<typeof exerciseHistory>>)
  const series = useMemo(() => history.map((h) => ({ date: h.date, e1rm: Math.round(sessionBestE1rm(h.sets)) })).filter((p) => p.e1rm > 0), [history])
  const plateau = useMemo(() => detectPlateau(history, null), [history])
  if (!e) return <Empty>Nie ma takiego ćwiczenia.</Empty>
  return (
    <div className="space-y-3">
      <Link to="/biblioteka" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
        ‹ Biblioteka
      </Link>
      <PageTitle sub={`${e.pattern} · ${e.equipment.join(', ')}${e.per_side ? ' · na stronę' : ''}`}>{e.name}</PageTitle>
      <Card>
        <ExerciseMedia exerciseId={e.id} name={e.name} />
      </Card>
      <Card>
        <CardTitle icon="🎯">Technika</CardTitle>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {e.cues.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </Card>
      <Card tone="accent">
        <CardTitle icon="💡">Po co</CardTitle>
        <p className="text-sm">{e.why}</p>
      </Card>
      {series.length > 0 && (
        <Card>
          <CardTitle icon="📈">Twoje wyniki (e1RM)</CardTitle>
          {series.length >= 2 ? (
            <div className="h-28">
              <ResponsiveContainer>
                <LineChart data={series.map((p) => ({ ...p, label: fmtDayMonth(p.date) }))} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} minTickGap={20} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v) => `${v} kg`} />
                  <Line type="monotone" dataKey="e1rm" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm tabular-nums">Ostatnio: e1RM {num(series[0]!.e1rm, 0)} kg ({fmtDayMonth(series[0]!.date)}).</p>
          )}
          {plateau && (
            <Inset tone="warn" className="mt-2 text-xs">
              {plateau.message}
            </Inset>
          )}
        </Card>
      )}
      {e.alternatives.length > 0 && (
        <Card tone="muted">
          <CardTitle icon="🔁">Zamienniki</CardTitle>
          <ul className="list-disc pl-5 text-sm">
            {e.alternatives.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
