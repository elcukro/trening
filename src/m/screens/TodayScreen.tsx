import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { upsertSessionLog } from '@/db/repo'
import { addDays, isValidISODate } from '@/engine/dates'
import type { DayPlan } from '@/engine/plan'
import { useIosDay, useRideScore, type IosDay } from '@/day/useIos'
import { useBriefing, type Briefing } from '@/day/useBriefing'
import { rideVerdict, type DayPhase } from '@/day/dayState'
import { structureLabel } from '@/day/summary'
import { useToast } from '@/components/Toast'
import { fmtLong, todayISO } from '@/lib/dates'
import { minutes, num } from '@/lib/format'
import { DAY_TYPE_LABEL } from '@/lib/labels'
import { Btn, Card, Group, Row, Screen } from '../components/Chrome'
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

const LOGGED = ['done', 'modified', 'skipped']
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * Dziś (docs/24 § 4): jedna karta stanu, która zmienia się w ciągu dnia, pod nią oś dnia, żywienie i jutro.
 * Stany liczy `dayPhase` (czysty TS); dane dnia daje `useIosDay` – ten sam hook co w `/i`.
 */
export function TodayScreen() {
  const params = useParams()
  const today = todayISO()
  const date = params.date && isValidISODate(params.date) ? params.date : today
  const d = useIosDay(date)
  const day = d.day
  const toast = useToast()
  const navigate = useNavigate()
  const openCoach = useOpenCoach()
  const [sheet, setSheet] = useState<'checkin' | 'meal' | 'numbers' | null>(null)
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
    const status = log && LOGGED.includes(log.status) && log.status !== 'skipped' ? (log.status as 'done' | 'modified') : score != null && score < 70 ? 'modified' : 'done'
    await toast.run('Zapisuję RPE…', () => d.logRide(status, { rpe }), () => `RPE ${rpe} zapisane`)
  }
  async function unskip() {
    await toast.run('Przywracam…', async () => {
      await upsertSessionLog(date, 'bike', { status: 'planned', rpe: null })
      for (const o of d.view.overrides.filter((o) => o.kind === 'skip')) await d.view.undo(o.id)
    }, () => 'Trening wrócił do planu')
  }
  const sendBolt = () => void toast.run('Wysyłam na Bolta…', d.sendToBolt, (s) => (s === 'updated' ? 'Zaktualizowano na Bolcie. Zsynchronizuj licznik.' : 'Wysłano na Bolta. Zsynchronizuj licznik.'))

  return (
    <Screen title={isToday ? 'Dziś' : cap(fmtLong(date).split(',')[0]!)} subtitle={`${fmtLong(date)}${day ? ` · tydzień ${day.week}${day.week_type === 'deload' ? ' · lżejszy' : ''}` : ''}`} back={isToday ? undefined : '/m/plan'} day={color}>
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
          <p className="m-sub m-dim">Tego dnia nie ma w planie.</p>
        </Card>
      ) : (
        <StateCard phase={phase} day={day} d={d} brief={brief} score={score} onCoach={openCoach} onCheckin={() => setSheet('checkin')} onSteps={() => navigate(`/m/jazda/${date}`)} onSummary={() => navigate(`/m/podsumowanie/${date}`)} onBolt={sendBolt} onRpe={saveRpe} onUnskip={unskip} />
      )}

      {day && isToday && phase !== 'rest' && (
        <div className="px-1">
          <div className="m-dots" aria-label="Oś dnia">
            {d.flow.steps.map((s, i) => (
              <span key={s.key} className="contents">
                {i > 0 && <span className="m-dot-line" data-done={s.done} />}
                <span className="m-dot" data-done={s.done} title={s.title} />
              </span>
            ))}
          </div>
          <p className="m-foot m-dim mt-1.5">{d.flow.steps.map((s) => (s.key === 'checkin' ? 'check-in' : s.key === 'bolt' ? 'Bolt' : s.key === 'train' ? 'trening' : 'RPE')).join(' · ')}</p>
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
          <Row title="Żywienie" sub={day.nutrition.label} value={`${day.protein_g} g białka`} icon={<img src={ART.scale} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} />
          {lastRide && lastRide.date !== date && (
            <Row
              title="Ostatnia jazda"
              sub={`${fmtShort(lastRide.date)} · ${lastRide.name ?? 'Jazda'}`}
              value={`${num((lastRide.distance_m ?? 0) / 1000, 0)} km${lastRide.device_watts && lastRide.np_w ? ` · ${Math.round(lastRide.np_w)} W` : lastRide.avg_hr ? ` · ${Math.round(lastRide.avg_hr)} bpm` : ''}`}
              to={`/m/dzien/${lastRide.date}`}
              icon={<img src={ART.heart} alt="" width={28} height={28} className="h-7 w-7 object-contain" />}
            />
          )}
          {isToday && tomorrow && <Row title="Jutro" sub={tomorrow.bike ? `${tomorrow.bike.name} · ${minutes(tomorrow.bike.duration_min)}` : 'Wolne'} to={`/m/dzien/${tomorrow.date}`} icon={<img src={dayArt(tomorrow.day_type, tomorrow.flags.includes('test'))} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} />}
        </Group>
      )}

      {sheet === 'meal' && day && <MealSheet key={openMeal?.id ?? 'new'} date={date} meal={openMeal} proteinTarget={day.protein_g} onClose={() => setSheet(null)} />}
      {sheet === 'numbers' && <NumbersSheet onClose={() => setSheet(null)} />}
      {sheet === 'checkin' && <CheckinSheet checkin={d.checkin} lastWeight={d.lastWeight} onClose={() => setSheet(null)} onSave={d.saveCheckin} />}
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
  onRpe: (rpe: number) => Promise<void>
  onUnskip: () => Promise<void>
}

function StateCard(p: CardProps) {
  const { phase, day, d } = p
  const name = day.bike?.name ?? 'Dzień wolny'
  const eyebrow = day.flags.includes('test') ? 'Test' : day.bike ? DAY_TYPE_LABEL[day.day_type] : 'Wolne'
  const art = dayArt(day.day_type, day.flags.includes('test'))

  switch (phase) {
    case 'morning':
      return (
        <Card day>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-eyebrow" style={{ color: 'var(--day)' }}>
                Dzień dobry
              </p>
              <p className="m-title mt-1">Jak się czujesz?</p>
              <p className="m-sub m-dim mt-2">
                {day.bike ? `${name} · ${minutes(day.bike.duration_min)}` : 'Dziś wolne'}
                {d.lastWeight ? ` · ostatnia waga ${num(d.lastWeight.kg)} kg` : ''}
              </p>
            </div>
            <img src={ART.coachWave} alt="" width={84} height={112} className="-mt-2 -mr-2 h-28 w-[84px] shrink-0 object-contain" />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Btn onClick={() => p.onCoach(d.lastWeight ? `Waga ${num(d.lastWeight.kg)}, tętno ` : 'Waga ')} className="w-full">
              Powiedz trenerowi
            </Btn>
            <Btn soft onClick={p.onCheckin} className="w-full">
              Wpisz ręcznie
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
                {p.brief.summary ? `${num(p.brief.summary.feels_c, 0)} °C odczuwalne · wiatr ${p.brief.summary.wind_kmh} km/h · deszcz ${p.brief.summary.precip_prob} %` : p.brief.location === null ? 'Bez prognozy – ustaw miejscowość w Ja' : p.brief.loading ? 'Pobieram prognozę…' : 'Bez prognozy'}
                {p.brief.clothing && <span className="m-dim block truncate">{p.brief.clothing.label}</span>}
              </p>
            </div>
          )}
          {day.bike && d.bolt.kind !== 'na' && (
            <p className="m-sub mt-3 flex items-center gap-2">
              <img src={ART.bolt} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
              <span style={{ color: d.bolt.kind === 'ok' ? 'var(--green)' : d.bolt.kind === 'error' ? 'var(--red)' : 'var(--label-2)' }}>{d.bolt.kind === 'ok' ? 'Na liczniku' : d.bolt.kind === 'stale' ? 'Na liczniku jest stara wersja' : d.bolt.kind === 'error' ? `Bolt: ${d.bolt.error}` : 'Jeszcze nie na liczniku'}</span>
            </p>
          )}
          {phase === 'riding' && <p className="m-foot m-dim mt-3">Jazda w toku – czekam na import ze Stravy.</p>}
          <div className="mt-4 flex flex-col gap-2">
            {day.workout && (
              <Btn onClick={p.onSteps} className="w-full">
                Pokaż kroki
              </Btn>
            )}
            {phase !== 'riding' && day.bike && d.bolt.kind !== 'na' && d.bolt.kind !== 'ok' && (
              <Btn soft onClick={p.onBolt} className="w-full">
                Wyślij na Bolta
              </Btn>
            )}
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
            {verdict?.text ?? (phase === 'evening' ? 'Po treningu' : 'Jak poszło')}
          </p>
          <p className="m-title mt-1">{a?.name ?? name}</p>
          {a && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat value={p.score != null ? `${p.score} %` : '—'} label="zgodność" />
              <Stat value={load ? String(Math.round(load.tss)) : '—'} label="TSS" />
              <Stat value={a.decoupling_pct != null ? `${num(a.decoupling_pct)} %` : a.avg_hr ? `${Math.round(a.avg_hr)}` : '—'} label={a.decoupling_pct != null ? 'dryf tętna' : 'śr. tętno'} />
            </div>
          )}
          {note && <NoteExcerpt text={note} />}
          <div className="mt-4">
            <RpeRow value={rpe} onPick={(v) => void p.onRpe(v)} />
          </div>
          {a && (
            <Btn onClick={p.onSummary} className="mt-4 w-full">
              Podsumowanie
            </Btn>
          )}
          {phase === 'evening' && (
            <Btn soft onClick={() => p.onCoach()} className="mt-2 w-full">
              Powiedz trenerowi
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
                Wolne
              </p>
              <p className="m-title mt-1">Dziś odpoczynek</p>
              <p className="m-sub m-dim mt-2">Regeneracja jest częścią treningu. {day.nutrition.label}</p>
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
                Odpuszczone
              </p>
              <p className="m-title mt-1">{name}</p>
              {d.rideLog?.notes && <p className="m-sub m-dim mt-2">{d.rideLog.notes}</p>}
            </div>
            <img src={ART.rest} alt="" width={96} height={96} className="-mt-1 -mr-1 h-24 w-24 shrink-0 object-contain" />
          </div>
          <Btn soft onClick={() => void p.onUnskip()} className="mt-4 w-full">
            Cofnij
          </Btn>
        </Card>
      )
    case 'missed':
      return (
        <Card>
          <p className="m-eyebrow m-dim">Bez jazdy</p>
          <p className="m-title mt-1">{name}</p>
          <p className="m-sub m-dim mt-2">Tego dnia nie było treningu ani oznaczenia. Jeśli to decyzja, oznacz jako pominięte – raporty przestaną o to pytać.</p>
          <Btn soft onClick={() => void p.d.logRide('skipped')} className="mt-4 w-full">
            Oznacz jako pominięte
          </Btn>
        </Card>
      )
  }
}

/** Dwa pierwsze zdania notatki trenera; reszta po dotknięciu. */
function NoteExcerpt({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const short = sentences.slice(0, 2).join(' ').trim()
  const more = sentences.length > 2
  return (
    <p className="m-sub mt-3">
      {open || !more ? text : short}
      {more && (
        <button className="m-headline m-hit ml-1" style={{ color: 'var(--accent)' }} onClick={() => setOpen((v) => !v)}>
          {open ? 'mniej' : 'więcej'}
        </button>
      )}
    </p>
  )
}
