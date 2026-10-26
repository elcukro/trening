import { useNavigate } from 'react-router'
import type { WeekState } from '@/day/weekState'
import { minutes } from '@/lib/format'
import { WEEKDAY_SHORT } from '@/lib/labels'
import { useT } from '@/i18n/react'

const OUTCOME_STYLE: Record<WeekState['days'][number]['outcome'], { bg: string; border: string }> = {
  done: { bg: 'var(--green)', border: 'var(--green)' },
  modified: { bg: 'var(--orange)', border: 'var(--orange)' },
  extra: { bg: 'var(--green)', border: 'var(--green)' },
  skipped: { bg: 'transparent', border: 'var(--red)' },
  missed: { bg: 'transparent', border: 'var(--label-3)' },
  today: { bg: 'var(--accent-soft)', border: 'var(--accent)' },
  planned: { bg: 'var(--fill)', border: 'transparent' },
  free: { bg: 'transparent', border: 'transparent' },
}

/**
 * Tydzień w jednym spojrzeniu: siedem słupków (wysokość = czas z planu, kolor = wynik dnia) i bilans godzin.
 * Zielony = zrobione, pomarańczowy = inaczej niż w planie, czerwona ramka = pominięte, szara = bez jazdy, niebieski = dziś.
 */
export function WeekStrip({ week, today, compact = false }: { week: WeekState; today: string; compact?: boolean }) {
  const t = useT()
  const navigate = useNavigate()
  const max = Math.max(60, ...week.days.map((d) => Math.max(d.planned_min, d.done_min)))
  return (
    <button className="m-card m-press w-full p-4 text-left" onClick={() => navigate('/m/plan')} aria-label={t.m.week.openPlan}>
      <div className="flex items-baseline justify-between">
        <span className="m-headline">{compact ? t.m.week.thisWeek : t.m.week.balance}</span>
        <span className="m-sub m-num m-dim">
          {week.done_min > 0 ? (
            <>
              {minutes(week.done_min)} <span className="m-dim-3">{t.m.week.of}</span> {minutes(week.planned_min)}
            </>
          ) : (
            <>{t.m.week.planned(minutes(week.planned_min))}</>
          )}
        </span>
      </div>
      <div className="mt-3 flex items-end gap-1.5" style={{ height: compact ? 44 : 56 }}>
        {week.days.map((d) => {
          const h = Math.max(6, Math.round(((d.outcome === 'done' || d.outcome === 'modified' || d.outcome === 'extra' ? Math.max(d.done_min, d.planned_min * 0.3) : d.planned_min) / max) * (compact ? 44 : 56)))
          const st = OUTCOME_STYLE[d.outcome]
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
              {d.planned_min === 0 && d.outcome !== 'extra' ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--label-3)' }} /> : <span className="w-full rounded-md" style={{ height: h, background: st.bg, boxShadow: `inset 0 0 0 2px ${st.border}` }} />}
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {week.days.map((d) => (
          <span key={d.date} className="m-foot flex-1 text-center" style={{ color: d.date === today ? 'var(--accent)' : 'var(--label-2)', fontWeight: d.date === today ? 700 : 500 }}>
            {WEEKDAY_SHORT[d.weekday]}
          </span>
        ))}
      </div>
      {!compact && (
        <p className="m-foot m-dim mt-2">
          {t.m.week.workoutsDone(week.rides_done, week.rides_planned)}
          {week.days.some((d) => d.key) ? t.m.week.keySession(week.days.find((d) => d.key)?.name ?? '') : ''}
        </p>
      )}
    </button>
  )
}
