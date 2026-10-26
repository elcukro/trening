import { Link } from 'react-router'
import { Card, CardTitle, PageTitle } from '@/components/ui'
import { useEngine } from '@/app/useSettings'

import { useT } from '@/i18n/react'

export function RulesPage() {
  const { text, hierarchy, pass_strategy } = useEngine().ctx.program.rules
  const t = useT()
  const R = t.classic.rulesPage
  return (
    <div className="space-y-3">
      <Link to="/biblioteka" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
        ‹ {t.classic.library.title}
      </Link>
      <PageTitle sub={R.sub}>{R.title}</PageTitle>
      {pass_strategy && (
        <Card>
          <CardTitle icon="🏔️">{R.passStrategy}</CardTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {pass_strategy.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Card>
      )}
      <Card tone="muted">
        <CardTitle icon="🪜">{R.hierarchy}</CardTitle>
        <ol className="list-decimal space-y-0.5 pl-5 text-sm">
          {hierarchy.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </Card>
      {text.map((r) => (
        <Card key={r.id}>
          <CardTitle icon={<span className="font-mono text-xs font-semibold">{r.id}</span>}>{r.title}</CardTitle>
          <p className="text-sm">{r.text}</p>
        </Card>
      ))}
    </div>
  )
}
