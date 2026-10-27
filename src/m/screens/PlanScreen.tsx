import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router'
import { useWeekView } from '@/app/usePlan'
import { useEngine } from '@/app/useSettings'
import { db, type PlanOverrideRow } from '@/db'
import { addOverride, removeOverride, swapDays, upsertSessionLog } from '@/db/repo'
import { addDays, isValidISODate, mondayOf, type ISODate } from '@/engine/dates'
import type { DayPlan } from '@/engine/plan'
import type { CalendarDay } from '@/engine/types'
import type { DayOutcome } from '@/day/weekState'
import { useAction, useToast } from '@/components/Toast'
import { fmtRange, fmtShort, todayISO } from '@/lib/dates'
import { minutes } from '@/lib/format'
import { DAY_TYPE_LABEL, WEEKDAY_SHORT } from '@/lib/labels'
import { pushItemForDay, pushPayloadFor, wahoo } from '@/sync/wahoo'
import { supabase } from '@/sync/supabase'
import { IconChevronLeft } from '@/ios/components/Icons'
import { Btn, Group, Row, Screen } from '../components/Chrome'
import { WeekStrip } from '../components/WeekStrip'
import { WeekPager } from '../components/WeekPager'
import { DayMenuSheet, type DayAction } from '../components/DayMenuSheet'
import { ART, dayArt } from '../art'
import { useWeekState } from '../useWeek'
import { useLongPress } from '../useLongPress'
import { UserError, t as tr } from '@/i18n'
import { useT } from '@/i18n/react'

const MARK: Partial<Record<DayOutcome, { text: string; color: string }>> = {
  done: { text: '✓', color: 'var(--green)' },
  modified: { text: '✓', color: 'var(--orange)' },
  extra: { text: '+', color: 'var(--green)' },
  skipped: { text: '✕', color: 'var(--red)' },
  missed: { text: '–', color: 'var(--label-3)' },
}

interface Held {
  day: DayPlan
  window: CalendarDay[]
  overrides: PlanOverrideRow[]
}

/**
 * Plan (docs/24 § 4): tygodnie przewijane gestem (trzy panele ze snapem), bilans tygodnia, siedem dni z wynikiem.
 * Przytrzymanie dnia otwiera menu: przenieś (R15 z silnika), zamień, pomiń, pod dachem, cofnij. Każda zmiana kończy się
 * komunikatem z „Cofnij”; gdy plan odjechał od Bolta, nad listą jest baner z wysyłką tygodnia.
 */
export function PlanScreen() {
  const t = useT()
  const tp = t.m.plan
  const params = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const push = useAction()
  const today = todayISO()
  const anchor = params.date && isValidISODate(params.date) ? params.date : today
  const monday = mondayOf(anchor)
  const [held, setHeld] = useState<Held | null>(null)
  const { ctx, weeks } = useEngine()

  // `?today=` i `?hour=` zostają w adresie (podgląd i testy e2e)
  const go = useCallback((m: ISODate) => navigate(`/m/plan/${m}${typeof window === 'undefined' ? '' : window.location.search}`, { replace: true }), [navigate])

  async function pushWeek(from: ISODate) {
    if (!supabase) throw new UserError(tr().m.plan.needsAccount)
    const { items, remove } = await pushPayloadFor(from, 7, ctx, weeks)
    const res = await wahoo.push(items, 'update', remove)
    const errors = res.results.filter((r) => r.status === 'error')
    if (errors.length) {
      const e = errors[0]!.error
      if (e === 'not_connected' || !e) throw new UserError(e ? tr().m.plan.wahooNotConnected('trening.felsztukier.pl') : tr().m.plan.sendError)
      throw new Error(e)
    }
    return res.pushed
  }

  async function act(h: Held, a: DayAction) {
    setHeld(null)
    const date = h.day.date
    // zmiany planu są lokalne i natychmiastowe: bez „w toku”, wynik z „Cofnij” nad paskiem zakładek (docs/27 § 6)
    const quiet = { quiet: true, errorTitle: tp.changeFailed }
    const undoBtn = (fn: () => Promise<unknown>) => ({ label: t.common.undo, onClick: () => void toast.run(tp.undoing, fn, () => tp.restored, undefined, quiet) })
    switch (a.kind) {
      case 'move':
        await toast.run(
          tp.moving,
          () => addOverride(date, 'move', { to: a.to, what: 'bike' }),
          () => tp.moved(fmtShort(a.to)),
          (row) => undoBtn(() => removeOverride(row.id)),
          quiet,
        )
        break
      case 'swap':
        await toast.run(
          tp.swapping,
          () => swapDays(date, a.with),
          (r) => (r.outcome === 'undone' ? tp.swapUndone : tp.swapped(fmtShort(a.with))),
          (r) => (r.outcome === 'swapped' ? undoBtn(() => removeOverride(r.id)) : undefined),
          quiet,
        )
        break
      case 'indoor':
        await toast.run(
          tp.toIndoor,
          () => addOverride(date, 'indoor', {}),
          () => tp.indoorSet,
          (row) => undoBtn(() => removeOverride(row.id)),
          quiet,
        )
        break
      case 'skip': {
        await toast.run(
          tp.skipping,
          async () => {
            await upsertSessionLog(date, 'bike', { planned_workout_id: h.day.bike?.workout_id ?? null, status: 'skipped', rpe: null })
            return addOverride(date, 'skip', { what: 'bike' })
          },
          () => tp.skipped,
          (row) =>
            undoBtn(async () => {
              await removeOverride(row.id)
              await upsertSessionLog(date, 'bike', { status: 'planned' })
            }),
          quiet,
        )
        break
      }
      case 'undo':
        await toast.run(
          tp.undoingChanges,
          async () => {
            for (const id of a.ids) await removeOverride(id)
            const log = (await db.session_logs.where('[date+kind]').equals([date, 'bike']).toArray()).find((l) => !l.deleted_at)
            if (log?.status === 'skipped') await upsertSessionLog(date, 'bike', { status: 'planned' })
          },
          () => tp.restored,
          undefined,
          quiet,
        )
        break
    }
  }

  return (
    <Screen
      title={t.m.chrome.tabs.plan}
      action={
        <span className="flex">
          <button className="m-nav-btn" aria-label={tp.prevWeek} onClick={() => go(addDays(monday, -7))}>
            <IconChevronLeft size={22} />
          </button>
          <button className="m-nav-btn rotate-180" aria-label={tp.nextWeek} onClick={() => go(addDays(monday, 7))}>
            <IconChevronLeft size={22} />
          </button>
        </span>
      }
    >
      <WeekPager monday={monday} onChange={go} renderWeek={(m, current) => <WeekPanel key={m} monday={m} today={today} current={current} onHold={setHeld} pushing={push.pending} onPush={() => void push.run(() => pushWeek(m), (n) => tp.sent(n), { errorTitle: tp.weekPushFailed })} />} />
      <p className="m-foot m-dim px-1">{tp.hint}</p>
      {held && <DayMenuSheet day={held.day} window={held.window} overrides={held.overrides} today={today} onClose={() => setHeld(null)} onAction={(a) => void act(held, a)} />}
    </Screen>
  )
}

/* ------------------------------------------------------------------ jeden tydzień */

function WeekPanel({ monday, today, current, onHold, onPush, pushing }: { monday: ISODate; today: ISODate; current: boolean; onHold: (h: Held) => void; onPush: () => void; pushing: boolean }) {
  const t = useT()
  const { days, window } = useWeekView(addDays(monday, 3))
  const week = useWeekState(monday, window, today)
  const { ctx } = useEngine()
  const sunday = addDays(monday, 6)
  const overrides = useLiveQuery(async () => (await db.plan_overrides.where('date').between(monday, sunday, true, true).toArray()).filter((o) => !o.deleted_at), [monday, sunday], [] as PlanOverrideRow[])
  const first = days[0]
  const sub = first ? t.m.plan.weekSub(first.week, fmtRange(monday, sunday), first.phase_name, first.week_type === 'deload' ? 'deload' : first.week_type === 'test' ? 'test' : null) : fmtRange(monday, sunday)

  // dni, których wersja na Bolcie nie zgadza się z planem (po przeniesieniu, zamianie, pominięciu) – tylko od dziś
  const stale = days.filter((d) => {
    if (d.date < today || !d.bike) return false
    const item = pushItemForDay(d, ctx)
    const row = week.pushes.find((p) => p.date === d.date)
    return !!item && !!row?.external_id && row.external_id !== item.external_id
  })

  return (
    <div className="flex flex-col gap-4">
      <p className="m-sub m-dim px-1">{sub}</p>
      {first && <WeekStrip week={week} today={today} />}
      {current && stale.length > 0 && (
        <div className="m-card flex items-center gap-3 p-3" style={{ background: 'rgb(255 149 0 / 0.12)' }}>
          <img src={ART.bolt} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="m-sub min-w-0 flex-1">{t.m.plan.stale(stale.map((d) => WEEKDAY_SHORT[d.weekday]).join(', '))}</span>
          <Btn soft onClick={onPush} busy={pushing && t.m.plan.sending} className="shrink-0 !min-h-11 !px-3 text-[15px]">
            {t.m.plan.send}
          </Btn>
        </div>
      )}
      <Group>
        {days.map((d) => (
          <DayRow key={d.date} d={d} today={today} outcome={week.days.find((w) => w.date === d.date)} onHold={() => onHold({ day: d, window, overrides: overrides.filter((o) => o.date === d.date) })} />
        ))}
      </Group>
    </div>
  )
}

function DayRow({ d, today, outcome, onHold }: { d: DayPlan; today: ISODate; outcome: ReturnType<typeof useWeekState>['days'][number] | undefined; onHold: () => void }) {
  const t = useT()
  const { held, handlers } = useLongPress(onHold)
  const mark = outcome ? MARK[outcome.outcome] : undefined
  const isToday = d.date === today
  return (
    <div className="m-hold" data-held={held} {...handlers}>
      <Row
        to={`/m/dzien/${d.date}`}
        icon={
          <span className="flex items-center gap-2">
            <span className={`m-num w-7 text-center leading-tight ${isToday ? 'font-bold' : ''}`} style={isToday ? { color: 'var(--accent)' } : undefined}>
              {WEEKDAY_SHORT[d.weekday]}
              <br />
              <span className="m-foot">{d.date.slice(8)}</span>
            </span>
            <img src={d.bike ? dayArt(d.day_type, d.flags.includes('test')) : ART.rest} alt="" width={28} height={28} className="h-7 w-7 object-contain" style={!d.bike ? { opacity: 0.45 } : undefined} />
          </span>
        }
        title={<span className={d.day_type === 'key' || d.flags.includes('test') ? 'font-semibold' : ''}>{d.bike?.name ?? t.m.rest}</span>}
        sub={
          d.bike ? (
            <>
              {minutes(d.bike.duration_min)} · {DAY_TYPE_LABEL[d.day_type]}
              {d.flags.includes('test') ? <span style={{ color: 'var(--red)' }}>{t.m.plan.test}</span> : d.day_type === 'key' ? <span style={{ color: 'var(--orange)' }}> · ★</span> : null}
              {outcome?.on_bolt ? t.m.plan.onBolt : ''}
            </>
          ) : undefined
        }
        value={
          mark ? (
            <span className="m-headline w-5 text-center" style={{ color: mark.color }}>
              {mark.text}
            </span>
          ) : undefined
        }
      />
    </div>
  )
}
