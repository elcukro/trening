import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { StravaActivity } from '@/db'
import type { CadencePolicy } from '@/engine/schema'
import { cadenceTrend, lowCadenceWarning } from '@/engine/cadence'
import { Card, CardTitle, Inset, Metric } from '@/components/ui'
import { fmtDayMonth } from '@/lib/dates'

/** Kadencja tygodniami (średnia ważona czasem z jazd ze Stravy) z celem i progiem z programu (`program.cadence`). */
export function CadenceCard({ acts, today, policy }: { acts: StravaActivity[]; today: string; policy: CadencePolicy }) {
  const trend = useMemo(() => cadenceTrend(acts.filter((a) => !a.deleted_at && a.is_ride), today, 8), [acts, today])
  const warning = useMemo(() => lowCadenceWarning(trend, policy), [trend, policy])
  const last = trend.filter((w) => w.avg_rpm != null).at(-1)
  const hasData = trend.some((w) => w.avg_rpm != null)
  return (
    <Card>
      <CardTitle icon="🔄" right={last?.avg_rpm != null ? <Metric>{last.avg_rpm} rpm</Metric> : undefined}>
        Kadencja
      </CardTitle>
      {!hasData ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Średnia kadencja tygodniami pojawi się po jazdach z czujnikiem kadencji (Bolt zapisuje ją do Stravy). Cel na płaskim: ≥ {policy.goal_rpm} rpm.</p>
      ) : (
        <div className="h-36">
          <ResponsiveContainer>
            <BarChart data={trend.map((w) => ({ label: fmtDayMonth(w.monday), rpm: w.avg_rpm }))} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis domain={[50, 100]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v} rpm`} />
              <ReferenceLine y={policy.goal_rpm} stroke="#f59e0b" strokeDasharray="4 4" />
              <Bar dataKey="rpm" name="rpm" fill="#8b5cf6" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {warning && (
        <Inset tone="warn" className="mt-2 text-xs">
          {warning}
        </Inset>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Linia = cel {policy.goal_rpm} rpm.{policy.tip ? ` ${policy.tip.charAt(0).toUpperCase()}${policy.tip.slice(1)}.` : ''}
      </p>
    </Card>
  )
}
