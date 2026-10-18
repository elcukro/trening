import { useNavigate, useParams } from 'react-router'
import { useWeekView } from '@/app/usePlan'
import { addDays, isValidISODate } from '@/engine/dates'
import { fmtRange, todayISO } from '@/lib/dates'
import { minutes } from '@/lib/format'
import { DAY_TYPE_LABEL, WEEKDAY_SHORT } from '@/lib/labels'
import { IconChevronLeft } from '@/ios/components/Icons'
import { Group, Row, Screen } from '../components/Chrome'
import { WeekStrip } from '../components/WeekStrip'
import { ART, dayArt } from '../art'
import { useWeekState } from '../useWeek'
import type { DayOutcome } from '@/day/weekState'

const MARK: Partial<Record<DayOutcome, { text: string; color: string }>> = {
  done: { text: '✓', color: 'var(--green)' },
  modified: { text: '✓', color: 'var(--orange)' },
  extra: { text: '+', color: 'var(--green)' },
  skipped: { text: '✕', color: 'var(--red)' },
  missed: { text: '–', color: 'var(--label-3)' },
}

/** Plan: bilans tygodnia na górze, siedem dni z ikoną typu, czasem i wynikiem; strzałki zmieniają tydzień (gest – krok 5). */
export function PlanScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const today = todayISO()
  const anchor = params.date && isValidISODate(params.date) ? params.date : today
  const { days, monday, window } = useWeekView(anchor)
  const week = useWeekState(anchor, window, today)
  const sunday = addDays(monday, 6)
  const first = days[0]
  const sub = first ? `Tydzień ${first.week} · ${fmtRange(monday, sunday)} · ${first.phase_name}${first.week_type === 'deload' ? ' · lżejszy' : first.week_type === 'test' ? ' · test' : ''}` : fmtRange(monday, sunday)

  return (
    <Screen
      title="Plan"
      subtitle={sub}
      action={
        <span className="flex">
          <button className="m-nav-btn" aria-label="Poprzedni tydzień" onClick={() => navigate(`/m/plan/${addDays(monday, -7)}`)}>
            <IconChevronLeft size={22} />
          </button>
          <button className="m-nav-btn rotate-180" aria-label="Następny tydzień" onClick={() => navigate(`/m/plan/${addDays(monday, 7)}`)}>
            <IconChevronLeft size={22} />
          </button>
        </span>
      }
    >
      {first && <WeekStrip week={week} today={today} />}
      <Group>
        {days.map((d) => {
          const st = week.days.find((w) => w.date === d.date)
          const mark = st ? MARK[st.outcome] : undefined
          const isToday = d.date === today
          return (
            <Row
              key={d.date}
              to={`/m/dzien/${d.date}`}
              icon={
                <span className="flex items-center gap-2">
                  <span className={`m-num w-7 text-center leading-tight ${isToday ? 'font-bold' : ''}`} style={isToday ? { color: 'var(--accent)' } : undefined}>
                    {WEEKDAY_SHORT[d.weekday]}
                    <br />
                    <span className="m-foot">{d.date.slice(8)}</span>
                  </span>
                  <img src={d.bike || d.gym ? dayArt(d.day_type, d.flags.includes('test')) : ART.rest} alt="" width={28} height={28} className="h-7 w-7 object-contain" style={!d.bike && !d.gym ? { opacity: 0.45 } : undefined} />
                </span>
              }
              title={<span className={d.day_type === 'key' || d.flags.includes('test') ? 'font-semibold' : ''}>{d.bike?.name ?? d.gym?.name ?? 'Wolne'}</span>}
              sub={
                d.bike ? (
                  <>
                    {minutes(d.bike.duration_min)} · {DAY_TYPE_LABEL[d.day_type]}
                    {d.flags.includes('test') ? <span style={{ color: 'var(--red)' }}> · test</span> : d.day_type === 'key' ? <span style={{ color: 'var(--orange)' }}> · ★ klucz</span> : null}
                    {st?.on_bolt ? ' · na Bolcie' : ''}
                  </>
                ) : d.gym ? (
                  'Siłownia'
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
          )
        })}
      </Group>
      <p className="m-foot m-dim px-1">Dotknij dnia, żeby zobaczyć kartę. Przewijanie tygodni gestem, przenoszenie i zamiana dni – krok 5 w docs/24.</p>
    </Screen>
  )
}
