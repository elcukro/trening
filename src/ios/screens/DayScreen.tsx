import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { isValidISODate } from '@/engine/dates'
import type { DayPlan } from '@/engine/plan'
import type { ResolvedWorkout } from '@/engine/types'
import { useToast } from '@/components/Toast'
import { fmtLong, todayISO } from '@/lib/dates'
import { minutes, num } from '@/lib/format'
import { DAY_TYPE_LABEL, WEEKDAY_LONG } from '@/lib/labels'
import { zoneColor } from '@/lib/zones'
import { useIosDay, useRideScore } from '@/day/useIos'
import { useBriefing } from '@/day/useBriefing'
import { rideVerdict, type DayStep } from '@/day/dayState'
import { mainTarget, structureLabel } from '@/day/summary'
import { Btn, Card, List, Pill, Row, RowIcon, Screen, Section, Stat } from '../components/Chrome'
import { IconBike, IconBolt, IconCheck, IconChevron, IconFlag, IconHeart, IconRest, IconSun, IconTarget, IconTimer, IconWatch } from '../components/Icons'
import { SyncBanner } from '../components/SyncBanner'
import { CheckinSheet } from '../components/CheckinSheet'
import { AfterSheet } from '../components/AfterSheet'
import { BriefingSheet } from '../components/BriefingSheet'
import { CoachSheet } from '../components/CoachSheet'
import { canChat } from '@/sync/coachChat'
import { useT } from '@/i18n/react'
import type { Messages } from '@/i18n'

/** Nazwa dnia tygodnia wielką literą (tytuł ekranu). */
const weekdayTitle = (wd: string | undefined): string | undefined => {
  const s = wd ? WEEKDAY_LONG[wd] : undefined
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined
}

/** Pasek stref treningu – szerokość proporcjonalna do czasu kroku. */
function Timeline({ workout }: { workout: ResolvedWorkout }) {
  const total = workout.steps.reduce((a, s) => a + s.duration_s, 0) || 1
  const t = useT()
  return (
    <div className="flex h-2 w-full gap-px overflow-hidden rounded-full" role="img" aria-label={t.ios.day.structure}>
      {workout.steps.map((s, i) => (
        <div key={i} className={zoneColor(s.zone)} style={{ width: `${(s.duration_s / total) * 100}%` }} />
      ))}
    </div>
  )
}

function StatusPill({ status, hasActivity }: { status: string | undefined; hasActivity: boolean }) {
  const st = useT().ios.status
  if (status === 'done') return <Pill color="#fff" bg="var(--green)">{st.done}</Pill>
  if (status === 'modified') return <Pill color="#fff" bg="var(--orange)">{st.modified}</Pill>
  if (status === 'skipped') return <Pill color="#fff" bg="var(--red)">{st.skipped}</Pill>
  if (status === 'in_progress') return <Pill color="#fff" bg="var(--blue)">{st.inProgress}</Pill>
  if (hasActivity) return <Pill color="#fff" bg="var(--green)">{st.rideSaved}</Pill>
  return null
}

function HeroRide({ day, status, hasActivity, onOpen }: { day: DayPlan; status: string | undefined; hasActivity: boolean; onOpen: () => void }) {
  const w = day.workout!
  const target = mainTarget(w)
  const structure = structureLabel(w)
  const stat = useT().ios.stat
  return (
    <Card onClick={onOpen} className="mb-4">
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <RowIcon color="var(--blue)">
            <IconBike size={18} />
          </RowIcon>
          <Pill>{DAY_TYPE_LABEL[day.day_type]}</Pill>
          <span className="ml-auto flex items-center gap-2">
            <StatusPill status={status} hasActivity={hasActivity} />
            <span className="ios-dim-3">
              <IconChevron size={18} />
            </span>
          </span>
        </div>
        <h2 className="ios-title2">{w.name}</h2>
        <p className="ios-num mt-0.5 text-[15px] tracking-[-0.2px]" style={{ color: 'var(--label-2)' }}>
          {minutes(day.bike!.duration_min)}
          {structure && ` · ${structure}`}
        </p>
        <div className="mt-3">
          <Timeline workout={w} />
        </div>
        {target && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat size="sm" value={target.watts ? `${target.watts[0]}–${target.watts[1]}` : target.zone} unit={target.watts ? 'W' : undefined} label={target.watts ? stat.power : stat.zone} />
            <Stat size="sm" value={target.bpm ? `${target.bpm[0]}–${target.bpm[1]}` : `${target.rpe[0]}–${target.rpe[1]}`} unit={target.bpm ? 'bpm' : 'RPE'} label={target.bpm ? stat.hr : stat.feel} />
            <Stat size="sm" value={target.cadence ? `${target.cadence[0]}–${target.cadence[1]}` : '—'} unit={target.cadence ? 'rpm' : undefined} label={stat.cadence} />
          </div>
        )}
      </div>
    </Card>
  )
}

function HeroRest() {
  const tx = useT().ios.day
  return (
    <Card className="mb-4">
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <RowIcon color="var(--label-3)">
            <IconRest size={18} />
          </RowIcon>
          <Pill>{tx.rest}</Pill>
        </div>
        <h2 className="ios-title2">{tx.restTitle}</h2>
        <p className="ios-subhead ios-dim mt-1">{tx.restSub}</p>
      </div>
    </Card>
  )
}

/** Karta wyniku treningu – te same pola dla jazdy ze Stravy i dla treningu odczytanego z Bolta. */
function RideResult({
  name,
  minutes: activeMin,
  powerW,
  powerLabel,
  avgHr,
  maxHr,
  km,
  tss,
  speedKmh,
  cadence,
  ascentM,
  decoupling,
  score,
  note,
  className = '',
}: {
  name: string
  minutes: number
  powerW: number | null
  powerLabel: string
  avgHr: number | null
  maxHr: number | null
  km: number | null
  tss: number | null
  speedKmh: number | null
  cadence: number | null
  ascentM: number | null
  decoupling: number | null
  score: number | null
  note?: string | null
  className?: string
}) {
  const verdict = rideVerdict(score)
  const t = useT()
  const tx = t.ios.day
  const details = [
    speedKmh != null ? `${num(speedKmh, 1)} km/h` : null,
    cadence ? `${cadence} rpm` : null,
    avgHr ? `${avgHr}${maxHr ? `/${maxHr}` : ''} bpm` : null,
    ascentM ? tx.ascent(Math.round(ascentM)) : null,
  ].filter(Boolean)
  return (
    <Card className={className}>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="ios-headline truncate">{name}</span>
          {verdict && (
            <Pill color="#fff" bg={verdict.tone === 'good' ? 'var(--green)' : verdict.tone === 'ok' ? 'var(--orange)' : 'var(--red)'}>
              {score} %
            </Pill>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Stat size="sm" value={activeMin} unit="min" label={tx.time} />
          <Stat size="sm" value={powerW ?? avgHr ?? '—'} unit={powerW ? 'W' : avgHr ? 'bpm' : undefined} label={powerW ? powerLabel : tx.avgHr} />
          <Stat size="sm" value={km != null ? num(km, 1) : '—'} unit={km != null ? 'km' : undefined} label={tx.distance} />
          <Stat size="sm" value={tss ?? '—'} label="TSS" />
        </div>
        {details.length > 0 && <p className="ios-foot ios-dim ios-num mt-3">{details.join(' · ')}</p>}
        {decoupling != null && (
          <p className="ios-foot ios-dim ios-num mt-1">
            Pw:HR {num(decoupling, 1)} % · {decouplingNote(t, decoupling)}
          </p>
        )}
        {verdict && <p className="ios-foot ios-dim mt-1">{verdict.text}</p>}
        {note && (
          <p className="ios-body mt-3 border-t pt-3" style={{ borderColor: 'var(--separator)' }}>
            {note}
          </p>
        )}
      </div>
    </Card>
  )
}

const STEP_ICON: Record<string, { color: string; icon: typeof IconSun }> = {
  checkin: { color: 'var(--orange)', icon: IconSun },
  bolt: { color: 'var(--teal)', icon: IconWatch },
  train: { color: 'var(--blue)', icon: IconBike },
  log: { color: 'var(--purple)', icon: IconFlag },
}

export function DayScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayISO()
  const date = params.date && isValidISODate(params.date) ? params.date : today
  const isToday = date === today

  const d = useIosDay(date)
  const brief = useBriefing(d.day, d.view.overrides.some((o) => o.kind === 'indoor'))
  const score = useRideScore(d.activities[0], d.day, d.ftp)
  const [sheet, setSheet] = useState<'checkin' | 'after' | 'brief' | 'coach' | null>(null)
  const [sending, setSending] = useState(false)
  const t = useT()
  const tx = t.ios.day

  const day = d.day
  const title = isToday ? t.common.today : (weekdayTitle(day?.weekday) ?? tx.day)

  if (!day) {
    return (
      <Screen title={title} subtitle={fmtLong(date)} back={isToday ? undefined : () => navigate(-1)}>
        <Section footer={tx.outsidePlanFooter}>
          <List>
            <Row title={tx.outsidePlan} />
          </List>
        </Section>
      </Screen>
    )
  }

  async function send() {
    setSending(true)
    try {
      await toast.run(t.ios.bolt.sending, d.sendToBolt, (s) => (s === 'updated' ? t.ios.bolt.updated : t.ios.bolt.sent))
    } finally {
      setSending(false)
    }
  }

  function runStep(step: DayStep) {
    switch (step.key) {
      case 'checkin':
        return setSheet('checkin')
      case 'bolt':
        return void send()
      case 'train':
        return navigate(`/i/trening/${date}`)
      case 'log':
        return setSheet('after')
    }
  }

  const next = d.flow.next
  const allDone = d.flow.progress.total > 0 && d.flow.progress.done === d.flow.progress.total
  const nextLabel = tx.next as Record<string, string>

  const rideStatus = d.rideLog?.status
  const warnings = d.view.warnings

  return (
    <Screen title={title} subtitle={tx.subtitle(fmtLong(date), day.week)} back={isToday ? undefined : () => navigate(-1)}>
      <SyncBanner />
      {day.bike && day.workout ? (
        <HeroRide day={day} status={rideStatus} hasActivity={d.activities.length > 0} onOpen={() => navigate(`/i/trening/${date}`)} />
      ) : (
        <HeroRest />
      )}

      {next ? (
        <div className="mb-8 px-4">
          <Btn className="w-full" onClick={() => runStep(next)} disabled={sending && next.key === 'bolt'}>
            {nextLabel[next.key]}
          </Btn>
        </div>
      ) : allDone ? (
        <div className="mb-8 px-4">
          <div className="ios-surface flex items-center justify-center gap-2 px-4 py-3" style={{ color: 'var(--green)' }}>
            <IconCheck size={20} />
            <span className="ios-headline">{tx.allDone}</span>
          </div>
        </div>
      ) : (
        <div className="mb-8" />
      )}

      {d.activities.length > 0 ? (
        <Section header={tx.after}>
          {d.activities.map((a, i) => (
            <RideResult
              key={a.key}
              className={i > 0 ? 'mt-3' : ''}
              name={a.name}
              minutes={Math.round(a.moving_time_s / 60)}
              powerW={a.device_watts ? (a.np_w ?? a.avg_watts ?? null) : null}
              powerLabel={a.np_w ? 'NP' : tx.avgPower}
              avgHr={a.avg_hr ?? null}
              maxHr={a.max_hr ?? null}
              km={a.distance_m > 0 ? a.distance_m / 1000 : null}
              tss={d.loadOf(a)?.tss ?? null}
              speedKmh={a.distance_m > 0 && a.moving_time_s > 0 ? (a.distance_m / a.moving_time_s) * 3.6 : null}
              cadence={a.avg_cadence ?? null}
              ascentM={a.elevation_m ?? null}
              decoupling={i === 0 && (!day.bike || day.day_type === 'easy' || day.day_type === 'long') ? (a.decoupling_pct ?? null) : null}
              score={i === 0 ? score : null}
              note={a.note ?? null}
            />
          ))}
        </Section>
      ) : d.boltWorkouts.length > 0 ? (
        <Section header={tx.after} footer={tx.boltFooter}>
          {d.boltWorkouts.map((w, i) => (
            <RideResult
              key={w.id}
              className={i > 0 ? 'mt-3' : ''}
              name={w.name ?? tx.boltWorkout}
              minutes={w.minutes_active}
              powerW={w.np_w ?? w.avg_power ?? null}
              powerLabel={w.np_w ? 'NP' : tx.avgPower}
              avgHr={w.avg_hr ?? null}
              maxHr={null}
              km={w.distance_km ?? null}
              tss={null}
              speedKmh={w.avg_speed_kmh ?? null}
              cadence={w.avg_cadence ?? null}
              ascentM={w.ascent_m ?? null}
              decoupling={null}
              score={null}
            />
          ))}
        </Section>
      ) : null}

      <Section header={isToday ? tx.stepsToday : tx.stepsDay}>
        <List>
          {d.flow.steps.map((s) => {
            const meta = STEP_ICON[s.key]!
            const Icon = meta.icon
            return (
              <Row
                key={s.key}
                icon={
                  <RowIcon color={s.done ? 'var(--green)' : meta.color}>
                    {s.done ? <IconCheck size={18} /> : <Icon size={18} />}
                  </RowIcon>
                }
                wrap
                title={s.title}
                subtitle={s.detail ?? undefined}
                onClick={s.actionable ? () => runStep(s) : undefined}
                accessory={s.actionable ? <span className="ios-dim-3"><IconChevron size={18} /></span> : undefined}
              />
            )
          })}
        </List>
      </Section>

      {brief && (
        <Section header={tx.beforeRide}>
          <List>
            <Row
              icon={<RowIcon color="var(--orange)"><IconSun size={18} /></RowIcon>}
              title={tx.briefing}
              subtitle={brief.summary ? tx.briefingSummary(num(brief.summary.feels_c, 0), brief.summary.wind_kmh, brief.summary.precip_prob) : brief.location === null ? tx.briefingNoLocation : brief.loading ? tx.briefingLoading : tx.briefingNoForecast}
              onClick={() => setSheet('brief')}
              accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
            />
            {brief.advice.length > 0 && <Row wrap icon={<RowIcon color="var(--orange)"><IconTarget size={18} /></RowIcon>} title={brief.advice[0]!.message} onClick={() => setSheet('brief')} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />}
          </List>
        </Section>
      )}

      {warnings.length > 0 && (
        <Section header={tx.warnings}>
          <List>
            {warnings.map((w) => (
              <Row
                key={w.rule}
                wrap
                icon={<RowIcon color={w.severity === 'warn' ? 'var(--orange)' : 'var(--label-3)'}><IconTarget size={18} /></RowIcon>}
                title={w.message}
                accessory={
                  w.actions?.[0] ? (
                    <button className="ios-btn ios-btn-tinted ios-btn-sm shrink-0" onClick={() => void d.view.applyAction(w.actions![0]!)}>
                      {w.actions[0].label}
                    </button>
                  ) : undefined
                }
              />
            ))}
          </List>
        </Section>
      )}

      {d.view.overrides.length > 0 && (
        <Section header={tx.changes}>
          <List>
            {d.view.overrides.map((o) => (
              <Row key={o.id} icon={<RowIcon color="var(--indigo)"><IconTimer size={18} /></RowIcon>} title={(tx.override as Record<string, string>)[o.kind] ?? o.kind} accessory={<button className="ios-btn ios-btn-sm ios-btn-gray shrink-0" onClick={() => void d.view.undo(o.id)}>{t.common.undo}</button>} />
            ))}
          </List>
        </Section>
      )}

      {canChat && (
        <Section header={tx.coach} footer={tx.coachFooter}>
          <List>
            <Row icon={<RowIcon color="var(--indigo)"><IconHeart size={18} /></RowIcon>} title={tx.coachRow} onClick={() => setSheet('coach')} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />
          </List>
        </Section>
      )}

      <Section header={tx.nutrition} footer={day.nutrition.post_workout ?? undefined}>
        <List>
          <Row icon={<RowIcon color="var(--green)"><IconHeart size={18} /></RowIcon>} title={isToday ? t.common.today : tx.nutritionDay} subtitle={day.nutrition.label} value={tx.protein(day.protein_g)} />
          {day.nutrition.on_bike_carbs_g_per_h[1] > 0 && <Row icon={<RowIcon color="var(--yellow)"><IconBolt size={18} /></RowIcon>} title={tx.onBike} value={`${day.nutrition.on_bike_carbs_g_per_h[0]}–${day.nutrition.on_bike_carbs_g_per_h[1]} g/h`} />}
        </List>
      </Section>

      {sheet === 'checkin' && <CheckinSheet checkin={d.checkin} weighDue={d.weighDue} lastWeight={d.lastWeight} onClose={() => setSheet(null)} onSave={d.saveCheckin} />}
      {sheet === 'after' && (
        <AfterSheet
          log={d.rideLog}
          suggested={score != null && score < 70 ? 'modified' : 'done'}
          onClose={() => setSheet(null)}
          onSave={async (status, extra) => {
            await d.logRide(status, extra)
          }}
        />
      )}
      {sheet === 'coach' && <CoachSheet d={d} date={date} onClose={() => setSheet(null)} />}
      {sheet === 'brief' && brief && <BriefingSheet b={brief} onClose={() => setSheet(null)} onIndoor={() => { void d.view.applyAction({ kind: 'indoor', date, label: '', payload: {} }); setSheet(null) }} />}
    </Screen>
  )
}

/** Odsprzężenie moc:tętno – ile tętno „ucieka” przy stałej mocy w drugiej połowie jazdy. */
function decouplingNote(t: Messages, pct: number): string {
  const n = t.ios.day.decoupling
  if (pct < 5) return n.good
  if (pct < 10) return n.ok
  return n.high
}
