import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TestResult } from '@/db'
import { saveTestResult } from '@/db/repo'
import { computeZones } from '@/engine/zones'
import type { Program } from '@/engine/schema'
import { Button, Card, CardTitle, Field, Input, Inset } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { num } from '@/lib/format'
import { fmtDate } from '@/lib/dates'
import { t as tNow } from '@/i18n'
import { useT } from '@/i18n/react'

type Protocol = 'TEST_LTHR' | 'WATTBIKE_TEST' | 'FTP_TEST'

/** Formularz wyniku testu (R11). Na Dziś pokazywany w dniu testu, w Postępie – zawsze. */
export function TestResultForm({ date, protocol, program, previousLthr, onSaved }: { date: string; protocol: Protocol; program: Program; previousLthr: number | null; onSaved?: () => void }) {
  const toast = useToast()
  const t = useT()
  const T = t.classic.test
  const [f, setF] = useState({ avg_hr: '', avg_power_w: '', avg_speed_kmh: '', distance_km: '', route: '', bike: '', temp_c: '', wind: '', notes: '' })
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const avgHr = n(f.avg_hr)
  const avgPower = n(f.avg_power_w)
  // TEST_LTHR: średnie tętno z minut 10–30 (30 min – tętno już stabilne); testy 20-minutowe (FTP_TEST, Wattbike): 0,97 × średnia z 20 min
  // – ostatnie 10 min zawyża, gdy tętno rośnie do końca (test 26.09.2026: 169 z ostatnich 10 min vs 160 z 0,97 × średnia)
  const twenty = protocol === 'WATTBIKE_TEST' || protocol === 'FTP_TEST'
  const lthr = avgHr ? (twenty ? Math.round(avgHr * 0.97) : Math.round(avgHr)) : null
  const ftp = protocol !== 'TEST_LTHR' && avgPower ? Math.round(avgPower * 0.95) : null
  const hasPower = protocol !== 'TEST_LTHR'
  const zones = lthr ? computeZones(program.hr_zones_lthr_fraction, lthr) : null

  async function save() {
    await toast.run(
      T.saving,
      () => saveTestResult({ date, protocol, lthr_bpm: lthr, avg_hr: avgHr, avg_power_w: avgPower, ftp_w: ftp, avg_speed_kmh: n(f.avg_speed_kmh), distance_km: n(f.distance_km), route: f.route || null, bike: f.bike || null, temp_c: n(f.temp_c), wind: f.wind || null, notes: f.notes || null }),
      () => tNow().classic.test.saved(lthr, ftp),
    )
    onSaved?.()
  }
  const input = (key: keyof typeof f, label: string, mode: 'numeric' | 'decimal' | 'text' = 'numeric', placeholder = '') => (
    <Field label={label}>
      <Input inputMode={mode} placeholder={placeholder} value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} />
    </Field>
  )
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {input('avg_hr', twenty ? T.avgHr20 : T.avgHr1030, 'numeric', T.eg('160'))}
        {hasPower && input('avg_power_w', T.avgPower20, 'numeric', T.eg('235'))}
        {protocol !== 'WATTBIKE_TEST' && input('avg_speed_kmh', T.avgSpeed, 'decimal', T.eg(num(31.5)))}
        {protocol === 'TEST_LTHR' && input('distance_km', T.distance30, 'decimal')}
        {protocol !== 'WATTBIKE_TEST' && input('route', T.route, 'text', T.routePlaceholder)}
        {input('bike', T.bike, 'text', protocol === 'WATTBIKE_TEST' ? program.bikes.indoor : program.bikes.default)}
        {protocol !== 'WATTBIKE_TEST' && input('temp_c', T.temp, 'decimal')}
        {protocol !== 'WATTBIKE_TEST' && input('wind', T.wind, 'text', T.windPlaceholder)}
        <Field label={T.note} className="col-span-2">
          <Input value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} />
        </Field>
      </div>
      {lthr && (
        <Inset tone="info" className="mt-3">
          <p className="tabular-nums">
            <b>LTHR = {lthr} bpm</b>
            {twenty && <span className="text-xs text-slate-500 dark:text-slate-400"> ({num(0.97, 2)} × {avgHr})</span>}
            {previousLthr && (
              <span className="ml-2 text-xs">
                {T.previous(previousLthr, lthr - previousLthr)}
              </span>
            )}
            {ftp && (
              <span className="ml-2">
                <b>FTP = {ftp} W</b>
              </span>
            )}
          </p>
          {zones && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {T.newZones(`Z2 ${zones[1]!.low_bpm}–${zones[1]!.high_bpm} · SS ${zones[3]!.low_bpm}–${zones[3]!.high_bpm} · THR ${zones[5]!.low_bpm}–${zones[5]!.high_bpm}`)}
            </p>
          )}
        </Inset>
      )}
      {protocol === 'FTP_TEST' && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{T.noPowerHint}</p>}
      <Button onClick={save} disabled={!lthr && !ftp} className="mt-3 w-full">
        {T.save}
      </Button>
    </div>
  )
}

export function TestResultCard({ date, protocol, program, previousLthr }: { date: string; protocol: Protocol; program: Program; previousLthr: number | null }) {
  const existing = useLiveQuery(async () => (await db.test_results.where('date').equals(date).toArray()).find((t) => !t.deleted_at), [date])
  const [edit, setEdit] = useState(false)
  const t = useT()
  return (
    <Card tone="accent">
      <CardTitle icon="🧪">{t.classic.test.title}</CardTitle>
      {existing && !edit ? <TestSummary t={existing} onEdit={() => setEdit(true)} /> : <TestResultForm date={date} protocol={protocol} program={program} previousLthr={previousLthr} onSaved={() => setEdit(false)} />}
    </Card>
  )
}

export function TestSummary({ t, onEdit }: { t: TestResult; onEdit?: () => void }) {
  const tr = useT()
  return (
    <div className="text-sm">
      <p className="tabular-nums">
        {fmtDate(t.date)} · <b>LTHR {t.lthr_bpm} bpm</b>
        {t.ftp_w && <> · FTP {t.ftp_w} W</>}
        {t.avg_speed_kmh != null && <> · {num(t.avg_speed_kmh)} km/h</>}
        {t.avg_hr && <span className="text-slate-500 dark:text-slate-400"> · {tr.classic.test.avgHrShort(t.avg_hr)}</span>}
      </p>
      {(t.route || t.bike || t.temp_c != null) && <p className="text-xs text-slate-500 dark:text-slate-400">{[t.route, t.bike, t.temp_c != null ? `${num(t.temp_c)} °C` : null, t.wind].filter(Boolean).join(' · ')}</p>}
      {onEdit && (
        <Button variant="ghost" size="sm" onClick={onEdit} className="mt-1 -ml-3">
          {tr.classic.test.fix}
        </Button>
      )}
    </div>
  )
}
