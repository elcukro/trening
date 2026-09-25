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

type Protocol = 'TEST_LTHR' | 'WATTBIKE_TEST' | 'FTP_TEST'

/** Formularz wyniku testu (R11). Na Dziś pokazywany w dniu testu, w Postępie – zawsze. */
export function TestResultForm({ date, protocol, program, previousLthr, onSaved }: { date: string; protocol: Protocol; program: Program; previousLthr: number | null; onSaved?: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({ avg_hr: '', avg_power_w: '', avg_speed_kmh: '', distance_km: '', route: '', bike: '', temp_c: '', wind: '', notes: '' })
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const avgHr = n(f.avg_hr)
  const avgPower = n(f.avg_power_w)
  // TEST_LTHR: średnie tętno z minut 10–30; FTP_TEST: średnie z ostatnich 10 min; Wattbike: 0,97 × średnia z 20 min
  const lthr = avgHr ? (protocol === 'WATTBIKE_TEST' ? Math.round(avgHr * 0.97) : Math.round(avgHr)) : null
  const ftp = protocol !== 'TEST_LTHR' && avgPower ? Math.round(avgPower * 0.95) : null
  const hasPower = protocol !== 'TEST_LTHR'
  const zones = lthr ? computeZones(program.hr_zones_lthr_fraction, lthr) : null

  async function save() {
    await toast.run(
      'Zapisuję wynik testu…',
      () => saveTestResult({ date, protocol, lthr_bpm: lthr, avg_hr: avgHr, avg_power_w: avgPower, ftp_w: ftp, avg_speed_kmh: n(f.avg_speed_kmh), distance_km: n(f.distance_km), route: f.route || null, bike: f.bike || null, temp_c: n(f.temp_c), wind: f.wind || null, notes: f.notes || null }),
      () => `Zapisano. LTHR ${lthr} bpm – nowe strefy od jutra.`,
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
        {input('avg_hr', protocol === 'WATTBIKE_TEST' ? 'Śr. tętno z 20 min' : protocol === 'FTP_TEST' ? 'Śr. tętno z ostatnich 10 min' : 'Śr. tętno z minut 10–30', 'numeric', 'np. 160')}
        {hasPower && input('avg_power_w', 'Śr. moc z 20 min (W)', 'numeric', 'np. 235')}
        {protocol !== 'WATTBIKE_TEST' && input('avg_speed_kmh', 'Śr. prędkość (km/h)', 'decimal', 'np. 31,5')}
        {protocol === 'TEST_LTHR' && input('distance_km', 'Dystans 30 min (km)', 'decimal')}
        {protocol !== 'WATTBIKE_TEST' && input('route', 'Trasa', 'text', 'ta sama co zawsze')}
        {input('bike', 'Rower', 'text', protocol === 'WATTBIKE_TEST' ? program.bikes.indoor : program.bikes.default)}
        {protocol !== 'WATTBIKE_TEST' && input('temp_c', 'Temperatura (°C)', 'decimal')}
        {protocol !== 'WATTBIKE_TEST' && input('wind', 'Wiatr', 'text', 'słaby / silny, kierunek')}
        <Field label="Notatka" className="col-span-2">
          <Input value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} />
        </Field>
      </div>
      {lthr && (
        <Inset tone="info" className="mt-3">
          <p className="tabular-nums">
            <b>LTHR = {lthr} bpm</b>
            {protocol === 'WATTBIKE_TEST' && <span className="text-xs text-slate-500 dark:text-slate-400"> (0,97 × {avgHr})</span>}
            {previousLthr && (
              <span className="ml-2 text-xs">
                poprzednio {previousLthr} ({lthr - previousLthr >= 0 ? '+' : ''}
                {lthr - previousLthr})
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
              Nowe strefy od jutra: Z2 {zones[1]!.low_bpm}–{zones[1]!.high_bpm} · SS {zones[3]!.low_bpm}–{zones[3]!.high_bpm} · THR {zones[5]!.low_bpm}–{zones[5]!.high_bpm}. Ustaw też strefy w aplikacji ELEMNT.
            </p>
          )}
        </Inset>
      )}
      {protocol === 'FTP_TEST' && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Bez miernika mocy wpisz samo tętno – zapisze się LTHR, FTP zostanie bez zmian.</p>}
      <Button onClick={save} disabled={!lthr && !ftp} className="mt-3 w-full">
        Zapisz wynik testu
      </Button>
    </div>
  )
}

export function TestResultCard({ date, protocol, program, previousLthr }: { date: string; protocol: Protocol; program: Program; previousLthr: number | null }) {
  const existing = useLiveQuery(async () => (await db.test_results.where('date').equals(date).toArray()).find((t) => !t.deleted_at), [date])
  const [edit, setEdit] = useState(false)
  return (
    <Card tone="accent">
      <CardTitle icon="🧪">Wynik testu</CardTitle>
      {existing && !edit ? <TestSummary t={existing} onEdit={() => setEdit(true)} /> : <TestResultForm date={date} protocol={protocol} program={program} previousLthr={previousLthr} onSaved={() => setEdit(false)} />}
    </Card>
  )
}

export function TestSummary({ t, onEdit }: { t: TestResult; onEdit?: () => void }) {
  return (
    <div className="text-sm">
      <p className="tabular-nums">
        {fmtDate(t.date)} · <b>LTHR {t.lthr_bpm} bpm</b>
        {t.ftp_w && <> · FTP {t.ftp_w} W</>}
        {t.avg_speed_kmh != null && <> · {num(t.avg_speed_kmh)} km/h</>}
        {t.avg_hr && <span className="text-slate-500 dark:text-slate-400"> · śr. tętno {t.avg_hr}</span>}
      </p>
      {(t.route || t.bike || t.temp_c != null) && <p className="text-xs text-slate-500 dark:text-slate-400">{[t.route, t.bike, t.temp_c != null ? `${num(t.temp_c)} °C` : null, t.wind].filter(Boolean).join(' · ')}</p>}
      {onEdit && (
        <Button variant="ghost" size="sm" onClick={onEdit} className="mt-1 -ml-3">
          Popraw
        </Button>
      )}
    </div>
  )
}
