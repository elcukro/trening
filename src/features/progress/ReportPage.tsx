import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Checkin, type KeyValueRow, type StravaActivity } from '@/db'
import { useRangeView } from '@/app/usePlan'
import { useDailyLoad } from '@/app/useLoad'
import { addDays, isValidISODate, mondayOf, type ISODate } from '@/engine/dates'
import { rangeReport, weeksIn, weightChange, type DayOutcome, type ReportDay } from '@/engine/report'
import { effectiveLthr } from '@/engine/progress'
import { cadenceTrend, lowCadenceWarning } from '@/engine/cadence'
import { ZoneBar } from '@/features/today/StravaCard'
import { Badge, Button, Card, CardSection, CardTitle, Empty, Inset, PageTitle, Row } from '@/components/ui'
import { hours, minutes, num } from '@/lib/format'
import { addMonths, fmtDayMonth, fmtMonth, fmtRange, monthEnd, monthStart, todayISO } from '@/lib/dates'
import { WEEKDAY_SHORT } from '@/lib/labels'

const OUTCOME: Record<DayOutcome, { label: string; cls: string }> = {
  done: { label: 'wykonane', cls: 'bg-emerald-500 text-white' },
  modified: { label: 'zmienione', cls: 'bg-amber-500 text-white' },
  skipped: { label: 'pominięte', cls: 'bg-red-500 text-white' },
  missed: { label: 'brak wpisu', cls: 'bg-slate-400 text-white' },
  extra: { label: 'dodatkowa', cls: 'bg-sky-500 text-white' },
  upcoming: { label: 'przed nami', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  rest: { label: '', cls: '' },
}

/** Przegląd tygodnia (`/postep/tydzien/:monday`) albo miesiąca (`/postep/miesiac/:YYYY-MM`) – pkt 5 planu. */
export function ReportPage({ kind }: { kind: 'week' | 'month' }) {
  const params = useParams()
  const today = todayISO()
  const raw = kind === 'week' ? (params.monday ?? mondayOf(today)) : `${params.month ?? today.slice(0, 7)}-01`
  const valid = isValidISODate(raw)
  const from = kind === 'week' ? mondayOf(valid ? raw : today) : monthStart(valid ? raw : today)
  const to = kind === 'week' ? addDays(from, 6) : monthEnd(from)
  return <Report kind={kind} from={from} to={to} today={today} />
}

function Report({ kind, from, to, today }: { kind: 'week' | 'month'; from: ISODate; to: ISODate; today: ISODate }) {
  const navigate = useNavigate()
  const view = useRangeView(from, to)
  const nextView = useRangeView(addDays(to, 1), addDays(to, 7))
  const { actual } = useDailyLoad(kind === 'week' ? 60 : 130)
  const acts = useLiveQuery(() => db.strava_activities.where('date').between(from, to, true, true).toArray(), [from, to], [] as StravaActivity[])
  const checkins = useLiveQuery(() => db.checkins.where('date').between(addDays(from, -7), to, true, true).toArray(), [from, to], [] as Checkin[])
  const analyses = useLiveQuery(async () => (await db.kv.where('key').startsWith('analysis:').toArray()) as KeyValueRow[], [], [] as KeyValueRow[])
  const { program, settings } = view.engine.ctx

  const scores = useMemo(() => {
    const m = new Map<ISODate, number>()
    for (const a of acts) {
      const s = (analyses.find((k) => k.key === `analysis:${a.id}`)?.value as { score: number | null } | undefined)?.score
      if (s != null && !a.deleted_at) m.set(a.date, s)
    }
    return m
  }, [acts, analyses])
  const report = useMemo(() => rangeReport({ from, to, today, days: view.days, program, logs: view.logs, tss: actual, scores }), [from, to, today, view.days, view.logs, program, actual, scores])
  const weight = useMemo(() => weightChange(checkins.filter((c) => !c.deleted_at), from, to), [checkins, from, to])
  const lthr = effectiveLthr(to, settings.lthr_bpm, (view.engine.ctx.tests ?? []).filter((t): t is { date: string; lthr_bpm: number } => !!t.lthr_bpm)).lthr
  const zoneHist = useMemo(() => {
    const h: number[] = []
    for (const a of acts) {
      if (a.deleted_at || !a.is_ride || !a.hr_histogram) continue
      a.hr_histogram.forEach((v, i) => {
        if (v) h[i] = (h[i] ?? 0) + v
      })
    }
    return h.length ? Array.from(h, (v) => v ?? 0) : null
  }, [acts])
  const cadAll = useLiveQuery(() => db.strava_activities.where('date').between(addDays(from, -21), to, true, true).toArray(), [from, to], [] as StravaActivity[])
  const cadTrend = useMemo(() => cadenceTrend(cadAll.filter((a) => !a.deleted_at && a.is_ride), to, kind === 'week' ? 3 : 6), [cadAll, to, kind])
  const cadWarning = useMemo(() => lowCadenceWarning(cadTrend, program.cadence), [cadTrend, program.cadence])
  const cadThis = cadTrend.at(-1)?.avg_rpm ?? null
  const nextKey = nextView.days.find((d) => d.day_type === 'key' && d.bike)
  const weekNo = view.days[0]?.week
  const title = kind === 'week' ? `Przegląd tygodnia${weekNo != null ? ` ${weekNo}` : ''}` : `Przegląd miesiąca`
  const sub = kind === 'week' ? fmtRange(from, to) : fmtMonth(from)
  const go = (delta: number) => navigate(kind === 'week' ? `/postep/tydzien/${addDays(from, 7 * delta)}` : `/postep/miesiac/${addMonths(from, delta).slice(0, 7)}`)
  const inFuture = from > today

  return (
    <div className="space-y-3">
      <nav className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => go(-1)} className="w-11 px-0 text-xl" ariaLabel={kind === 'week' ? 'Poprzedni tydzień' : 'Poprzedni miesiąc'}>
          ‹
        </Button>
        <div className="min-w-0 flex-1">
          <PageTitle sub={sub}>{title}</PageTitle>
        </div>
        <Button variant="ghost" onClick={() => go(1)} className="w-11 px-0 text-xl" ariaLabel={kind === 'week' ? 'Następny tydzień' : 'Następny miesiąc'}>
          ›
        </Button>
      </nav>
      {view.days.length === 0 && <Empty>Ten okres jest poza planem.</Empty>}
      {inFuture && view.days.length > 0 && <Inset tone="info">Ten okres dopiero się zacznie – poniżej sam plan.</Inset>}

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="min-w-0 space-y-3 lg:space-y-4">
          <Card>
            <CardTitle icon="📋">Podsumowanie</CardTitle>
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat value={`${hours(report.done_min)}`} label={`z ${hours(report.planned_min)} planowanych`} />
              <Stat value={`${report.done_tss} TSS`} label={`z ${report.planned_tss} planowanych`} />
              <Stat value={`${report.bike_done}/${report.bike_planned}`} label={`jazd${report.extra_rides ? ` (+${report.extra_rides} dodatk.)` : ''}`} />
              <Stat value={`${report.gym_done}/${report.gym_planned}`} label="siłowni" />
            </div>
            <div className="mt-2 divide-y divide-slate-100 tabular-nums dark:divide-slate-700/80">
              <Row label="Zgodność z planem (kroki w celu)">{report.score != null ? `${report.score} %` : 'brak analiz'}</Row>
              <Row label="Kadencja (śr.)">{cadThis != null ? `${cadThis} rpm` : '—'}</Row>
              <Row label="Masa (śr. 7 dni)">
                {weight.end != null ? `${num(weight.end)} kg` : '—'}
                {weight.delta != null ? ` (${weight.delta > 0 ? '+' : ''}${num(weight.delta)} kg)` : ''}
              </Row>
            </div>
            {cadWarning && (
              <Inset tone="warn" className="mt-2 text-xs">
                {cadWarning}
              </Inset>
            )}
            {zoneHist && lthr ? (
              <CardSection>
                <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Czas w strefach (Strava, LTHR {lthr})</p>
                <ZoneBar histogram={zoneHist} zones={program.hr_zones_lthr_fraction} lthr={lthr} />
              </CardSection>
            ) : null}
          </Card>

          {report.issues.length > 0 && (
            <Card tone="warn">
              <CardTitle icon="⚠️">Co poszło nie tak</CardTitle>
              <ul className="space-y-1 text-sm">
                {report.issues.map((d) => (
                  <li key={d.date} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">{fmtDayMonth(d.date)}</span>
                    {d.bike !== 'done' && d.bike !== 'rest' && d.bike !== 'upcoming' && d.bike !== 'extra' && (
                      <span>
                        🚴 {d.bike_name}{d.key ? ' (klucz)' : ''} – {OUTCOME[d.bike].label}
                      </span>
                    )}
                    {(d.gym === 'skipped' || d.gym === 'missed') && <span>🏋️ {d.gym_name} – {OUTCOME[d.gym].label}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Opuszczona jednostka przepada – nie nadrabiaj jej w kolejnym tygodniu (R2). Brak wpisu? Odhacz w dniu treningu, żeby raport i forma były prawdziwe.</p>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-3 lg:space-y-4">
          {kind === 'week' ? (
            <Card>
              <CardTitle icon="🗓️">Dzień po dniu</CardTitle>
              <ul className="divide-y divide-slate-100 dark:divide-slate-700/80">
                {report.days.map((d) => (
                  <DayRow key={d.date} d={d} />
                ))}
              </ul>
            </Card>
          ) : (
            <Card>
              <CardTitle icon="🗓️">Tygodnie</CardTitle>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700/80">
                {weeksIn(from, to).map((m) => {
                  const wk = report.days.filter((d) => d.date >= m && d.date <= addDays(m, 6))
                  const done = wk.reduce((a, d) => a + (d.tss_done ?? 0), 0)
                  const plan = wk.reduce((a, d) => a + d.tss_planned, 0)
                  const rides = wk.filter((d) => d.bike === 'done' || d.bike === 'modified').length
                  const planned = wk.filter((d) => d.bike_name).length
                  return (
                    <li key={m} className="py-1.5">
                      <Link to={`/postep/tydzien/${m}`} className="flex items-baseline justify-between gap-2 hover:text-sky-700 dark:hover:text-sky-300">
                        <span>
                          Tydzień {wk[0]?.day?.week ?? '–'} <span className="text-xs text-slate-500 dark:text-slate-400">{fmtRange(m, addDays(m, 6))}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {rides}/{planned} jazd · {done}/{plan} TSS
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          {kind === 'week' && nextView.days.length > 0 && (
            <Card tone="accent">
              <CardTitle icon="➡️">Przyszły tydzień</CardTitle>
              {nextKey ? (
                <p className="text-sm">
                  Trening kluczowy: <b>{nextKey.bike!.name}</b> ({WEEKDAY_SHORT[nextKey.weekday]} {fmtDayMonth(nextKey.date)}, {minutes(nextKey.bike!.duration_min)}). Zaplanuj go tak, żeby dzień wcześniej nogi były świeże.
                </p>
              ) : (
                <p className="text-sm">Bez treningu kluczowego – tydzień lżejszy.</p>
              )}
              <ul className="mt-2 flex flex-wrap gap-1 text-xs">
                {nextView.days.map((d) => (
                  <li key={d.date} className={`rounded-lg px-2 py-1 ${d.day_type === 'key' ? 'bg-red-100 font-semibold text-red-800 dark:bg-red-900/50 dark:text-red-100' : 'bg-white/70 dark:bg-slate-800/70'}`}>
                    {WEEKDAY_SHORT[d.weekday]} {d.bike ? `🚴 ${minutes(d.bike.duration_min)}` : d.gym ? '🏋️' : '—'}
                  </li>
                ))}
              </ul>
              <Link to={`/tydzien/${addDays(to, 1)}`} className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
                Otwórz tydzień →
              </Link>
            </Card>
          )}
          {kind === 'week' && (
            <Link to={`/postep/miesiac/${from.slice(0, 7)}`} className="block text-center text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
              Przegląd miesiąca →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function DayRow({ d }: { d: ReportDay }) {
  const o = OUTCOME[d.bike]
  return (
    <li className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-2 py-1.5 text-sm ${d.key ? 'border-l-4 border-l-red-500 pl-2' : ''}`}>
      <span className="text-xs font-semibold uppercase text-slate-500 tabular-nums dark:text-slate-400">
        {d.day ? WEEKDAY_SHORT[d.day.weekday] : ''} {d.date.slice(8)}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{d.bike_name ? `🚴 ${d.bike_name}` : d.bike === 'extra' ? '🚴 jazda poza planem' : d.gym_name ? '' : '🛋️ wolne'}</span>
        {d.gym_name && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">🏋️ {d.gym_name}{d.gym !== 'rest' && d.gym !== 'upcoming' ? ` · ${OUTCOME[d.gym].label}` : ''}</span>}
      </span>
      <span className="flex flex-col items-end gap-0.5 text-xs tabular-nums">
        {o.label && <Badge color={o.cls}>{o.label}</Badge>}
        {(d.tss_done != null || d.score != null) && (
          <span className="text-slate-500 dark:text-slate-400">
            {d.tss_done != null ? `${d.tss_done} TSS` : ''}
            {d.score != null ? ` · ${d.score} %` : ''}
          </span>
        )}
      </span>
    </li>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-100 p-3 dark:bg-slate-900/60">
      <div className="truncate text-xl font-bold tabular-nums">{value}</div>
      <div className="truncate text-xs text-slate-500 dark:text-slate-400" title={label}>
        {label}
      </div>
    </div>
  )
}
