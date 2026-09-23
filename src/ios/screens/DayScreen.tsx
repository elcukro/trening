import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { isValidISODate } from '@/engine/dates'
import type { DayPlan } from '@/engine/plan'
import type { ResolvedWorkout } from '@/engine/types'
import { useToast } from '@/components/Toast'
import { fmtLong, todayISO } from '@/lib/dates'
import { minutes, num } from '@/lib/format'
import { DAY_TYPE_LABEL } from '@/lib/labels'
import { zoneColor } from '@/lib/zones'
import { useIosDay, useRideScore } from '../useIos'
import { useBriefing } from '../useBriefing'
import { rideVerdict, type DayStep } from '../dayState'
import { mainTarget, structureLabel } from '../summary'
import { Btn, Card, List, Pill, Row, RowIcon, Screen, Section, Stat } from '../components/Chrome'
import { IconBike, IconBolt, IconCheck, IconChevron, IconFlag, IconGym, IconHeart, IconRest, IconSun, IconTarget, IconTimer, IconWatch } from '../components/Icons'
import { CheckinSheet } from '../components/CheckinSheet'
import { AfterSheet } from '../components/AfterSheet'
import { BriefingSheet } from '../components/BriefingSheet'

const WEEKDAY_TITLE: Record<string, string> = { mon: 'Poniedziałek', tue: 'Wtorek', wed: 'Środa', thu: 'Czwartek', fri: 'Piątek', sat: 'Sobota', sun: 'Niedziela' }

/** Pasek stref treningu – szerokość proporcjonalna do czasu kroku. */
function Timeline({ workout }: { workout: ResolvedWorkout }) {
  const total = workout.steps.reduce((a, s) => a + s.duration_s, 0) || 1
  return (
    <div className="flex h-2 w-full gap-px overflow-hidden rounded-full" role="img" aria-label="Struktura treningu">
      {workout.steps.map((s, i) => (
        <div key={i} className={zoneColor(s.zone)} style={{ width: `${(s.duration_s / total) * 100}%` }} />
      ))}
    </div>
  )
}

function StatusPill({ status, hasActivity }: { status: string | undefined; hasActivity: boolean }) {
  if (status === 'done') return <Pill color="#fff" bg="var(--green)">Zrobione</Pill>
  if (status === 'modified') return <Pill color="#fff" bg="var(--orange)">Inaczej</Pill>
  if (status === 'skipped') return <Pill color="#fff" bg="var(--red)">Odpuszczone</Pill>
  if (status === 'in_progress') return <Pill color="#fff" bg="var(--blue)">W trakcie</Pill>
  if (hasActivity) return <Pill color="#fff" bg="var(--green)">Jazda zapisana</Pill>
  return null
}

function HeroRide({ day, status, hasActivity, onOpen }: { day: DayPlan; status: string | undefined; hasActivity: boolean; onOpen: () => void }) {
  const w = day.workout!
  const t = mainTarget(w)
  const structure = structureLabel(w)
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
        {t && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat size="sm" value={t.watts ? `${t.watts[0]}–${t.watts[1]}` : t.zone} unit={t.watts ? 'W' : undefined} label={t.watts ? 'moc' : 'strefa'} />
            <Stat size="sm" value={t.bpm ? `${t.bpm[0]}–${t.bpm[1]}` : `${t.rpe[0]}–${t.rpe[1]}`} unit={t.bpm ? 'bpm' : 'RPE'} label={t.bpm ? 'tętno' : 'odczucie'} />
            <Stat size="sm" value={t.cadence ? `${t.cadence[0]}–${t.cadence[1]}` : '—'} unit={t.cadence ? 'rpm' : undefined} label="kadencja" />
          </div>
        )}
      </div>
    </Card>
  )
}

function HeroGym({ day, status, onOpen }: { day: DayPlan; status: string | undefined; onOpen: () => void }) {
  const g = day.gym!
  return (
    <Card onClick={onOpen} className="mb-4">
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <RowIcon color="var(--purple)">
            <IconGym size={18} />
          </RowIcon>
          <Pill>Siłownia</Pill>
          <span className="ml-auto flex items-center gap-2">
            <StatusPill status={status} hasActivity={false} />
            <span className="ios-dim-3">
              <IconChevron size={18} />
            </span>
          </span>
        </div>
        <h2 className="ios-title2">{g.name}</h2>
        <p className="ios-num mt-0.5 text-[15px] tracking-[-0.2px]" style={{ color: 'var(--label-2)' }}>
          około {g.est_min} min · {g.items.length} ćwiczeń
        </p>
      </div>
    </Card>
  )
}

function HeroRest({ day }: { day: DayPlan }) {
  return (
    <Card className="mb-4">
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <RowIcon color="var(--label-3)">
            <IconRest size={18} />
          </RowIcon>
          <Pill>Wolne</Pill>
        </div>
        <h2 className="ios-title2">Dzień wolny</h2>
        <p className="ios-subhead ios-dim mt-1">{day.gym ? 'Bez roweru – tylko siłownia.' : 'Odpoczynek jest częścią planu. Spacer, sen, kilka minut rozciągania zginaczy bioder.'}</p>
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
  const [sheet, setSheet] = useState<'checkin' | 'after' | 'brief' | null>(null)
  const [sending, setSending] = useState(false)

  const day = d.day
  const title = isToday ? 'Dziś' : (WEEKDAY_TITLE[day?.weekday ?? ''] ?? 'Dzień')

  if (!day) {
    return (
      <Screen title={title} subtitle={fmtLong(date)} back={isToday ? undefined : () => navigate(-1)}>
        <Section footer="Plan obejmuje tylko dni programu. Zmień daty w ustawieniach pełnej aplikacji.">
          <List>
            <Row title="Ten dzień jest poza planem" />
          </List>
        </Section>
      </Screen>
    )
  }

  async function send() {
    setSending(true)
    try {
      await toast.run('Wysyłam na Bolta…', d.sendToBolt, (s) => (s === 'updated' ? 'Zaktualizowano na Bolcie. Zsynchronizuj licznik.' : 'Wysłano na Bolta. Zsynchronizuj licznik.'))
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
        return day!.bike ? navigate(`/i/trening/${date}`) : navigate(`/silownia/${date}`)
      case 'log':
        return setSheet('after')
    }
  }

  const next = d.flow.next
  const allDone = d.flow.progress.total > 0 && d.flow.progress.done === d.flow.progress.total
  const nextLabel: Record<string, string> = {
    checkin: 'Zrób check-in',
    bolt: 'Wyślij na Bolta',
    train: day.bike ? 'Pokaż trening' : 'Otwórz tryb siłowni',
    log: 'Jak poszło?',
  }

  const rideStatus = d.rideLog?.status
  const verdict = rideVerdict(score)
  const act = d.activities[0]
  const totalMovingS = d.activities.reduce((s, a) => s + a.moving_time_s, 0)
  const warnings = d.view.warnings

  return (
    <Screen title={title} subtitle={`${fmtLong(date)} · tydzień ${day.week}`} back={isToday ? undefined : () => navigate(-1)}>
      {day.bike && day.workout ? (
        <HeroRide day={day} status={rideStatus} hasActivity={d.activities.length > 0} onOpen={() => navigate(`/i/trening/${date}`)} />
      ) : day.gym ? (
        <HeroGym day={day} status={d.gymLog?.status} onOpen={() => navigate(`/silownia/${date}`)} />
      ) : (
        <HeroRest day={day} />
      )}
      {day.bike && day.gym && <HeroGym day={day} status={d.gymLog?.status} onOpen={() => navigate(`/silownia/${date}`)} />}

      {next ? (
        <div className="mb-8 px-4">
          <Btn className="w-full" onClick={() => runStep(next)} disabled={sending && next.key === 'bolt'}>
            {nextLabel[next.key]}
          </Btn>
        </div>
      ) : allDone ? (
        <div className="mb-8 px-4">
          <div className="ios-card flex items-center justify-center gap-2 px-4 py-3" style={{ color: 'var(--green)' }}>
            <IconCheck size={20} />
            <span className="ios-headline">Wszystko na dziś zrobione</span>
          </div>
        </div>
      ) : (
        <div className="mb-8" />
      )}

      {act && (
        <Section header="Po treningu" footer={verdict ? undefined : act.has_streams ? 'Zgodność z planem policzy się po pobraniu strumieni.' : undefined}>
          <Card>
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="ios-headline truncate">{act.name ?? 'Jazda'}</span>
                {verdict && (
                  <Pill color="#fff" bg={verdict.tone === 'good' ? 'var(--green)' : verdict.tone === 'ok' ? 'var(--orange)' : 'var(--red)'}>
                    {score} %
                  </Pill>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Stat size="sm" value={Math.round(totalMovingS / 60)} unit="min" label="czas" />
                <Stat size="sm" value={act.device_watts && (act.np_w || act.avg_watts) ? (act.np_w ?? act.avg_watts) : act.avg_hr ? act.avg_hr : '—'} unit={act.device_watts && (act.np_w || act.avg_watts) ? 'W' : act.avg_hr ? 'bpm' : undefined} label={act.device_watts && act.np_w ? 'NP' : act.device_watts ? 'śr. moc' : 'śr. tętno'} />
                <Stat size="sm" value={act.distance_m ? num(act.distance_m / 1000, 1) : '—'} unit={act.distance_m ? 'km' : undefined} label="dystans" />
                <Stat size="sm" value={d.load?.tss ?? '—'} label="TSS" />
              </div>
              {verdict && <p className="ios-foot ios-dim mt-3">{verdict.text}</p>}
              {act.decoupling_pct != null && (
                <p className="ios-foot ios-dim mt-1">
                  Pw:HR {num(act.decoupling_pct, 1)} % {act.decoupling_pct < 5 ? '· bardzo dobra baza tlenowa' : '· tętno rosło przy stałej mocy'}
                </p>
              )}
            </div>
          </Card>
        </Section>
      )}

      <Section header="Dzisiaj">
        <List>
          {d.flow.steps.map((s) => {
            const gymStep = s.key === 'train' && !day.bike && !!day.gym
            const meta = gymStep ? { color: 'var(--purple)', icon: IconGym } : STEP_ICON[s.key]!
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
        <Section header="Przed wyjazdem">
          <List>
            <Row
              icon={<RowIcon color="var(--orange)"><IconSun size={18} /></RowIcon>}
              title="Odprawa"
              subtitle={brief.summary ? `${num(brief.summary.feels_c, 0)} °C odczuwalne · wiatr ${brief.summary.wind_kmh} km/h · deszcz ${brief.summary.precip_prob} %` : brief.loading ? 'Pobieram prognozę…' : 'Bez prognozy – ubiór i jedzenie z planu'}
              onClick={() => setSheet('brief')}
              accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
            />
            {brief.advice.length > 0 && <Row wrap icon={<RowIcon color="var(--orange)"><IconTarget size={18} /></RowIcon>} title={brief.advice[0]!.message} onClick={() => setSheet('brief')} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />}
          </List>
        </Section>
      )}

      {warnings.length > 0 && (
        <Section header="Uwagi">
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
        <Section header="Zmiany w planie">
          <List>
            {d.view.overrides.map((o) => (
              <Row key={o.id} icon={<RowIcon color="var(--indigo)"><IconTimer size={18} /></RowIcon>} title={OVERRIDE_LABEL[o.kind] ?? o.kind} accessory={<button className="ios-btn ios-btn-sm ios-btn-gray shrink-0" onClick={() => void d.view.undo(o.id)}>Cofnij</button>} />
            ))}
          </List>
        </Section>
      )}

      <Section header="Żywienie" footer={day.nutrition.post_workout ?? undefined}>
        <List>
          <Row icon={<RowIcon color="var(--green)"><IconHeart size={18} /></RowIcon>} title="Dziś" subtitle={day.nutrition.label} value={`${day.protein_g} g białka`} />
          {day.nutrition.on_bike_carbs_g_per_h[1] > 0 && <Row icon={<RowIcon color="var(--yellow)"><IconBolt size={18} /></RowIcon>} title="Na rowerze" value={`${day.nutrition.on_bike_carbs_g_per_h[0]}–${day.nutrition.on_bike_carbs_g_per_h[1]} g/h`} />}
        </List>
      </Section>

      {sheet === 'checkin' && <CheckinSheet checkin={d.checkin} weighDue={d.weighDue} onClose={() => setSheet(null)} onSave={d.saveCheckin} />}
      {sheet === 'after' && (
        <AfterSheet
          log={day.bike ? d.rideLog : d.gymLog}
          suggested={score != null && score < 70 ? 'modified' : 'done'}
          onClose={() => setSheet(null)}
          onSave={async (status, extra) => {
            await d.logRide(status, extra)
          }}
        />
      )}
      {sheet === 'brief' && brief && <BriefingSheet b={brief} onClose={() => setSheet(null)} onIndoor={() => { void d.view.applyAction({ kind: 'indoor', date, label: '', payload: {} }); setSheet(null) }} />}
    </Screen>
  )
}

const OVERRIDE_LABEL: Record<string, string> = {
  indoor: 'Trening pod dachem',
  sick: 'Dostosowane do choroby',
  downgrade: 'Obniżony dzień',
  skip: 'Trening pominięty',
  swap: 'Dni zamienione',
  move: 'Trening przeniesiony',
}
