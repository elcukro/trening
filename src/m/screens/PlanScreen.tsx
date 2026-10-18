import { useNavigate, useParams } from 'react-router'
import { useWeekView } from '@/app/usePlan'
import { addDays, isValidISODate } from '@/engine/dates'
import { fmtRange, todayISO } from '@/lib/dates'
import { minutes } from '@/lib/format'
import { DAY_TYPE_LABEL, WEEKDAY_SHORT } from '@/lib/labels'
import { IconChevronLeft } from '@/ios/components/Icons'
import { Group, Row, Screen } from '../components/Chrome'

/** Plan – szkielet (krok 1 w docs/24): tydzień jako 7 wierszy; przewijanie gestem i menu dnia przyjdą w kroku 5. */
export function PlanScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const today = todayISO()
  const anchor = params.date && isValidISODate(params.date) ? params.date : today
  const { days, monday } = useWeekView(anchor)
  const sunday = addDays(monday, 6)
  const week = days[0]
  const sub = week ? `Tydzień ${week.week} · ${fmtRange(monday, sunday)} · ${week.phase_name}` : fmtRange(monday, sunday)

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
      <Group>
        {days.map((d) => (
          <Row
            key={d.date}
            to={`/m/dzien/${d.date}`}
            icon={<span className={`m-num w-9 text-center ${d.date === today ? 'font-bold' : ''}`} style={d.date === today ? { color: 'var(--accent)' } : undefined}>{WEEKDAY_SHORT[d.weekday]}<br /><span className="m-foot">{d.date.slice(8)}</span></span>}
            title={d.bike?.name ?? d.gym?.name ?? 'Wolne'}
            sub={d.bike ? DAY_TYPE_LABEL[d.day_type] : d.gym ? 'Siłownia' : undefined}
            value={d.bike ? minutes(d.bike.duration_min) : undefined}
          />
        ))}
      </Group>
      <p className="m-foot m-dim px-1">Szkielet nowego wyglądu. Przewijanie tygodni gestem, przenoszenie i zamiana dni – krok 5 w docs/24.</p>
    </Screen>
  )
}
