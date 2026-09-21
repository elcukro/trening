import { Link } from 'react-router'
import { Card, CardTitle, PageTitle } from '@/components/ui'
import { HIERARCHY, PASS_STRATEGY, RULES } from '@/data/rules'

export function RulesPage() {
  return (
    <div className="space-y-3">
      <Link to="/biblioteka" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
        ‹ Biblioteka
      </Link>
      <PageTitle sub="Co robić, gdy życie nie idzie zgodnie z planem">Zasady</PageTitle>
      <Card>
        <CardTitle icon="🏔️">Strategia na przełęcz</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {PASS_STRATEGY.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Card>
      <Card tone="muted">
        <CardTitle icon="🪜">Hierarchia ważności (wycinaj od dołu)</CardTitle>
        <ol className="list-decimal space-y-0.5 pl-5 text-sm">
          {HIERARCHY.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </Card>
      {RULES.map((r) => (
        <Card key={r.id}>
          <CardTitle icon={<span className="font-mono text-xs font-semibold">{r.id}</span>}>{r.title}</CardTitle>
          <p className="text-sm">{r.text}</p>
        </Card>
      ))}
    </div>
  )
}
