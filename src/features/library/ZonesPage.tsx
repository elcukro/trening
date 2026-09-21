import { Link } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { computeZones } from '@/engine/zones'
import { Card, CardTitle, Inset, PageTitle } from '@/components/ui'
import { zoneColor } from '@/lib/zones'
import { TESTS } from '@/data/rules'

export function ZonesPage() {
  const engine = useEngine()
  const lthr = engine.ctx.settings.lthr_bpm
  const zones = engine.ctx.program.hr_zones_lthr_fraction
  const bpm = lthr ? computeZones(zones, lthr) : null
  return (
    <div className="space-y-3">
      <Link to="/biblioteka" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
        ‹ Biblioteka
      </Link>
      <PageTitle sub={lthr ? `LTHR ${lthr} bpm` : 'Brak LTHR – pokazuję % i RPE'}>Strefy tętna</PageTitle>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1">Strefa</th>
              <th className="py-1">% LTHR</th>
              <th className="py-1">{lthr ? 'bpm' : 'RPE'}</th>
              {lthr && <th className="py-1">RPE</th>}
            </tr>
          </thead>
          <tbody>
            {zones.map((z, i) => (
              <tr key={z.id} className="border-t border-slate-100 dark:border-slate-700/80">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${zoneColor(z.id)}`} />
                    <span className="font-semibold">{z.id}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{z.name}</span>
                  </span>
                </td>
                <td className="py-1.5 tabular-nums">
                  {Math.round(z.low * 100)}–{Math.round(z.high * 100)}%
                </td>
                <td className="py-1.5 tabular-nums">{bpm ? `${bpm[i]!.low_bpm}–${bpm[i]!.high_bpm}` : `${z.rpe[0]}–${z.rpe[1]}`}</td>
                {lthr && <td className="py-1.5 tabular-nums">{z.rpe[0]}–{z.rpe[1]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">W interwałach ≥ SS pierwsze 2–3 min prowadź po RPE – tętno dogania z opóźnieniem. W upale &gt; 28 °C cele Z2–SS niżej o 3–5 bpm.</p>
      </Card>
      {!lthr && (
        <Link to="/wiecej/ustawienia" className="block">
          <Inset tone="warn" className="font-medium hover:underline">
            Wpisz LTHR w ustawieniach, żeby zobaczyć bpm →
          </Inset>
        </Link>
      )}
      {TESTS.map((t) => (
        <Card key={t.id}>
          <CardTitle icon="🧪">{t.name}</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">Kiedy: {t.when}</p>
          <p className="mt-1 text-sm">{t.protocol}</p>
          <p className="mt-1 text-sm font-medium">{t.result}</p>
        </Card>
      ))}
    </div>
  )
}
