import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Engine } from '@/app/useSettings'
import { useDailyLoad } from '@/app/useLoad'
import { buildCalendar } from '@/engine/calendar'
import { addDays, mondayOf, type ISODate } from '@/engine/dates'
import { pmcSeries, rampRate, weekTss } from '@/engine/pmc'
import { Card, CardSection, CardTitle, Inset, Metric, Row } from '@/components/ui'
import { num } from '@/lib/format'
import { fmtDayMonth } from '@/lib/dates'
import { useT } from '@/i18n/react'

const PAST_DAYS = 56
const FUTURE_DAYS = 84

/** Forma i zmęczenie (PMC): CTL/ATL/TSB z faktycznego TSS w przeszłości i planowanego w przyszłości. */
export function PmcCard({ engine }: { engine: Engine }) {
  const tp = useT().progress.pmc
  const { actual, today } = useDailyLoad(PAST_DAYS + 42)
  const days = useMemo(() => buildCalendar(engine.ctx), [engine.ctx])
  const series = useMemo(() => {
    // rozbieg 42 dni przed oknem wykresu, żeby CTL nie startowało od zera
    const warmFrom = addDays(today, -(PAST_DAYS + 42))
    const all = pmcSeries({ days, program: engine.ctx.program, actual, today, from: warmFrom, to: addDays(today, FUTURE_DAYS) })
    return all.filter((p) => p.date >= addDays(today, -PAST_DAYS))
  }, [days, engine.ctx.program, actual, today])
  const now = series.find((p) => p.date === today)
  const ramp = useMemo(() => rampRate(series, today), [series, today])
  const week = useMemo(() => weekTss(days, engine.ctx.program, actual, today, today), [days, engine.ctx.program, actual, today])
  const peak = series.filter((p) => p.future).reduce((best, p) => (p.ctl > (best?.ctl ?? -1) ? p : best), null as (typeof series)[number] | null)
  const hasData = actual.size > 0

  // rozładowania jako pasy tła
  const deloads = useMemo(() => {
    const out: { from: ISODate; to: ISODate }[] = []
    for (const p of series) {
      if (!p.deload) continue
      const monday = mondayOf(p.date)
      if (out.at(-1)?.from === monday) continue
      out.push({ from: monday, to: addDays(monday, 6) })
    }
    return out
  }, [series])

  return (
    <Card>
      <CardTitle icon="📊" right={now ? <Metric>{tp.metric(`${now.tsb > 0 ? '+' : ''}${num(now.tsb, 0)}`)}</Metric> : undefined}>
        {tp.title}
      </CardTitle>
      {!hasData ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{tp.empty}</p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer>
            <ComposedChart data={series.map((p) => ({ ...p, label: fmtDayMonth(p.date) }))} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={28} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v, name) => [num(Number(v), 0), name === 'ctl' ? tp.ctlName : name === 'atl' ? tp.atlName : name === 'tsb' ? tp.tsbName : 'TSS']}
                labelFormatter={(l) => String(l)}
              />
              {deloads.map((d) => (
                <ReferenceArea key={d.from} x1={fmtDayMonth(d.from)} x2={fmtDayMonth(d.to)} fill="#10b981" fillOpacity={0.08} />
              ))}
              <ReferenceLine x={fmtDayMonth(today)} stroke="#64748b" strokeDasharray="3 3" label={{ value: tp.today, fontSize: 10, position: 'insideTopRight' }} />
              <Area type="monotone" dataKey="load" name="load" fill="#f97316" fillOpacity={0.18} stroke="none" isAnimationActive={false} />
              <Line type="monotone" dataKey="ctl" name="ctl" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="atl" name="atl" stroke="#a855f7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="tsb" name="tsb" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {now && hasData && (
        <div className="mt-2 divide-y divide-slate-100 tabular-nums dark:divide-slate-700/80">
          <Row label={tp.ctl}>{num(now.ctl, 0)}</Row>
          <Row label={tp.atl}>{num(now.atl, 0)}</Row>
          <Row label={tp.tsb}>{now.tsb > 0 ? '+' : ''}{num(now.tsb, 0)}{now.tsb < -30 ? tp.tired : now.tsb > 15 ? tp.rested : ''}</Row>
          {ramp && <Row label={tp.ramp}>{ramp.per_week > 0 ? '+' : ''}{num(ramp.per_week, 1)}</Row>}
          {peak && <Row label={tp.peak}>{num(peak.ctl, 0)} ({fmtDayMonth(peak.date)})</Row>}
        </div>
      )}
      {ramp?.warning && (
        <Inset tone="warn" className="mt-2 text-xs">
          {ramp.warning}
        </Inset>
      )}
      <CardSection>
        <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {tp.weekA}
          <b>{week.done}</b>
          {tp.weekB(week.planned)}
        </p>
      </CardSection>
    </Card>
  )
}
