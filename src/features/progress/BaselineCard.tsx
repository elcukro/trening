import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BaselineEntry, type Checkin } from '@/db'
import type { RideRow } from '@/app/useRides'
import { addBaselineEntry, softDelete } from '@/db/repo'
import { BASELINE_DEFS, baselineTable, cdaFromRide, currentValues, programGoal, type BaselineMetric } from '@/engine/baseline'
import { effectiveFtp, effectiveLthr } from '@/engine/progress'
import type { Engine } from '@/app/useSettings'
import { Actions, Button, Card, CardSection, CardTitle, Field, Input, Inset, Metric, Select } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { num } from '@/lib/format'
import { fmtDayMonth, todayISO } from '@/lib/dates'
import { useT } from '@/i18n/react'

function fmt(v: number | null, decimals: number): string {
  return v == null ? '—' : num(v, decimals)
}

/**
 * Punkt wyjścia (docs/14, pkt 0): pierwszy zapis każdego miernika vs wartość bieżąca z danych aplikacji,
 * plus cel programu (`program.goal`) przeliczony na waty i FTP.
 */
export function BaselineCard({ engine, checkins, acts }: { engine: Engine; checkins: Checkin[]; acts: RideRow[] }) {
  const toast = useToast()
  const t = useT()
  const tb = t.progress.baseline
  const today = todayISO()
  const s = engine.ctx.settings
  const entries = useLiveQuery(() => db.baseline_entries.toArray(), [], [] as BaselineEntry[])
  const live = entries.filter((e) => !e.deleted_at)

  const current = useMemo(() => {
    const tests = engine.ctx.tests ?? []
    return currentValues({
      today,
      ftp: effectiveFtp(today, s.ftp_w_estimate, tests).ftp,
      lthr: effectiveLthr(today, s.lthr_bpm, tests.filter((x): x is { date: string; lthr_bpm: number } => !!x.lthr_bpm)).lthr,
      hrMaxSetting: s.hr_max_bpm,
      checkins: checkins.filter((c) => !c.deleted_at),
      rides: acts,
    })
  }, [today, s, engine.ctx.tests, checkins, acts])
  const rows = useMemo(() => baselineTable(live, current), [live, current])
  const missing = rows.filter((r) => !r.baseline && r.current != null)

  const [showForm, setShowForm] = useState(false)
  const [metric, setMetric] = useState<BaselineMetric>('ref_speed_kmh')
  const [value, setValue] = useState('')
  const [date, setDate] = useState(today)

  const totalKg = (current.weight_kg ?? s.body_weight_start_kg) + s.bike_and_kit_kg
  const refSpeed = rows.find((r) => r.def.id === 'ref_speed_kmh')
  const refPower = rows.find((r) => r.def.id === 'ref_power_w')
  const refS = refSpeed?.current ?? refSpeed?.baseline?.value ?? null
  const refP = refPower?.current ?? refPower?.baseline?.value ?? null
  const cda = refS && refP ? cdaFromRide(refS, refP, totalKg) : null
  const goal = programGoal(engine.ctx.program.goal, totalKg, s.ftp_w_goal, cda)
  const ftpNow = current.ftp_w ?? null

  async function freeze(ids: BaselineMetric[]) {
    await toast.run(
      tb.freezing,
      async () => {
        for (const id of ids) {
          const v = current[id]
          if (v == null) continue
          const src = id === 'ftp_w' || id === 'lthr_bpm' ? 'test' : id === 'weight_kg' || id === 'resting_hr' ? 'checkin' : 'strava'
          await addBaselineEntry({ date: today, metric: id, value: v, source: src })
        }
        return ids.length
      },
      (n) => tb.frozen(n, fmtDayMonth(today)),
    )
  }

  async function saveManual() {
    const v = Number(value.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return
    await toast.run(tb.savingMeasurement, () => addBaselineEntry({ date, metric, value: v, source: 'manual' }), () => tb.measurementSaved)
    setValue('')
    setShowForm(false)
  }

  return (
    <Card>
      <CardTitle
        icon="🎯"
        right={
          <Button variant="ghost" size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? t.common.close : tb.addMeasurement}
          </Button>
        }
      >
        {tb.title}
      </CardTitle>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="min-w-0 rounded-xl bg-slate-100 p-3 dark:bg-slate-900/60">
          <div className="text-2xl font-bold tabular-nums">{ftpNow ? `${ftpNow} W` : '—'}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{tb.ftpToday}</div>
        </div>
        <div className="min-w-0 rounded-xl bg-sky-50 p-3 dark:bg-sky-950/50">
          <div className="text-2xl font-bold tabular-nums">{goal.ftp} W</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{tb.ftpGoal(engine.ctx.program.goal.short)}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
        {goal.kmh != null && goal.watts != null ? (
          <>
            {tb.goalLineA(goal.kmh, num(totalKg, 0))} <b>{goal.watts} W</b> {tb.goalLineB(goal.ftp)}{' '}
            {cda ? tb.cdaFromRide(num(cda, 3)) : tb.cdaAssumed}
          </>
        ) : (
          <>{tb.programGoal(goal.label)}</>
        )}
        {ftpNow ? (goal.ftp - ftpNow > 0 ? tb.gap(goal.ftp - ftpNow, Math.round(((goal.ftp - ftpNow) / ftpNow) * 100)) : tb.gapReached) : ''}
      </p>

      {showForm && (
        <CardSection>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tb.metric} className="col-span-2">
              <Select value={metric} onChange={(e) => setMetric(e.target.value as BaselineMetric)}>
                {BASELINE_DEFS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} ({d.unit})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tb.value}>
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={BASELINE_DEFS.find((d) => d.id === metric)?.unit} />
            </Field>
            <Field label={tb.date}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{BASELINE_DEFS.find((d) => d.id === metric)?.hint}</p>
          <Actions className="mt-2">
            <Button onClick={saveManual} disabled={!value}>
              {t.common.save}
            </Button>
          </Actions>
        </CardSection>
      )}

      <CardSection>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{tb.metric}</span>
          <span className="text-right">{tb.colStart}</span>
          <span className="text-right">{tb.colNow}</span>
          <span className="w-12 text-right">Δ</span>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-700/80">
          {rows.map((r) => {
            const first = live.filter((e) => e.metric === r.def.id).toSorted((a, b) => (a.date < b.date ? -1 : 1))[0]
            return (
              <li key={r.def.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 py-1.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate" title={r.def.hint}>
                    {r.def.label}
                  </span>
                  {r.baseline && <span className="block text-xs text-slate-400 dark:text-slate-500">{tb.since(fmtDayMonth(r.baseline.date))}{r.def.goal ? ` · ${tb.goalShort(num(r.def.goal, r.def.decimals))}` : ''}</span>}
                </span>
                <span className="text-right tabular-nums">
                  {r.baseline ? (
                    <button type="button" className="rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-700" title={tb.deleteEntry} onClick={() => first && void softDelete('baseline_entries', first.id)}>
                      {fmt(r.baseline.value, r.def.decimals)}
                    </button>
                  ) : r.current != null ? (
                    <Button variant="ghost" size="sm" onClick={() => freeze([r.def.id])} ariaLabel={tb.saveAs(r.def.label)}>
                      {tb.saveShort}
                    </Button>
                  ) : (
                    '—'
                  )}
                </span>
                <span className="text-right font-medium tabular-nums">{fmt(r.current, r.def.decimals)}</span>
                <span className={`w-12 text-right tabular-nums ${r.improved == null ? 'text-slate-400' : r.improved ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {r.delta != null && r.delta !== 0 ? `${r.delta > 0 ? '+' : ''}${num(r.delta, r.def.decimals)}` : r.delta === 0 ? '0' : ''}
                </span>
              </li>
            )
          })}
        </ul>
        {missing.length > 0 && (
          <Actions className="mt-2">
            <Button variant="secondary" size="sm" onClick={() => freeze(missing.map((r) => r.def.id))}>
              {tb.saveAll(missing.length)}
            </Button>
          </Actions>
        )}
        {live.length === 0 && missing.length === 0 && (
          <Inset tone="info" className="mt-2 text-xs">
            {tb.empty(tb.addMeasurement)}
          </Inset>
        )}
      </CardSection>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        <Metric className="font-normal">{tb.footStart}</Metric>
        {tb.footRest}
      </p>
    </Card>
  )
}
