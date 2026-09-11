import type { PlanOverrideRow } from '@/db'
import type { RuleAction, RuleWarning } from '@/engine/rules'
import { Badge, Card, CardTitle } from '@/components/ui'

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
              <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] dark:bg-slate-700">{w.rule}</span>
              {w.message}
            </p>
            {w.actions && w.actions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {w.actions.map((a, j) => (
                  <button key={j} onClick={() => onAction(a)} className="min-h-10 rounded-lg bg-white px-3 text-sm font-semibold text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300">
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {overrides.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 dark:border-slate-600">
          <span className="text-xs text-slate-500">Zmiany na dziś:</span>
          {overrides.map((o) => (
            <span key={o.id} className="inline-flex items-center gap-1">
              <Badge color="bg-sky-600">{OVERRIDE_LABEL[o.kind]}</Badge>
              <button onClick={() => onUndo(o.id)} aria-label="Cofnij zmianę" className="min-h-9 px-1 text-xs text-slate-500 underline">
                cofnij
              </button>
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}
