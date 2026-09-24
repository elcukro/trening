import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, type KeyValueRow, type SessionLog, type StravaActivity } from '@/db'
import { useEngine } from '@/app/useSettings'
import { rideLoad } from '@/engine/analysis'
import { addDays } from '@/engine/dates'
import { effectiveLthr } from '@/engine/progress'
import { fmtDayMonth, todayISO } from '@/lib/dates'
import { num } from '@/lib/format'
import { useSnapshot } from '../useIos'
import { formLabel, goalProgress } from '../dayState'
import { Card, List, Row, RowIcon, Screen, Section } from '../components/Chrome'
import { IconBike, IconBolt, IconChevron, IconHeart, IconScale, IconTarget } from '../components/Icons'

/** Pierścień postępu – kąt proporcjonalny do procentu, kolor w skali systemowej. */
function Ring({ pct, center, label }: { pct: number; center: string; label: string }) {
  const r = 44
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-[116px] w-[116px] shrink-0">
      <svg viewBox="0 0 116 116" className="h-full w-full -rotate-90" role="img" aria-label={`${pct} % celu`}>
        <circle cx="58" cy="58" r={r} fill="none" stroke="var(--fill)" strokeWidth="11" />
        <circle cx="58" cy="58" r={r} fill="none" stroke="var(--blue)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="ios-num text-[26px] leading-7 font-bold tracking-[-0.6px]">{center}</span>
        <span className="ios-caption ios-dim">{label}</span>
      </div>
    </div>
  )
}

export function ProgressScreen() {
  const engine = useEngine()
  const navigate = useNavigate()
  const today = todayISO()
  const snap = useSnapshot()
  const goal = goalProgress(snap.ftp.w, snap.goal.ftp)
  const form = formLabel(snap.form?.tsb ?? null)

  const acts = useLiveQuery(async () => (await db.strava_activities.where('date').aboveOrEqual(addDays(today, -28)).toArray()).filter((a) => !a.deleted_at && a.is_ride).toSorted((a, b) => (a.date < b.date ? 1 : -1)), [today], [] as StravaActivity[])
  const logs = useLiveQuery(async () => (await db.session_logs.where('date').aboveOrEqual(addDays(today, -28)).toArray()).filter((l) => !l.deleted_at && l.kind === 'bike'), [today], [] as SessionLog[])
  const analyses = useLiveQuery(async () => (await db.kv.where('key').startsWith('analysis:').toArray()) as KeyValueRow[], [], [] as KeyValueRow[])

  const { settings, tests, program } = engine.ctx
  const lthr = effectiveLthr(today, settings.lthr_bpm, (tests ?? []).filter((t): t is { date: string; lthr_bpm: number } => !!t.lthr_bpm)).lthr
  const ftp = settings.power_meter ? snap.ftp.w : null

  return (
    <Screen title="Postęp" subtitle={snap.goal.label}>
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex items-center gap-4">
            <Ring pct={goal?.pct ?? 0} center={goal ? `${snap.ftp.w}` : '—'} label="W teraz" />
            <div className="min-w-0">
              <p className="ios-title3">Cel: {snap.goal.ftp} W</p>
              {goal && goal.missing > 0 && (
                <p className="ios-headline mt-1" style={{ color: 'var(--blue)' }}>
                  brakuje {goal.missing} W
                </p>
              )}
              {goal && goal.missing === 0 && (
                <p className="ios-headline mt-1" style={{ color: 'var(--green)' }}>
                  cel osiągnięty
                </p>
              )}
            </div>
          </div>
          <p className="ios-foot ios-dim mt-3">
            {snap.goal.watts != null
              ? `Tyle mocy progowej trzeba na cel prędkościowy – na płaskim to około ${snap.goal.watts} W ciągle.`
              : 'Cel z ustawień programu. Po każdym teście FTP zobaczysz, ile zostało.'}
          </p>
        </div>
      </Card>

      <Section header="Teraz">
        <List>
          <Row
            icon={<RowIcon color="var(--yellow)"><IconBolt size={18} /></RowIcon>}
            title="FTP"
            subtitle={snap.ftp.source === 'test' ? 'z ostatniego testu' : 'szacunek – zrób test'}
            value={`${snap.ftp.w} W${snap.ftp.wPerKg ? ` · ${num(snap.ftp.wPerKg, 2)} W/kg` : ''}`}
          />
          <Row
            icon={<RowIcon color="var(--indigo)"><IconScale size={18} /></RowIcon>}
            title="Waga"
            subtitle={snap.weight.date ? `pomiar ${fmtDayMonth(snap.weight.date)}${snap.weight.perWeek != null ? ` · ${snap.weight.perWeek > 0 ? '+' : ''}${num(snap.weight.perWeek, 2)} kg/tydz.` : ''}` : 'brak pomiarów'}
            value={snap.weight.kg != null ? `${num(snap.weight.kg, 1)} kg` : '—'}
          />
          {form && (
            <Row
              icon={<RowIcon color={form.tone === 'warn' ? 'var(--orange)' : 'var(--green)'}><IconHeart size={18} /></RowIcon>}
              title="Forma"
              subtitle={form.hint}
              value={form.text}
            />
          )}
          <Row
            icon={<RowIcon color="var(--blue)"><IconTarget size={18} /></RowIcon>}
            title="Ten tydzień"
            subtitle={`plan ${Math.round(snap.week.planned)} TSS`}
            value={`${Math.round(snap.week.done)} TSS`}
          />
        </List>
      </Section>

      {snap.ftp.suggestion && (
        <Section header="Propozycja" footer="Zmianę FTP zapisujesz w pełnej aplikacji – tam widać też krzywą mocy i historię testów.">
          <List>
            <Row
              wrap
              icon={<RowIcon color="var(--green)"><IconBolt size={18} /></RowIcon>}
              title={`FTP może być wyższe: ${snap.ftp.suggestion.ftp} W`}
              subtitle={`${snap.ftp.suggestion.basis === '20min' ? 'Najlepsze 20 min' : 'Pełna godzina'}: ${snap.ftp.suggestion.effort_w} W · ${snap.ftp.suggestion.ride_name ?? 'jazda'} ${fmtDayMonth(snap.ftp.suggestion.ride_date)}`}
              onClick={() => navigate('/postep')}
              accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
            />
          </List>
        </Section>
      )}

      <Section header="Ostatnie jazdy" footer={acts.length === 0 ? 'Jazdy pojawią się po synchronizacji ze Stravą.' : undefined}>
        <List>
          {acts.slice(0, 8).map((a) => {
            const load = rideLoad({
              moving_s: a.moving_time_s,
              device_watts: a.device_watts,
              np_w: a.np_w,
              avg_watts: a.avg_watts,
              ftp,
              hr_histogram: a.hr_histogram,
              zones: program.hr_zones_lthr_fraction,
              lthr,
              rpe: logs.find((l) => l.date === a.date)?.rpe ?? undefined,
            })
            const score = (analyses.find((k) => k.key === `analysis:${a.id}`)?.value as { score: number | null } | undefined)?.score ?? null
            return (
              <Row
                key={a.id}
                onClick={() => navigate(`/i/dzien/${a.date}`)}
                icon={<RowIcon color="var(--blue)"><IconBike size={18} /></RowIcon>}
                title={a.name ?? 'Jazda'}
                subtitle={`${fmtDayMonth(a.date)} · ${Math.round(a.moving_time_s / 60)} min${a.device_watts && a.np_w ? ` · NP ${a.np_w} W` : a.avg_hr ? ` · ${a.avg_hr} bpm` : ''}${score != null ? ` · zgodność ${score} %` : ''}`}
                value={load ? `${load.tss} TSS` : undefined}
                accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
              />
            )
          })}
          {acts.length === 0 && <Row title="Brak jazd z ostatnich 4 tygodni" />}
        </List>
      </Section>

      <Section footer="Krzywa mocy, wykres formy, kadencja, historia siły i raporty tygodniowe są w pełnej aplikacji.">
        <List>
          <Row title="Pełna analiza" onClick={() => navigate('/postep')} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />
        </List>
      </Section>
    </Screen>
  )
}
