import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, type KeyValueRow, type SessionLog } from '@/db'
import { useRides } from '@/app/useRides'
import { useEngine } from '@/app/useSettings'
import { rideLoad } from '@/engine/analysis'
import { addDays } from '@/engine/dates'
import { effectiveLthr } from '@/engine/progress'
import { fmtDayMonth, todayISO } from '@/lib/dates'
import { num } from '@/lib/format'
import { useSnapshot } from '@/day/useIos'
import { formLabel, goalProgress } from '@/day/dayState'
import { Card, List, Row, RowIcon, Screen, Section } from '../components/Chrome'
import { IconBike, IconBolt, IconChevron, IconHeart, IconScale, IconTarget } from '../components/Icons'
import { useT } from '@/i18n/react'

/** Pierścień postępu – kąt proporcjonalny do procentu, kolor w skali systemowej. */
function Ring({ pct, center, label }: { pct: number; center: string; label: string }) {
  const r = 44
  const c = 2 * Math.PI * r
  const t = useT()
  return (
    <div className="relative h-[116px] w-[116px] shrink-0">
      <svg viewBox="0 0 116 116" className="h-full w-full -rotate-90" role="img" aria-label={t.ios.progress.ringLabel(pct)}>
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
  const tr = useT()
  const tx = tr.ios.progress
  const today = todayISO()
  const snap = useSnapshot()
  const goal = goalProgress(snap.ftp.w, snap.goal.ftp)
  const form = formLabel(snap.form?.tsb ?? null)

  const acts = useRides(addDays(today, -28), today).toReversed()
  const logs = useLiveQuery(async () => (await db.session_logs.where('date').aboveOrEqual(addDays(today, -28)).toArray()).filter((l) => !l.deleted_at && l.kind === 'bike'), [today], [] as SessionLog[])
  const analyses = useLiveQuery(async () => (await db.kv.where('key').startsWith('analysis:').toArray()) as KeyValueRow[], [], [] as KeyValueRow[])

  const { settings, tests, program } = engine.ctx
  const lthr = effectiveLthr(today, settings.lthr_bpm, (tests ?? []).filter((t): t is { date: string; lthr_bpm: number } => !!t.lthr_bpm)).lthr
  const ftp = settings.power_meter ? snap.ftp.w : null

  return (
    <Screen title={tx.title} subtitle={snap.goal.label}>
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex items-center gap-4">
            <Ring pct={goal?.pct ?? 0} center={goal ? `${snap.ftp.w}` : '—'} label={tx.wattsNow} />
            <div className="min-w-0">
              <p className="ios-title3">{tx.goal(snap.goal.ftp)}</p>
              {goal && goal.missing > 0 && (
                <p className="ios-headline mt-1" style={{ color: 'var(--blue)' }}>
                  {tx.missing(goal.missing)}
                </p>
              )}
              {goal && goal.missing === 0 && (
                <p className="ios-headline mt-1" style={{ color: 'var(--green)' }}>
                  {tx.reached}
                </p>
              )}
            </div>
          </div>
          <p className="ios-foot ios-dim mt-3">
            {snap.goal.watts != null
              ? tx.goalWatts(snap.goal.watts)
              : tx.goalFromProgram}
          </p>
        </div>
      </Card>

      <Section header={tx.now}>
        <List>
          <Row
            icon={<RowIcon color="var(--yellow)"><IconBolt size={18} /></RowIcon>}
            title="FTP"
            subtitle={snap.ftp.source === 'test' ? tx.fromTest : tx.estimate}
            value={`${snap.ftp.w} W${snap.ftp.wPerKg ? ` · ${num(snap.ftp.wPerKg, 2)} W/kg` : ''}`}
          />
          <Row
            icon={<RowIcon color="var(--indigo)"><IconScale size={18} /></RowIcon>}
            title={tx.weight}
            subtitle={snap.weight.date ? `${tx.measured(fmtDayMonth(snap.weight.date))}${snap.weight.perWeek != null ? ` · ${tx.perWeek(`${snap.weight.perWeek > 0 ? '+' : ''}${num(snap.weight.perWeek, 2)}`)}` : ''}` : tx.noMeasurements}
            value={snap.weight.kg != null ? `${num(snap.weight.kg, 1)} kg` : '—'}
          />
          {form && (
            <Row
              icon={<RowIcon color={form.tone === 'warn' ? 'var(--orange)' : 'var(--green)'}><IconHeart size={18} /></RowIcon>}
              title={tx.form}
              subtitle={form.hint}
              value={form.text}
            />
          )}
          <Row
            icon={<RowIcon color="var(--blue)"><IconTarget size={18} /></RowIcon>}
            title={tx.thisWeek}
            subtitle={tx.plannedTss(Math.round(snap.week.planned))}
            value={`${Math.round(snap.week.done)} TSS`}
          />
        </List>
      </Section>

      {snap.ftp.suggestion && (
        <Section header={tx.suggestion} footer={tx.suggestionFooter}>
          <List>
            <Row
              wrap
              icon={<RowIcon color="var(--green)"><IconBolt size={18} /></RowIcon>}
              title={tx.ftpHigher(snap.ftp.suggestion.ftp)}
              subtitle={`${snap.ftp.suggestion.basis === '20min' ? tx.best20 : tx.fullHour}: ${snap.ftp.suggestion.effort_w} W · ${snap.ftp.suggestion.ride_name ?? tr.ios.ride.toLowerCase()} ${fmtDayMonth(snap.ftp.suggestion.ride_date)}`}
              onClick={() => navigate('/postep')}
              accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
            />
          </List>
        </Section>
      )}

      <Section header={tx.recent} footer={acts.length === 0 ? tx.recentFooter : undefined}>
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
            const score = (analyses.find((k) => k.key === `analysis:${a.key}`)?.value as { score: number | null } | undefined)?.score ?? null
            return (
              <Row
                key={a.key}
                onClick={() => navigate(`/i/dzien/${a.date}`)}
                icon={<RowIcon color="var(--blue)"><IconBike size={18} /></RowIcon>}
                title={a.name}
                subtitle={`${fmtDayMonth(a.date)} · ${Math.round(a.moving_time_s / 60)} min${a.device_watts && a.np_w ? ` · NP ${a.np_w} W` : a.avg_hr ? ` · ${a.avg_hr} bpm` : ''}${score != null ? ` · ${tx.match(score)}` : ''}`}
                value={load ? `${load.tss} TSS` : undefined}
                accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
              />
            )
          })}
          {acts.length === 0 && <Row title={tx.noRides} />}
        </List>
      </Section>

      <Section footer={tx.fullFooter}>
        <List>
          <Row title={tx.full} onClick={() => navigate('/postep')} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />
        </List>
      </Section>
    </Screen>
  )
}
