import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TestResult } from '@/db'
import { saveTestResult } from '@/db/repo'
import { computeZones } from '@/engine/zones'
import type { Program } from '@/engine/schema'
import { Button, Card, CardTitle } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { num } from '@/lib/format'
import { fmtDate } from '@/lib/dates'

type Protocol = 'TEST_LTHR' | 'WATTBIKE_TEST'

/** Formularz wyniku testu (R11). Na Dziś pokazywany w dniu testu, w Postępie – zawsze. */
export function TestResultForm({ date, protocol, program, previousLthr, onSaved }: { date: string; protocol: Protocol; program: Program; previousLthr: number | null; onSaved?: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({ avg_hr: '', avg_power_w: '', avg_speed_kmh: '', distance_km: '', route: '', bike: '', temp_c: '', wind: '', notes: '' })
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const avgHr = n(f.avg_hr)
  const avgPower = n(f.avg_power_w)
  const lthr = avgHr ? (protocol === 'WATTBIKE_TEST' ? Math.round(avgHr * 0.97) : Math.round(avgHr)) : null
  const ftp = protocol === 'WATTBIKE_TEST' && avgPower ? Math.round(avgPower * 0.95) : null
  const zones = lthr ? computeZones(program.hr_zones_lthr_fraction, lthr) : null

  async function save() {
    await toast.run('Zapisuję wynik testu…', () => saveTestResult({ date, protocol, lthr_bpm: lthr, avg_hr: avgHr, avg_power_w: avgPower, ftp_w: ftp, avg_speed_kmh: n(f.avg_speed_kmh), distance_km: n(f.distance_km), route: f.route || null, bike: f.bike || null, temp_c: n(f.temp_c), wind: f.wind || null, notes: f.notes || null }), () => `Zapisano. LTHR ${lthr} bpm – nowe strefy od jutra.`)
    onSaved?.()
  }
  const input = (key: keyof typeof f, label: string, mode: 'numeric' | 'decimal' | 'text' = 'numeric', placeholder = '') => (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900" inputMode={mode} placeholder={placeholder} value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} />
    </label>
  )
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {input('avg_hr', protocol === 'WATTBIKE_TEST' ? 'Śr. tętno z 20 min' : 'Śr. tętno z minut 10–30', 'numeric', 'np. 160')}
        {protocol === 'WATTBIKE_TEST' ? input('avg_power_w', 'Śr. moc z 20 min (W)', 'numeric', 'np. 235') : input('avg_speed_kmh', 'Śr. prędkość (km/h)', 'decimal', 'np. 31,5')}
        {protocol === 'TEST_LTHR' && input('distance_km', 'Dystans 30 min (km)', 'decimal')}
        {protocol === 'TEST_LTHR' && input('route', 'Trasa', 'text', 'ta sama co zawsze')}
        {input('bike', 'Rower', 'text', protocol === 'WATTBIKE_TEST' ? 'Wattbike' : 'Dogma')}
        {protocol === 'TEST_LTHR' && input('temp_c', 'Temperatura (°C)', 'decimal')}
        {protocol === 'TEST_LTHR' && input('wind', 'Wiatr', 'text', 'słaby / silny, kierunek')}
        <label className="col-span-2 block">
          <span className="text-xs text-slate-500">Notatka</span>
          <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900" value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} />
        </label>
      </div>
      {lthr && (
        <div className="mt-3 rounded-lg bg-sky-50 p-3 text-sm dark:bg-sky-950/40">
          <p>
            <b>LTHR = {lthr} bpm</b>
            {protocol === 'WATTBIKE_TEST' && <span className="text-xs text-slate-500"> (0,97 × {avgHr})</span>}
            {previousLthr && (
              <span className="ml-2 text-xs">
                poprzednio {previousLthr} ({lthr - previousLthr >= 0 ? '+' : ''}
                {lthr - previousLthr})
              </span>
            )}
            {ftp && <span className="ml-2"><b>FTP = {ftp} W</b></span>}
          </p>
          {zones && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Nowe strefy od jutra: Z2 {zones[1]!.low_bpm}–{zones[1]!.high_bpm} · SS {zones[3]!.low_bpm}–{zones[3]!.high_bpm} · THR {zones[5]!.low_bpm}–{zones[5]!.high_bpm}. Ustaw też strefy w aplikacji ELEMNT.
            </p>
          )}
        </div>
      )}
      <Button onClick={save} disabled={!lthr} className="mt-3 w-full">
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
      <p>
        {fmtDate(t.date)} · <b>LTHR {t.lthr_bpm} bpm</b>
        {t.ftp_w && <> · FTP {t.ftp_w} W</>}
        {t.avg_speed_kmh != null && <> · {num(t.avg_speed_kmh)} km/h</>}
        {t.avg_hr && <span className="text-slate-500"> · śr. tętno {t.avg_hr}</span>}
      </p>
      {(t.route || t.bike || t.temp_c != null) && <p className="text-xs text-slate-500">{[t.route, t.bike, t.temp_c != null ? `${num(t.temp_c)} °C` : null, t.wind].filter(Boolean).join(' · ')}</p>}
      {onEdit && (
        <button onClick={onEdit} className="mt-1 min-h-11 text-sky-600">
          Popraw
        </button>
      )}
    </div>
  )
}
