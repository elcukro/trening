import { useParams } from 'react-router'
import { isValidISODate } from '@/engine/dates'
import { useIosDay } from '@/day/useIos'
import { fmtLong, todayISO } from '@/lib/dates'
import { minutes } from '@/lib/format'
import { DAY_TYPE_LABEL } from '@/lib/labels'
import { Card, Screen } from '../components/Chrome'
import { dayColor } from '../dayColor'

/**
 * Dziś – szkielet (krok 1 w docs/24): karta dnia w kolorze dnia i oś dnia z czterech kropek.
 * Karta stanu z siedmioma stanami (morning → brief → riding → after → evening) przyjdzie w kroku 2.
 */
export function TodayScreen() {
  const params = useParams()
  const today = todayISO()
  const date = params.date && isValidISODate(params.date) ? params.date : today
  const d = useIosDay(date)
  const day = d.day
  const color = dayColor(day?.day_type, day?.flags.includes('test'))
  const isToday = date === today

  return (
    <Screen title={isToday ? 'Dziś' : fmtLong(date).split(',')[0]!} subtitle={`${fmtLong(date)}${day ? ` · tydzień ${day.week}` : ''}`} back={isToday ? undefined : '/m/plan'} day={color}>
      {day ? (
        <Card day>
          <p className="m-eyebrow" style={{ color: 'var(--day)' }}>
            {day.bike ? DAY_TYPE_LABEL[day.day_type] : day.gym ? 'Siłownia' : 'Wolne'}
          </p>
          <p className="m-title mt-1">{day.bike?.name ?? day.gym?.name ?? 'Dzień wolny'}</p>
          {day.bike && <p className="m-big mt-3">{minutes(day.bike.duration_min)}</p>}
          <div className="m-dots mt-5" aria-label="Oś dnia">
            {d.flow.steps.map((s, i) => (
              <span key={s.key} className="contents">
                {i > 0 && <span className="m-dot-line" data-done={s.done} />}
                <span className="m-dot" data-done={s.done} title={s.title} />
              </span>
            ))}
          </div>
          <p className="m-foot m-dim mt-2">{d.flow.steps.map((s) => s.title.replace('Poranny ', '')).join(' · ')}</p>
        </Card>
      ) : (
        <Card>
          <p className="m-sub m-dim">Tego dnia nie ma w planie.</p>
        </Card>
      )}
      <p className="m-foot m-dim px-1">Szkielet nowego wyglądu (docs/24). Karta stanu dnia, odprawa, kroki jazdy i podsumowanie – kroki 2 i 4.</p>
    </Screen>
  )
}
