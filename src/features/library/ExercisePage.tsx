import { Link, useParams } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { Card, CardTitle, Empty, PageTitle } from '@/components/ui'

export function ExercisePage() {
  const { id = '' } = useParams()
  const engine = useEngine()
  const e = engine.ctx.program.exercises[id]
  if (!e) return <Empty>Nie ma takiego ćwiczenia.</Empty>
  return (
    <div className="space-y-3">
      <Link to="/biblioteka" className="text-sm text-sky-600">
        ‹ Biblioteka
      </Link>
      <PageTitle sub={`${e.pattern} · ${e.equipment.join(', ')}${e.per_side ? ' · na stronę' : ''}`}>{e.name}</PageTitle>
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
