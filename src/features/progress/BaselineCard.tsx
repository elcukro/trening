import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BaselineEntry, type Checkin, type StravaActivity } from '@/db'
import { addBaselineEntry, softDelete } from '@/db/repo'
import { BASELINE_DEFS, baselineTable, cdaFromRide, currentValues, goalPower, type BaselineMetric } from '@/engine/baseline'
import { effectiveFtp, effectiveLthr } from '@/engine/progress'
import type { Engine } from '@/app/useSettings'
import { Actions, Button, Card, CardSection, CardTitle, Field, Input, Inset, Metric, Select } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { num } from '@/lib/format'
import { fmtDayMonth, todayISO } from '@/lib/dates'

function fmt(v: number | null, decimals: number): string {
  return v == null ? '—' : num(v, decimals)
}

/**
 * Punkt wyjścia (docs/14, pkt 0): pierwszy zapis każdego miernika vs wartość bieżąca z danych aplikacji,
 * plus cel „30 km/h przez 2–3 h” przeliczony na waty i FTP.
 */
export function BaselineCard({ engine, checkins, acts }: { engine: Engine; checkins: Checkin[]; acts: StravaActivity[] }) {
  const toast = useToast()
  const today = todayISO()
  const s = engine.ctx.settings
  const entries = useLiveQuery(() => db.baseline_entries.toArray(), [], [] as BaselineEntry[])
  const live = entries.filter((e) => !e.deleted_at)

  const current = useMemo(() => {
    const tests = engine.ctx.tests ?? []
    return currentValues({
      today,
      ftp: effectiveFtp(today, s.ftp_w_estimate, tests).ftp,
      lthr: effectiveLthr(today, s.lthr_bpm, tests.filter((t): t is { date: string; lthr_bpm: number } => !!t.lthr_bpm)).lthr,
      hrMaxSetting: s.hr_max_bpm,
      checkins: checkins.filter((c) => !c.deleted_at),
      rides: acts.filter((a) => !a.deleted_at && a.is_ride),
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
  const goal = goalPower(totalKg, 30, cda)
  const ftpNow = current.ftp_w ?? null

  async function freeze(ids: BaselineMetric[]) {
    await toast.run(
      'Zapisuję punkt wyjścia…',
      async () => {
        for (const id of ids) {
          const v = current[id]
          if (v == null) continue
          const src = id === 'ftp_w' || id === 'lthr_bpm' ? 'test' : id === 'weight_kg' || id === 'resting_hr' ? 'checkin' : 'strava'
          await addBaselineEntry({ date: today, metric: id, value: v, source: src })
        }
        return ids.length
      },
      (n) => `Zapisano ${n} mierników jako punkt wyjścia (${fmtDayMonth(today)})`,
    )
  }

  async function saveManual() {
    const v = Number(value.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return
    await toast.run('Zapisuję pomiar…', () => addBaselineEntry({ date, metric, value: v, source: 'manual' }), () => 'Pomiar zapisany')
    setValue('')
    setShowForm(false)
  }

  return (
    <Card>
      <CardTitle
        icon="🎯"
        right={
          <Button variant="ghost" size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Zamknij' : '+ Pomiar'}
          </Button>
        }
      >
        Punkt wyjścia
      </CardTitle>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="min-w-0 rounded-xl bg-slate-100 p-3 dark:bg-slate-900/60">
          <div className="text-2xl font-bold tabular-nums">{ftpNow ? `${ftpNow} W` : '—'}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">FTP dziś</div>
        </div>
        <div className="min-w-0 rounded-xl bg-sky-50 p-3 dark:bg-sky-950/50">
          <div className="text-2xl font-bold tabular-nums">{goal.ftp} W</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">FTP na 30 km/h (2–3 h)</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
        30 km/h płasko przy {num(totalKg, 0)} kg (Ty + rower) to ok. <b>{goal.watts} W</b> ciągle, czyli ~85 % FTP {goal.ftp} W.{' '}
        {cda ? `CdA ${num(cda, 3)} m² z jazdy odniesienia.` : 'CdA 0,42 m² (założenie) – wpisz jazdę odniesienia, żeby policzyć dokładniej.'}
        {ftpNow ? ` Luka: ${goal.ftp - ftpNow > 0 ? `${goal.ftp - ftpNow} W (${Math.round(((goal.ftp - ftpNow) / ftpNow) * 100)} %)` : 'cel osiągnięty'}.` : ''}
      </p>

      {showForm && (
        <CardSection>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Miernik" className="col-span-2">
              <Select value={metric} onChange={(e) => setMetric(e.target.value as BaselineMetric)}>
                {BASELINE_DEFS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} ({d.unit})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Wartość">
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={BASELINE_DEFS.find((d) => d.id === metric)?.unit} />
            </Field>
            <Field label="Data">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{BASELINE_DEFS.find((d) => d.id === metric)?.hint}</p>
          <Actions className="mt-2">
            <Button onClick={saveManual} disabled={!value}>
              Zapisz
            </Button>
          </Actions>
        </CardSection>
      )}

      <CardSection>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Miernik</span>
          <span className="text-right">start</span>
          <span className="text-right">teraz</span>
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
                  {r.baseline && <span className="block text-xs text-slate-400 dark:text-slate-500">od {fmtDayMonth(r.baseline.date)}{r.def.goal ? ` · cel ${num(r.def.goal, r.def.decimals)}` : ''}</span>}
                </span>
                <span className="text-right tabular-nums">
                  {r.baseline ? (
                    <button type="button" className="rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="Usuń ten zapis" onClick={() => first && void softDelete('baseline_entries', first.id)}>
                      {fmt(r.baseline.value, r.def.decimals)}
                    </button>
                  ) : r.current != null ? (
                    <Button variant="ghost" size="sm" onClick={() => freeze([r.def.id])} ariaLabel={`Zapisz ${r.def.label} jako punkt wyjścia`}>
                      zapisz
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
              Zapisz {missing.length} dostępnych jako punkt wyjścia
            </Button>
          </Actions>
        )}
        {live.length === 0 && missing.length === 0 && (
          <Inset tone="info" className="mt-2 text-xs">
            Dane pojawią się po teście FTP, check-inach i imporcie jazd ze Stravy. Jazdę odniesienia (20 min płasko, równo, na chwytach) wpisz przyciskiem „+ Pomiar”.
          </Inset>
        )}
      </CardSection>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        <Metric className="font-normal">Kolumna „start”</Metric> to pierwszy zapis miernika – nie zmienia się, dopóki go nie usuniesz. „Teraz” liczy się na bieżąco z testów, check-inów i jazd z ostatnich 28 dni.
      </p>
    </Card>
  )
}
