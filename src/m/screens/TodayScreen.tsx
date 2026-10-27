import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { upsertSessionLog } from '@/db/repo'
import { statusFromScore } from '@/engine/analysis'
import { addDays, isValidISODate } from '@/engine/dates'
import type { DayPlan } from '@/engine/plan'
import { useIosDay, useRideScore, type IosDay } from '@/day/useIos'
import { useBriefing, type Briefing } from '@/day/useBriefing'
import { rideVerdict, type DayPhase } from '@/day/dayState'
import { structureLabel } from '@/day/summary'
import { useAction, useToast } from '@/components/Toast'
import { fmtLong, todayISO } from '@/lib/dates'
import { minutes, num } from '@/lib/format'
import { DAY_TYPE_LABEL } from '@/lib/labels'
import { Btn, Card, Group, Row, Screen } from '../components/Chrome'
import { InboxBell, NavAvatar } from '../components/Inbox'
import { Waiting } from '../components/Waiting'
import { CheckinSheet } from '../components/CheckinSheet'
import { FoodCard } from '../components/FoodCard'
import { MealSheet } from '../components/MealSheet'
import { NumbersSheet } from '../components/SettingsSheets'
import { useMeals } from '@/day/useMeals'
import type { MealRow } from '@/db'
import { RpeRow, Stat, Targets, TONE_COLOR } from '../components/Bits'
import { dayColor } from '../dayColor'
import { useLastRide, useWeekState } from '../useWeek'
import { useDayPhase } from '../useDayPhase'
import { WeekStrip } from '../components/WeekStrip'
import { fmtShort } from '@/lib/dates'
import { ART, dayArt, weatherArt } from '../art'
import { useOpenCoach } from '../coach'
import { fromHealth, healthLine } from '@/day/health'
import { useT } from '@/i18n/react'

const LOGGED = ['done', 'modified', 'skipped']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Dziś (docs/24 § 4): jedna karta stanu, która zmienia się w ciągu dnia, pod nią oś dnia, żywienie i jutro.
 * Stany liczy `dayPhase` (czysty TS); dane dnia daje `useIosDay` – ten sam hook co w `/i`.
 */
export function TodayScreen() {
  const t = useT()
  const tt = t.m.today
  const params = useParams()
  const today = todayISO()
  const date = params.date && isValidISODate(params.date) ? params.date : today
  const d = useIosDay(date)
  const day = d.day
  const toast = useToast()
  const navigate = useNavigate()
  const openCoach = useOpenCoach()
  const [sheet, setSheet] = useState<'checkin' | 'meal' | 'numbers' | null>(null)
  const location = useLocation()
  // wpis ze skrzynki „Poranny check-in” otwiera arkusz od razu; po zamknięciu stan historii czyścimy, żeby Wstecz go nie powtarzał
  const askedCheckin = (location.state as { open?: string } | null)?.open === 'checkin'
  const closeCheckin = () => {
    setSheet(null)
    if (askedCheckin) void navigate(location.pathname + location.search, { replace: true, state: null })
  }
  const [openMeal, setOpenMeal] = useState<MealRow | undefined>(undefined)
  const food = useMeals(date, day, d)
  const brief = useBriefing(day, d.view.overrides.some((o) => o.kind === 'indoor'))
  const activity = d.activities[0]
  const score = useRideScore(activity, day, d.ftp)
  const isToday = date === today
  const phase: DayPhase = useDayPhase(d, date)
  const color = dayColor(day?.day_type, day?.flags.includes('test'))
  const tomorrow = d.view.window.find((x) => x.date === addDays(date, 1)) ?? null
  const week = useWeekState(date, d.view.window, today)
  const lastRide = useLastRide(date)
  const warn = d.view.warnings.filter((w) => w.severity === 'warn')

  async function saveRpe(rpe: number) {
    const log = d.rideLog
    const status = score != null ? statusFromScore(score) : log && LOGGED.includes(log.status) && log.status !== 'skipped' ? (log.status as 'done' | 'modified') : 'done'
    await toast.run(tt.rpeSaving, () => d.logRide(status, { rpe }), () => tt.rpeSaved(rpe), undefined, { quiet: true, errorTitle: tt.rpeFailed })
  }
  async function unskip() {
    await toast.run(tt.restoring, async () => {
      await upsertSessionLog(date, 'bike', { status: 'planned', rpe: null })
      for (const o of d.view.overrides.filter((x) => x.kind === 'skip')) await d.view.undo(o.id)
    }, () => tt.restored, undefined, { quiet: true })
  }
  // dzień bez jazdy oznaczony jako pominięty – odwracalne, więc bez pytania, za to z „Cofnij” (docs/27 § 6)
  async function markSkipped() {
    await toast.run(tt.marking, () => d.logRide('skipped'), () => tt.markedSkipped, () => ({ label: t.common.undo, onClick: () => void upsertSessionLog(date, 'bike', { status: 'planned' }) }), { quiet: true })
  }
  // wysyłka trwa kilka sekund – animacja na karcie zamiast komunikatu (docs/27 § 6)
  const bolt = useAction()
  const sendBolt = () => void bolt.run(d.sendToBolt, (s) => (s === 'updated' ? tt.boltUpdated : tt.boltSent), { errorTitle: tt.boltFailed })

  return (
    <Screen title={isToday ? t.common.today : cap(fmtLong(date).split(',')[0]!)} subtitle={`${fmtLong(date)}${day ? tt.weekPart(day.week, day.week_type === 'deload') : ''}`} back={isToday ? undefined : '/m/plan'} lead={<NavAvatar />} action={<InboxBell />} day={color}>
      {warn.length > 0 && (
        <div className="m-list p-3" style={{ background: 'rgb(255 204 0 / 0.18)' }}>
          <p className="m-sub">{warn[0]!.message}</p>
          {warn[0]!.actions?.[0] && (
            <button className="m-headline m-hit mt-1" style={{ color: 'var(--accent)' }} onClick={() => void d.view.applyAction(warn[0]!.actions![0]!)}>
              {warn[0]!.actions[0].label}
            </button>
          )}
        </div>
      )}

      {!day ? (
        <Card>
          <p className="m-sub m-dim">{tt.notInPlan}</p>
        </Card>
      ) : (
        <StateCard phase={phase} day={day} d={d} brief={brief} score={score} onCoach={openCoach} onCheckin={() => setSheet('checkin')} onSteps={() => navigate(`/m/jazda/${date}`)} onSummary={() => navigate(`/m/podsumowanie/${date}`)} onBolt={sendBolt} boltBusy={bolt.pending} onRpe={saveRpe} onUnskip={unskip} onSkip={markSkipped} />
      )}

      {/* oś kroków ma sens od dwóch kroków – dzień wolny przed check-inem miał samotną kropkę (docs/35 N3) */}
      {day && isToday && phase !== 'rest' && d.flow.steps.length > 1 && (
        <div className="px-1">
          <div className="m-dots" aria-label={tt.dayAxis}>
            {d.flow.steps.map((s, i) => (
              <span key={s.key} className="contents">
                {i > 0 && <span className="m-dot-line" data-done={s.done} />}
                <span className="m-dot" data-done={s.done} title={s.title} />
              </span>
            ))}
          </div>
          <p className="m-foot m-dim mt-1.5">{d.flow.steps.map((s) => (s.key === 'checkin' ? tt.flow.checkin : s.key === 'bolt' ? tt.flow.bolt : s.key === 'train' ? tt.flow.train : tt.flow.rpe)).join(' · ')}</p>
        </div>
      )}

      {day && isToday && <WeekStrip week={week} today={today} compact />}

      {day && food.enabled && (
        <FoodCard
          food={food}
          label={day.nutrition.label}
          onAdd={() => {
            setOpenMeal(undefined)
            setSheet('meal')
          }}
          onOpen={(m) => {
            setOpenMeal(m)
            setSheet('meal')
          }}
          onProfile={() => setSheet('numbers')}
        />
      )}

      {day && (
        <Group>
          <Row title={tt.nutrition} sub={day.nutrition.label} value={tt.protein(day.protein_g)} icon={<img src={ART.scale} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} />
          {lastRide && lastRide.date !== date && (
            <Row
              title={tt.lastRide}
              sub={`${fmtShort(lastRide.date)} · ${lastRide.name ?? t.m.me.rides.fallbackName}`}
              value={`${num((lastRide.distance_m ?? 0) / 1000, 0)} km${lastRide.device_watts && lastRide.np_w ? ` · ${Math.round(lastRide.np_w)} W` : lastRide.avg_hr ? ` · ${Math.round(lastRide.avg_hr)} bpm` : ''}`}
              to={`/m/dzien/${lastRide.date}`}
              icon={<img src={ART.heart} alt="" width={28} height={28} className="h-7 w-7 object-contain" />}
            />
          )}
          {isToday && tomorrow && <Row title={t.common.tomorrow} sub={tomorrow.bike ? `${tomorrow.bike.name} · ${minutes(tomorrow.bike.duration_min)}` : t.m.rest} to={`/m/dzien/${tomorrow.date}`} icon={<img src={dayArt(tomorrow.day_type, tomorrow.flags.includes('test'))} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} />}
        </Group>
      )}

      {sheet === 'meal' && day && <MealSheet key={openMeal?.id ?? 'new'} date={date} meal={openMeal} proteinTarget={day.protein_g} onClose={() => setSheet(null)} />}
      {sheet === 'numbers' && <NumbersSheet onClose={() => setSheet(null)} />}
      {(sheet === 'checkin' || askedCheckin) && <CheckinSheet checkin={d.checkin} lastWeight={d.lastWeight} onClose={closeCheckin} onSave={d.saveCheckin} />}
    </Screen>
  )
}

/* ------------------------------------------------------------------ karta stanu */

interface CardProps {
  phase: DayPhase
  day: DayPlan
  d: IosDay
  brief: Briefing | null
  score: number | null
  onCoach: (prefill?: string) => void
  onCheckin: () => void
  onSteps: () => void
  onSummary: () => void
  onBolt: () => void
  boltBusy: boolean
  onRpe: (rpe: number) => Promise<void>
  onUnskip: () => Promise<void>
  onSkip: () => Promise<void>
}

function StateCard(p: CardProps) {
  const t = useT()
  const tt = t.m.today
  const { phase, day, d } = p
  const name = day.bike?.name ?? tt.restDayName
  const eyebrow = day.flags.includes('test') ? tt.test : day.bike ? DAY_TYPE_LABEL[day.day_type] : t.m.rest
  const art = dayArt(day.day_type, day.flags.includes('test'))

  switch (phase) {
    case 'morning':
      return (
        <Card day>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-eyebrow" style={{ color: 'var(--day)' }}>
                {tt.morning.hello}
              </p>
              <p className="m-title mt-1">{tt.morning.howFeel}</p>
              <p className="m-sub m-dim mt-2">
                {day.bike ? `${name} · ${minutes(day.bike.duration_min)}` : tt.morning.restToday}
                {d.lastWeight && !fromHealth(d.checkin, 'weight_kg') ? tt.morning.lastWeight(num(d.lastWeight.kg)) : ''}
              </p>
              {/* Apple Health wypełnił już część check-inu – zostają nogi i samopoczucie (docs/27 § 2) */}
              {healthLine(d.checkin, (f) => fromHealth(d.checkin, f)) && <p className="m-foot mt-1" style={{ color: 'var(--label)' }}>{t.m.checkin.fromHealthLine(healthLine(d.checkin, (f) => fromHealth(d.checkin, f)))}</p>}
            </div>
            <img src={ART.coachWave} alt="" width={84} height={112} className="-mt-2 -mr-2 h-28 w-[84px] shrink-0 object-contain" />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Btn onClick={() => p.onCoach(tt.morning.coachPrefill(d.lastWeight ? num(d.lastWeight.kg) : null))} className="w-full">
              {tt.morning.tellCoach}
            </Btn>
            <Btn soft onClick={p.onCheckin} className="w-full">
              {tt.morning.manual}
            </Btn>
          </div>
        </Card>
      )
    case 'brief':
    case 'riding':
    case 'future':
      return (
        <Card day>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-eyebrow" style={{ color: 'var(--day)' }}>
                {eyebrow}
                {day.workout && structureLabel(day.workout) ? ` · ${structureLabel(day.workout)}` : ''}
              </p>
              <p className="m-title mt-1">{name}</p>
              {day.bike && <p className="m-big mt-2">{minutes(day.bike.duration_min)}</p>}
            </div>
            <img src={art} alt="" width={96} height={96} className="-mt-1 -mr-1 h-24 w-24 shrink-0 object-contain" />
          </div>
          {day.workout && <Targets day={day} />}
          {p.brief && (
            <div className="mt-4 flex items-center gap-3">
              <img src={weatherArt(p.brief.summary?.code, { night: p.brief.summary?.dark, windKmh: p.brief.summary?.wind_kmh })} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
              <p className="m-sub min-w-0">
                {p.brief.summary ? tt.weather.line(num(p.brief.summary.feels_c, 0), p.brief.summary.wind_kmh, p.brief.summary.precip_prob) : p.brief.location === null ? tt.weather.noLocation : p.brief.loading ? tt.weather.loading : tt.weather.none}
                {p.brief.clothing && <span className="m-dim block truncate">{p.brief.clothing.label}</span>}
              </p>
            </div>
          )}
          {day.bike && d.bolt.kind !== 'na' && (
            <p className="m-sub mt-3 flex items-center gap-2">
              <img src={ART.bolt} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
              <span style={{ color: d.bolt.kind === 'ok' ? 'var(--green)' : d.bolt.kind === 'error' ? 'var(--red)' : 'var(--label-2)' }}>{d.bolt.kind === 'ok' ? tt.bolt.ok : d.bolt.kind === 'stale' ? tt.bolt.stale : d.bolt.kind === 'error' ? tt.bolt.error(d.bolt.error) : tt.bolt.notYet}</span>
            </p>
          )}
          {phase === 'riding' && <p className="m-foot m-dim mt-3">{tt.riding}</p>}
          <div className="mt-4 flex flex-col gap-2">
            {day.workout && (
              <Btn onClick={p.onSteps} className="w-full">
                {tt.showSteps}
              </Btn>
            )}
            {phase !== 'riding' && day.bike && d.bolt.kind !== 'na' && (d.bolt.kind !== 'ok' || p.boltBusy) &&
              (p.boltBusy ? (
                <Waiting label={tt.bolt.sending} detail={tt.bolt.fewSeconds} size={96} />
              ) : (
                <Btn soft onClick={p.onBolt} className="w-full">
                  {tt.bolt.send}
                </Btn>
              ))}
          </div>
        </Card>
      )
    case 'after':
    case 'evening': {
      const a = d.activities[0]
      const load = a ? d.loadOf(a) : null
      const verdict = rideVerdict(p.score)
      const rpe = d.rideLog?.rpe
      const note = a?.note ?? null
      return (
        <Card day>
          <p className="m-eyebrow" style={{ color: verdict ? TONE_COLOR[verdict.tone] : 'var(--day)' }}>
            {verdict?.text ?? (!day.bike ? tt.after.extra : phase === 'evening' ? tt.after.evening : tt.after.howItWent)}
          </p>
          <p className="m-title mt-1">{a?.name ?? name}</p>
          {a && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {day.bike ? <Stat value={p.score != null ? `${p.score} %` : '—'} label={tt.after.compliance} /> : <Stat value={minutes(Math.round(a.moving_time_s / 60))} label={tt.after.time} />}
              <Stat value={load ? String(Math.round(load.tss)) : '—'} label="TSS" />
              <Stat value={a.decoupling_pct != null ? `${num(a.decoupling_pct)} %` : a.avg_hr ? `${Math.round(a.avg_hr)}` : '—'} label={a.decoupling_pct != null ? tt.after.hrDrift : tt.after.avgHr} />
            </div>
          )}
          {note && <NoteExcerpt text={note} />}
          <div className="mt-4">
            <RpeRow value={rpe} onPick={(v) => void p.onRpe(v)} />
          </div>
          {a && (
            <Btn onClick={p.onSummary} className="mt-4 w-full">
              {tt.after.summary}
            </Btn>
          )}
          {phase === 'evening' && (
            <Btn soft onClick={() => p.onCoach()} className="mt-2 w-full">
              {tt.morning.tellCoach}
            </Btn>
          )}
        </Card>
      )
    }
    case 'rest':
      return (
        <Card day>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-eyebrow" style={{ color: 'var(--day)' }}>
                {t.m.rest}
              </p>
              <p className="m-title mt-1">{tt.rest.title}</p>
              <p className="m-sub m-dim mt-2">
                {tt.rest.text} {day.nutrition.label}
              </p>
            </div>
            <img src={ART.rest} alt="" width={96} height={96} className="-mt-1 -mr-1 h-24 w-24 shrink-0 object-contain" />
          </div>
        </Card>
      )
    case 'skipped':
      return (
        <Card>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-eyebrow" style={{ color: 'var(--red)' }}>
                {tt.skipped}
              </p>
              <p className="m-title mt-1">{name}</p>
              {d.rideLog?.notes && <p className="m-sub m-dim mt-2">{d.rideLog.notes}</p>}
            </div>
            <img src={ART.rest} alt="" width={96} height={96} className="-mt-1 -mr-1 h-24 w-24 shrink-0 object-contain" />
          </div>
          <Btn soft onClick={() => void p.onUnskip()} className="mt-4 w-full">
            {t.common.undo}
          </Btn>
        </Card>
      )
    case 'missed':
      return (
        <Card>
          <p className="m-eyebrow m-dim">{tt.missed.eyebrow}</p>
          <p className="m-title mt-1">{name}</p>
          <p className="m-sub m-dim mt-2">{tt.missed.text}</p>
          <Btn soft onClick={() => void p.onSkip()} className="mt-4 w-full">
            {tt.missed.mark}
          </Btn>
        </Card>
      )
  }
}

/** Dwa pierwsze zdania notatki trenera; reszta po dotknięciu. */
function NoteExcerpt({ text }: { text: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const short = sentences.slice(0, 2).join(' ').trim()
  const more = sentences.length > 2
  return (
    <p className="m-sub mt-3">
      {open || !more ? text : short}
      {more && (
        <button className="m-headline m-hit ml-1" style={{ color: 'var(--accent)' }} onClick={() => setOpen((v) => !v)}>
          {open ? t.m.today.note.less : t.m.today.note.more}
        </button>
      )}
    </p>
  )
}
