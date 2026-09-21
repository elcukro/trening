import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Checkin, StravaActivity, TestResult } from '@/db'
import type { Engine } from '@/app/useSettings'
import { ftpSeries, powerCurve } from '@/engine/power'
import { Card, CardSection, CardTitle, Metric } from '@/components/ui'
import { num } from '@/lib/format'
import { fmtDayMonth, todayISO } from '@/lib/dates'

/** Krzywa mocy (MMP 28 / 90 dni) i historia FTP z W/kg – pkt 3 planu usprawnień. */
export function PowerCard({ engine, acts, tests, checkins, goalFtp }: { engine: Engine; acts: StravaActivity[]; tests: TestResult[]; checkins: Checkin[]; goalFtp: number }) {
  const today = todayISO()
  const s = engine.ctx.settings
  const curve = useMemo(() => powerCurve(acts.filter((a) => !a.deleted_at && a.is_ride), today), [acts, today])
  const hasCurve = curve.some((p) => p.all != null)
  const history = useMemo(
    () =>
      ftpSeries(
        tests,
        checkins.filter((c) => !c.deleted_at && c.weight_kg != null).map((c) => ({ date: c.date, weight_kg: c.weight_kg as number })),
        s.ftp_w_estimate,
        s.program_start,
      ),
    [tests, checkins, s],
  )
  const last = history.at(-1)!

  return (
    <Card>
      <CardTitle icon="📈" right={<Metric>{last.ftp} W{last.wkg ? ` · ${num(last.wkg, 2)} W/kg` : ''}</Metric>}>
        Moc
      </CardTitle>
      {hasCurve ? (
        <div className="h-40">
          <ResponsiveContainer>
            <BarChart data={curve.map((p) => ({ label: p.label, '28 dni': p.recent, '90 dni': p.all }))} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v} W`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="90 dni" fill="#cbd5e1" isAnimationActive={false} />
              <Bar dataKey="28 dni" fill="#0ea5e9" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Krzywa mocy (najlepsze 5 s, 1, 5, 20 i 60 min) pojawi się po pierwszej jeździe z miernikiem mocy zaimportowanej ze Stravy.</p>
      )}
      {hasCurve && (
        <ul className="mt-2 grid grid-cols-5 gap-1 text-center text-xs tabular-nums">
          {curve.map((p) => (
            <li key={p.key} className="min-w-0 rounded-lg bg-slate-100 px-1 py-1 dark:bg-slate-900/60" title={p.all_date ? `rekord 90 dni: ${fmtDayMonth(p.all_date)}` : ''}>
              <div className="font-semibold">{p.recent ?? p.all ?? '—'}</div>
              <div className="truncate text-slate-500 dark:text-slate-400">{p.label}</div>
            </li>
          ))}
        </ul>
      )}
      <CardSection>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">FTP i W/kg w czasie (cel {goalFtp} W)</p>
        {history.length >= 2 ? (
          <div className="h-36">
            <ResponsiveContainer>
              <LineChart data={history.map((p) => ({ ...p, label: fmtDayMonth(p.date) }))} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="w" domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                <YAxis yAxisId="kg" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={30} />
                <Tooltip formatter={(v, name) => (name === 'W/kg' ? num(Number(v), 2) : `${v} W`)} />
                <ReferenceLine yAxisId="w" y={goalFtp} stroke="#f59e0b" strokeDasharray="4 4" />
                <Line yAxisId="w" type="monotone" dataKey="ftp" name="FTP" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line yAxisId="kg" type="monotone" dataKey="wkg" name="W/kg" stroke="#8b5cf6" strokeWidth={1.5} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Start: {last.ftp} W (szacunek). Po pierwszym teście albo zaakceptowanej propozycji z jazdy pojawi się wykres.
          </p>
        )}
      </CardSection>
    </Card>
  )
}
