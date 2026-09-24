import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type StravaActivity } from '@/db'
import { useRangeView } from '@/app/usePlan'
import { useDailyLoad } from '@/app/useLoad'
import { addDays, isValidISODate, mondayOf } from '@/engine/dates'
import { plannedTss } from '@/engine/pmc'
import { fmtRange, todayISO } from '@/lib/dates'
import { minutes } from '@/lib/format'
import { DAY_TYPE_COLOR, DAY_TYPE_LABEL, WEEKDAY_LONG } from '@/lib/labels'
import { Card, List, Row, Screen, Section, Stat } from '../components/Chrome'
import { SyncBanner } from '../components/SyncBanner'
import { IconCheck, IconChevron, IconChevronLeft } from '../components/Icons'

const WEEKDAY_TITLE: Record<string, string> = { mon: 'Poniedziałek', tue: 'Wtorek', wed: 'Środa', thu: 'Czwartek', fri: 'Piątek', sat: 'Sobota', sun: 'Niedziela' }

/** Tydzień: siedem wierszy, obciążenie plan vs wykonanie, przełączanie tygodni strzałkami. */
export function WeekScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const today = todayISO()
  const monday = mondayOf(params.monday && isValidISODate(params.monday) ? params.monday : today)
  const sunday = addDays(monday, 6)
  const view = useRangeView(monday, sunday)
  const { actual } = useDailyLoad(120)
  const acts = useLiveQuery(async () => (await db.strava_activities.where('date').between(monday, sunday, true, true).toArray()).filter((a) => !a.deleted_at && a.is_ride), [monday, sunday], [] as StravaActivity[])

  const totals = useMemo(() => {
    let planned = 0
    let done = 0
    let plannedMin = 0
    let doneMin = 0
    for (const d of view.days) {
      planned += plannedTss(d, view.engine.ctx.program)
      plannedMin += d.bike?.duration_min ?? 0
      if (d.date <= today) done += actual.get(d.date) ?? 0
    }
    for (const a of acts) doneMin += Math.round(a.moving_time_s / 60)
    return { planned: Math.round(planned), done: Math.round(done), plannedMin, doneMin }
  }, [view.days, view.engine.ctx.program, actual, acts, today])

  const week = view.days[0]?.week ?? 0
  const pct = totals.planned > 0 ? Math.min(100, Math.round((totals.done / totals.planned) * 100)) : 0

  function statusOf(date: string) {
    const log = view.logs.find((l) => l.date === date && l.kind === 'bike' && !l.deleted_at)
    const gym = view.logs.find((l) => l.date === date && l.kind === 'gym' && !l.deleted_at)
    const s = log?.status ?? gym?.status
    if (s === 'done') return { color: 'var(--green)', label: 'zrobione' }
    if (s === 'modified') return { color: 'var(--orange)', label: 'inaczej' }
    if (s === 'skipped') return { color: 'var(--red)', label: 'odpuszczone' }
    if (acts.some((a) => a.date === date)) return { color: 'var(--green)', label: 'jazda zapisana' }
    return null
  }

  return (
    <Screen
      title="Tydzień"
      subtitle={`${week > 0 ? `Tydzień ${week} · ` : ''}${fmtRange(monday, sunday)}`}
      action={
        <span className="flex items-center">
          <button className="ios-nav-action" aria-label="Poprzedni tydzień" onClick={() => navigate(`/i/tydzien/${addDays(monday, -7)}`)}>
            <IconChevronLeft size={20} />
          </button>
          <button className="ios-nav-action" aria-label="Następny tydzień" onClick={() => navigate(`/i/tydzien/${addDays(monday, 7)}`)}>
            <IconChevron size={20} />
          </button>
        </span>
      }
    >
      <SyncBanner />
      <Card className="mb-6">
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat value={totals.done} unit="TSS" label={`z ${totals.planned} w planie`} />
            <Stat value={minutes(totals.doneMin)} label={`z ${minutes(totals.plannedMin)} w planie`} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--fill)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--green)' : 'var(--blue)' }} />
            </div>
            <span className="ios-caption ios-dim ios-num shrink-0">{pct} %</span>
          </div>
        </div>
      </Card>

      <Section header="Dni" footer="Dotknij dzień, żeby otworzyć jego ekran.">
        <List>
          {view.days.map((d) => {
            const st = statusOf(d.date)
            const label = d.bike ? d.bike.name : d.gym ? d.gym.name : 'Wolne'
            const detail = [d.bike ? minutes(d.bike.duration_min) : null, d.gym && d.bike ? 'siłownia' : null, d.day_type !== 'rest' ? DAY_TYPE_LABEL[d.day_type] : null].filter(Boolean).join(' · ')
            return (
              <Row
                key={d.date}
                onClick={() => navigate(`/i/dzien/${d.date}`)}
                icon={
                  <span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg" style={{ background: d.date === today ? 'var(--blue)' : 'var(--fill)', color: d.date === today ? '#fff' : 'var(--label-2)' }}>
                    <span className="ios-num text-[15px] leading-4 font-semibold">{d.date.slice(8)}</span>
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DAY_TYPE_COLOR[d.day_type]}`} aria-hidden />
                    <span className="truncate">{label}</span>
                  </span>
                }
                subtitle={`${WEEKDAY_TITLE[d.weekday] ?? WEEKDAY_LONG[d.weekday]}${detail ? ` · ${detail}` : ''}`}
                accessory={
                  <span className="flex shrink-0 items-center gap-1">
                    {st && <span style={{ color: st.color }} title={st.label}><IconCheck size={18} /></span>}
                    <span className="ios-dim-3"><IconChevron size={18} /></span>
                  </span>
                }
              />
            )
          })}
        </List>
      </Section>

      {view.days[0]?.week_notes && (
        <Section header="Uwagi do tygodnia">
          <List>
            <Row wrap title={view.days[0].week_notes} />
          </List>
        </Section>
      )}
    </Screen>
  )
}
