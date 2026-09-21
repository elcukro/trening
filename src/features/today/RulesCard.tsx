import type { PlanOverrideRow } from '@/db'
import type { RuleAction, RuleWarning } from '@/engine/rules'
import { Badge, Button, Card, CardSection, CardTitle } from '@/components/ui'

const OVERRIDE_LABEL: Record<PlanOverrideRow['kind'], string> = {
  indoor: 'Pod dachem',
  sick: 'Choroba',
  downgrade: 'Dzień obniżony',
  skip: 'Pominięte',
  swap: 'Zamiana dni',
  move: 'Przeniesione',
}

/** Ostrzeżenia reguł z propozycjami działań oraz lista nałożonych zmian (do cofnięcia). */
export function RulesCard({ warnings, overrides, onAction, onUndo }: { warnings: RuleWarning[]; overrides: PlanOverrideRow[]; onAction: (a: RuleAction) => void; onUndo: (id: string) => void }) {
  if (warnings.length === 0 && overrides.length === 0) return null
  const worst = warnings.some((w) => w.severity === 'warn') ? 'warn' : 'muted'
  return (
    <Card tone={worst === 'warn' ? 'warn' : 'muted'}>
      <CardTitle icon={worst === 'warn' ? '⚠️' : 'ℹ️'}>Zasady na dziś</CardTitle>
      <ul className="space-y-3">
        {warnings.map((w, i) => (
          <li key={`${w.rule}-${i}`}>
            <p className="text-sm">
              <span className="mr-2 inline-block rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs leading-4 text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">{w.rule}</span>
              {w.message}
            </p>
            {w.actions && w.actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {w.actions.map((a, j) => (
                  <Button key={j} variant="secondary" size="sm" onClick={() => onAction(a)} className="whitespace-normal text-left">
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {overrides.length > 0 && (
        <CardSection className="flex flex-wrap items-center gap-2 border-amber-200/70 dark:border-amber-900/60">
          <span className="text-xs text-slate-500 dark:text-slate-400">Zmiany na dziś:</span>
          {overrides.map((o) => (
            <span key={o.id} className="inline-flex items-center gap-1">
              <Badge color="bg-sky-600">{OVERRIDE_LABEL[o.kind]}</Badge>
              <button onClick={() => onUndo(o.id)} aria-label="Cofnij zmianę" className="min-h-9 px-1 text-xs text-slate-500 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                cofnij
              </button>
            </span>
          ))}
        </CardSection>
      )}
    </Card>
  )
}
