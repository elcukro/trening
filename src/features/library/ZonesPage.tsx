import { Link } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { computeZones, wattsRange } from '@/engine/zones'
import { effectiveFtp, effectiveLthr } from '@/engine/progress'
import { fmtDayMonth, todayISO } from '@/lib/dates'
import { Card, CardTitle, Inset, PageTitle } from '@/components/ui'
import { zoneColor } from '@/lib/zones'
import { useT } from '@/i18n/react'

export function ZonesPage() {
  const engine = useEngine()
  const today = todayISO()
  const tr = useT()
  const Z = tr.classic.zones
  const tests = engine.ctx.tests ?? []
  const effL = effectiveLthr(today, engine.ctx.settings.lthr_bpm, tests.filter((t): t is { date: string; lthr_bpm: number } => !!t.lthr_bpm))
  const lthr = effL.lthr
  const effF = effectiveFtp(today, engine.ctx.settings.ftp_w_estimate, tests)
  const ftp = effF.ftp
  const powerZones = engine.ctx.program.power_zones_ftp_fraction
  const zones = engine.ctx.program.hr_zones_lthr_fraction
  const bpm = lthr ? computeZones(zones, lthr) : null
  const sub = [lthr ? `LTHR ${lthr} bpm${effL.source === 'test' && effL.test_date ? ` (${Z.test(fmtDayMonth(effL.test_date))})` : ''}` : Z.noLthr, `FTP ${ftp} W${effF.source === 'test' && effF.test_date ? ` (${Z.test(fmtDayMonth(effF.test_date))})` : ` (${Z.estimate})`}`].join(' · ')
  return (
    <div className="space-y-3">
      <Link to="/biblioteka" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
        ‹ {tr.classic.library.title}
      </Link>
      <PageTitle sub={sub}>{Z.title}</PageTitle>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1">{Z.zone}</th>
              <th className="py-1">% LTHR</th>
              <th className="py-1">{lthr ? 'bpm' : 'RPE'}</th>
              <th className="py-1">W</th>
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
                <td className="py-1.5 tabular-nums">{(() => { const w = wattsRange(z.id, powerZones, ftp); return w ? `${w[0]}–${w[1]}` : '—' })()}</td>
                {lthr && <td className="py-1.5 tabular-nums">{z.rpe[0]}–{z.rpe[1]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{Z.note(ftp, effF.source === 'test')}</p>
      </Card>
      {!lthr && (
        <Link to="/wiecej/ustawienia" className="block">
          <Inset tone="warn" className="font-medium hover:underline">
            {Z.needLthr} →
          </Inset>
        </Link>
      )}
      {engine.ctx.program.rules.tests.map((t) => (
        <Card key={t.id}>
          <CardTitle icon="🧪">{t.name}</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">{Z.when(t.when)}</p>
          <p className="mt-1 text-sm">{t.protocol}</p>
          <p className="mt-1 text-sm font-medium">{t.result}</p>
        </Card>
      ))}
    </div>
  )
}
