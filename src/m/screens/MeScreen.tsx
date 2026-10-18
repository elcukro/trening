import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/sync/auth'
import { useEngine } from '@/app/useSettings'
import { useOpenFull, useSnapshot, useUiMode } from '@/day/useIos'
import { formLabel } from '@/day/dayState'
import { fmtDayMonth } from '@/lib/dates'
import { num } from '@/lib/format'
import { Group, Row, Screen } from '../components/Chrome'
import { ART } from '../art'

/** Ja: trzy liczby, które mówią „jak idzie” (cel, masa, forma), potem program i przełączniki. Ustawienia – krok 6. */
export function MeScreen() {
  const navigate = useNavigate()
  const ui = useUiMode()
  const openFull = useOpenFull()
  const auth = useAuth()
  const engine = useEngine()
  const snap = useSnapshot()
  const form = formLabel(snap.form?.tsb ?? null)
  const toGoal = snap.goal.ftp - snap.ftp.w
  // diagnostyka układu (docs/24 § 6): co iOS mówi o oknie – do zdjęcia po doszlifowaniu v2
  const [diag, setDiag] = useState('')
  useEffect(() => {
    const read = () => setDiag(document.documentElement.dataset.mViewport ?? '')
    read()
    const id = window.setInterval(read, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <Screen title="Ja" subtitle={auth.session?.user.email ?? 'bez konta'}>
      <div className="grid grid-cols-3 gap-3">
        <Tile art={ART.test} value={`${snap.ftp.w}`} unit="W" label={toGoal > 0 ? `do celu ${toGoal} W` : 'cel osiągnięty'} sub={snap.ftp.wPerKg != null ? `${num(snap.ftp.wPerKg, 2)} W/kg` : snap.ftp.source === 'test' ? 'z testu' : 'szacunek'} color="var(--red)" />
        <Tile art={ART.scale} value={snap.weight.kg != null ? num(snap.weight.kg) : '—'} unit="kg" label={snap.weight.perWeek != null ? `${snap.weight.perWeek > 0 ? '+' : ''}${num(snap.weight.perWeek, 2)} kg/tydz.` : 'bez trendu'} sub={snap.weight.date ? fmtDayMonth(snap.weight.date) : 'brak ważenia'} color="var(--accent)" />
        <Tile art={ART.heart} value={form?.text ?? '—'} label={snap.form ? `CTL ${Math.round(snap.form.ctl)}` : 'bez obciążeń'} sub={snap.form ? `TSB ${Math.round(snap.form.tsb)}` : 'z jazd'} color={form?.tone === 'warn' ? 'var(--orange)' : 'var(--green)'} small />
      </div>
      <Group label="Program">
        <Row title={engine.ctx.program.goal.label} sub={`Wersja ${engine.ctx.program.version} · cel FTP ${snap.goal.ftp} W`} />
      </Group>
      <Group label="Wygląd">
        <Row title="Wróć do poprzedniego wyglądu" sub="Uproszczony interfejs (/i) zostaje jako zapas" onClick={() => void ui.set('ios').then(() => navigate('/i'))} />
        <Row title="Otwórz pełną aplikację" sub="Kalendarz, wykresy, biblioteka, ustawienia" onClick={() => openFull('/')} />
      </Group>
      <p className="m-foot m-dim px-1">Ostatnie jazdy, testy i ustawienia (progi, miernik, powiadomienia, konto) – krok 6 w docs/24.</p>
      {diag && <p className="m-foot m-dim-3 m-num px-1">Okno: {diag}</p>}
    </Screen>
  )
}

function Tile({ art, value, unit, label, sub, color, small }: { art: string; value: string; unit?: string; label: string; sub: string; color: string; small?: boolean }) {
  return (
    <div className="m-card flex flex-col p-3">
      <img src={art} alt="" width={36} height={36} className="h-9 w-9 object-contain" />
      <div className={`m-num mt-2 leading-tight font-bold ${small ? 'text-[17px]' : 'text-[24px]'}`} style={{ color }}>
        {value}
        {unit && <span className="m-foot m-dim ml-1 font-semibold">{unit}</span>}
      </div>
      <div className="m-foot mt-1 leading-tight">{label}</div>
      <div className="m-foot m-dim-3 leading-tight">{sub}</div>
    </div>
  )
}
