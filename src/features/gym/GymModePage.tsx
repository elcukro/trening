import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEngine } from '@/app/useSettings'
import { getDayPlan } from '@/engine/plan'
import { isValidISODate } from '@/engine/dates'
import { epley1RM, suggestLoad, warmupSets, type LoadSuggestion } from '@/engine/load'
import { tonnage } from '@/engine/progress'
import type { GymItem, GymSession } from '@/engine/schema'
import { db, newId, type SessionLog, type SetLog } from '@/db'
import { exerciseHistory, putSet, setsForSession, softDelete, upsertSessionLog } from '@/db/repo'
import { Button, Card, Empty } from '@/components/ui'
import { num, seconds } from '@/lib/format'
import { rxLabel } from '@/features/today/GymItems'
import { buildSequence, isLoggable, parseReps, parseRir, setsOf, type SeqStep } from './sequence'
import { useRestTimer, useWakeLock } from './useRestTimer'

const MAIN_LIFTS = ['back_squat', 'trap_bar_deadlift', 'hip_thrust', 'step_up', 'rdl', 'bulgarian_split_squat']
const inputCls = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-2 text-center text-lg font-semibold tabular-nums dark:border-slate-600 dark:bg-slate-900'

function useGymLog(date: string) {
  return useLiveQuery(async () => (await db.session_logs.where('[date+kind]').equals([date, 'gym']).toArray()).find((r) => !r.deleted_at), [date])
}

export function GymModePage() {
  const { date = '' } = useParams()
  const engine = useEngine()
  const navigate = useNavigate()
  const day = isValidISODate(date) ? getDayPlan(date, engine.ctx, engine.weeks) : null
  const log = useGymLog(date)
  const setsQ = useLiveQuery(async () => (log ? { logId: log.id, rows: await setsForSession(log.id) } : undefined), [log?.id])
  const [started, setStarted] = useState(false)
  const timer = useRestTimer()
  const sessionActive = !!log && log.status === 'in_progress'
  useWakeLock(sessionActive)

  if (!day || !day.gym) return <Empty>Na ten dzień nie ma sesji siłowej.</Empty>
  const session = day.gym

  async function start() {
    timer.unlock()
    await upsertSessionLog(date, 'gym', { planned_workout_id: session.session, status: 'in_progress' })
    setStarted(true)
  }

  if (!log || log.status === 'planned' || log.status === 'skipped') {
    return (
      <div className="safe-top mx-auto max-w-lg space-y-3 px-4 pt-3 pb-8">
        <Link to={`/dzien/${date}`} className="text-sm text-sky-600">
          ‹ Wróć
        </Link>
        <h1 className="text-2xl font-bold">{session.name}</h1>
        <p className="text-sm text-slate-500">~{session.est_min} min · {session.items.filter(isLoggable).length} ćwiczeń</p>
        <Card>
          <h2 className="mb-2 font-semibold">Rozgrzewka (10–12 min)</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {engine.ctx.program.exercises.mobility_circuit?.cues.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </Card>
        <Button onClick={start} className="w-full text-base">
          ▶ Start sesji
        </Button>
        <p className="text-xs text-slate-400">Ekran nie zgaśnie w trakcie sesji. Serie zapisują się lokalnie, bez sieci; synchronizacja po powrocie zasięgu.</p>
      </div>
    )
  }

  if (!setsQ || setsQ.logId !== log.id) return null
  return <ActiveSession key={log.id} date={date} session={session} log={log} sets={setsQ.rows} timer={timer} week={day.week} deload={day.week_type === 'deload'} justStarted={started} onFinish={() => navigate(`/dzien/${date}`)} />
}

function ActiveSession({ date, session, log, sets, timer, week, deload, justStarted, onFinish }: { date: string; session: GymSession; log: SessionLog; sets: SetLog[]; timer: ReturnType<typeof useRestTimer>; week: number; deload: boolean; justStarted: boolean; onFinish: () => void }) {
  const engine = useEngine()
  const program = engine.ctx.program
  const seq = useMemo(() => buildSequence(session), [session])
  const doneKeys = useMemo(() => new Set(sets.map((s) => `${s.exercise_id}#${s.set_no}`)), [sets])
  const firstOpen = seq.findIndex((st) => !doneKeys.has(`${session.items[st.itemIndex]!.exercise}#${st.setNo}`))
  const [idx, setIdx] = useState<number>(() => (firstOpen < 0 ? seq.length : firstOpen))
  const [showSummary, setShowSummary] = useState(log.status === 'done' || log.status === 'modified')
  // ostatnio zapisane wartości per ćwiczenie – domyślne dla kolejnej serii (zanim liveQuery odświeży `sets`)
  const [lastLogged, setLastLogged] = useState<Record<string, { weight: string; reps: string; rir: string }>>({})
  useEffect(() => {
    if (justStarted) setIdx(firstOpen < 0 ? seq.length : firstOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justStarted])

  const step: SeqStep | undefined = seq[idx]
  const allDone = firstOpen < 0
  const progressPct = Math.round((seq.filter((st) => doneKeys.has(`${session.items[st.itemIndex]!.exercise}#${st.setNo}`)).length / seq.length) * 100)

  if (showSummary || (!step && allDone)) {
    return <Summary date={date} session={session} log={log} sets={sets} week={week} deload={deload} onBack={() => { setShowSummary(false); setIdx(Math.max(0, seq.length - 1)) }} onFinish={onFinish} />
  }
  if (!step) return <Empty>Wszystkie serie odhaczone.</Empty>

  return (
    <div className="safe-top mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-2 pb-6">
      <header className="mb-2 flex items-center justify-between text-sm">
        <Link to={`/dzien/${date}`} className="min-h-11 py-2 text-sky-600">
          ‹ Dzień
        </Link>
        <span className="text-slate-500">{session.session} · {progressPct}%</span>
        <button className="min-h-11 py-2 text-sky-600" onClick={() => setShowSummary(true)}>
          Podsumuj
        </button>
      </header>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
        <div className="h-full bg-sky-500" style={{ width: `${progressPct}%` }} />
      </div>
      <ExerciseStep
        key={`${step.itemIndex}-${step.setNo}`}
        step={step}
        session={session}
        log={log}
        sets={sets}
        week={week}
        deload={deload}
        last={lastLogged[session.items[step.itemIndex]!.exercise]}
        onLogged={(rest, values) => {
          if (values) setLastLogged((m) => ({ ...m, [session.items[step.itemIndex]!.exercise]: values }))
          if (rest) timer.start(rest)
          setIdx((i) => Math.min(i + 1, seq.length))
        }}
      />
      <nav className="mt-auto flex justify-between pt-3 text-sm">
        <button className="min-h-11 px-2 text-slate-500 disabled:opacity-30" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
          ‹ Poprzednia seria
        </button>
        <button className="min-h-11 px-2 text-slate-500" onClick={() => setIdx((i) => Math.min(i + 1, seq.length - 1))}>
          Dalej ›
        </button>
      </nav>
      {timer.remaining !== null && <RestOverlay remaining={timer.remaining} total={timer.total} onSkip={timer.stop} onAdd={() => timer.add(30)} />}
      {!program.exercises[session.items[step.itemIndex]!.exercise] && <p className="text-xs text-red-500">Nieznane ćwiczenie</p>}
    </div>
  )
}

type LastValues = { weight: string; reps: string; rir: string }

function ExerciseStep({ step, session, log, sets, week, deload, last: lastValues, onLogged }: { step: SeqStep; session: GymSession; log: SessionLog; sets: SetLog[]; week: number; deload: boolean; last?: LastValues; onLogged: (rest: number | null, values?: LastValues) => void }) {
  const engine = useEngine()
  const item: GymItem = session.items[step.itemIndex]!
  const ex = engine.ctx.program.exercises[item.exercise]
  const loggable = isLoggable(item)
  const mySets = sets.filter((s) => s.exercise_id === item.exercise)
  const existing = mySets.find((s) => s.set_no === step.setNo)
  const targetReps = parseReps(item.rx.reps)
  const targetRir = parseRir(item.rx.rir)
  const history = useLiveQuery(async () => (await exerciseHistory(item.exercise)).filter((h) => h.session_log_id !== log.id), [item.exercise, log.id], [])
  const suggestion: LoadSuggestion | null = useMemo(() => {
    if (!loggable || targetReps == null) return null
    return suggestLoad(
      item.exercise,
      history.map((h) => ({ date: h.date, rx: { sets: h.sets.length, reps: h.sets[0]?.reps ?? targetReps, rir: targetRir }, sets: h.sets.map((s) => ({ weight_kg: s.weight_kg ?? 0, reps: s.reps ?? 0, rir: s.rir })) })),
      { sets: setsOf(item), reps: targetReps, rir: targetRir },
      { deload, intro: week <= 2 },
    )
  }, [history, item, loggable, targetReps, targetRir, deload, week])
  const prevSet = mySets.filter((s) => s.set_no < step.setNo).at(-1)
  const defaultWeight = existing?.weight_kg ?? prevSet?.weight_kg ?? (lastValues ? Number(lastValues.weight.replace(',', '.')) || null : null) ?? suggestion?.weight_kg ?? null
  const [weight, setWeight] = useState(defaultWeight != null ? String(defaultWeight) : '')
  const [reps, setReps] = useState(existing?.reps != null ? String(existing.reps) : targetReps != null ? String(targetReps) : (lastValues?.reps ?? ''))
  const [rir, setRir] = useState(existing?.rir != null ? String(existing.rir) : targetRir != null ? String(targetRir) : (lastValues?.rir ?? ''))
  const [showCues, setShowCues] = useState(false)
  const last = history.at(-1)

  async function logSet() {
    const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
    await putSet({ id: existing?.id ?? newId(), session_log_id: log.id, exercise_id: item.exercise, set_no: step.setNo, weight_kg: loggable ? n(weight) : null, reps: loggable ? n(reps) : null, rir: loggable ? n(rir) : null, is_warmup: false })
    onLogged(item.rx.rest_s ?? (loggable ? 60 : null), loggable ? { weight, reps, rir } : undefined)
  }

  return (
    <div className="flex-1 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {item.block ? `Blok ${item.block}` : ''} {item.circuit ? '· obwód' : ''} {step.groupIndexes.length > 1 ? '· superseria' : ''}
        </p>
        <h1 className="text-2xl font-bold leading-tight">{ex?.name ?? item.exercise}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {rxLabel(item.rx)}
          {item.rx.load_hint && <> · {item.rx.load_hint}</>}
        </p>
        {item.rx.note && <p className="text-xs text-slate-500">{item.rx.note}</p>}
      </div>
      {step.groupIndexes.length > 1 && (
        <p className="text-xs text-slate-500">
          Naprzemiennie z: {step.groupIndexes.filter((i) => i !== step.itemIndex).map((i) => engine.ctx.program.exercises[session.items[i]!.exercise]?.name ?? session.items[i]!.exercise).join(', ')}
        </p>
      )}
      {loggable && (
        <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-700/50">
          {suggestion && (
            <p>
              <b>Sugestia: {suggestion.weight_kg != null ? `${num(suggestion.weight_kg)} kg` : 'ustal ciężar startowy'}</b>
              <span className="block text-xs text-slate-500">{suggestion.reason}</span>
            </p>
          )}
          {last && (
            <p className="mt-1 text-xs text-slate-500">
              Ostatnio ({last.date}): {last.sets.map((s) => `${num(s.weight_kg ?? 0)}×${s.reps ?? '–'}${s.rir != null ? `@${s.rir}` : ''}`).join(', ')}
            </p>
          )}
          {item.block === '1' && step.setNo === 1 && weight && Number(weight.replace(',', '.')) > 20 && (
            <p className="mt-1 text-xs text-slate-500">Serie wstępne: {warmupSets(Number(weight.replace(',', '.'))).map((w) => `${num(w.weight_kg)}×${w.reps}`).join(' → ')}</p>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
        <p className="mb-2 text-sm font-semibold">
          Seria {step.setNo} z {step.totalSets}
          {existing && <span className="ml-2 text-xs font-normal text-emerald-600">zapisana – możesz poprawić</span>}
        </p>
        {loggable ? (
          <div className="grid grid-cols-3 gap-2">
            <label className="text-center text-xs text-slate-500">
              {ex?.load_unit === 'min' ? 'min' : 'kg'}
              <input className={inputCls} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </label>
            <label className="text-center text-xs text-slate-500">
              powt.
              <input className={inputCls} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
            </label>
            <label className="text-center text-xs text-slate-500">
              RIR
              <input className={inputCls} inputMode="numeric" value={rir} onChange={(e) => setRir(e.target.value)} />
            </label>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{item.rx.note ?? 'Odhacz po wykonaniu.'}</p>
        )}
        <Button onClick={logSet} className="mt-3 w-full text-base">
          ✓ {existing ? 'Zapisz poprawkę' : 'Zalicz serię'}
          {item.rx.rest_s ? ` · przerwa ${seconds(item.rx.rest_s)}` : ''}
        </Button>
      </div>
      {mySets.length > 0 && (
        <ul className="flex flex-wrap gap-1 text-xs">
          {mySets.map((s) => (
            <li key={s.id} className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              #{s.set_no} {s.weight_kg != null ? `${num(s.weight_kg)} kg × ${s.reps ?? '–'}` : 'ok'}
              {s.rir != null && ` @${s.rir}`}
              <button aria-label="Usuń serię" className="ml-1 text-emerald-600" onClick={() => softDelete('set_logs', s.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {ex && (
        <details open={showCues} onToggle={(e) => setShowCues((e.target as HTMLDetailsElement).open)} className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Technika i po co</summary>
          <ol className="list-decimal space-y-1 pl-5">
            {ex.cues.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{ex.why}</p>
          {ex.alternatives.length > 0 && <p className="mt-1 text-xs text-slate-500">Zamienniki: {ex.alternatives.join(', ')}</p>}
        </details>
      )}
    </div>
  )
}

function RestOverlay({ remaining, total, onSkip, onAdd }: { remaining: number; total: number; onSkip: () => void; onAdd: () => void }) {
  const pct = total ? Math.round(((total - remaining) / total) * 100) : 0
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/95 text-white" role="dialog" aria-label="Przerwa">
      <p className="text-lg uppercase tracking-widest text-slate-400">{remaining === 0 ? 'Do boju!' : 'Przerwa'}</p>
      <p className="my-4 text-[6rem] font-bold leading-none tabular-nums">
        {m}:{String(s).padStart(2, '0')}
      </p>
      <div className="mb-8 h-2 w-2/3 overflow-hidden rounded bg-slate-700">
        <div className="h-full bg-sky-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-3">
        <button onClick={onAdd} className="min-h-14 rounded-2xl bg-slate-700 px-6 text-lg font-semibold">
          +30 s
        </button>
        <button onClick={onSkip} className="min-h-14 rounded-2xl bg-sky-500 px-6 text-lg font-semibold">
          Pomiń
        </button>
      </div>
    </div>
  )
}

function Summary({ date, session, log, sets, week, deload, onBack, onFinish }: { date: string; session: GymSession; log: SessionLog; sets: SetLog[]; week: number; deload: boolean; onBack: () => void; onFinish: () => void }) {
  const engine = useEngine()
  const program = engine.ctx.program
  const total = tonnage(sets)
  const prev = useLiveQuery(async () => {
    const logs = (await db.session_logs.where('date').below(date).toArray()).filter((l) => !l.deleted_at && l.kind === 'gym' && l.planned_workout_id === session.session && l.id !== log.id).toSorted((a, b) => (a.date < b.date ? 1 : -1))
    const p = logs[0]
    if (!p) return null
    return { date: p.date, tonnage: tonnage(await setsForSession(p.id)) }
  }, [date, session.session, log.id])
  const histories = useLiveQuery(async () => {
    const out: Record<string, Awaited<ReturnType<typeof exerciseHistory>>> = {}
    for (const it of session.items) if (isLoggable(it)) out[it.exercise] = await exerciseHistory(it.exercise)
    return out
  }, [session, sets.length], {} as Record<string, Awaited<ReturnType<typeof exerciseHistory>>>)
  const planned = session.items.filter(isLoggable).reduce((a, it) => a + setsOf(it), 0)
  const doneLoggable = sets.filter((s) => isLoggable({ exercise: s.exercise_id, rx: { sets: 1, reps: 1 } })).length

  async function finish(status: 'done' | 'modified') {
    await upsertSessionLog(date, 'gym', { status, duration_min: log.duration_min ?? session.est_min })
    onFinish()
  }

  return (
    <div className="safe-top mx-auto max-w-lg space-y-3 px-4 pt-3 pb-8">
      <button className="text-sm text-sky-600" onClick={onBack}>
        ‹ Wróć do serii
      </button>
      <h1 className="text-2xl font-bold">Podsumowanie</h1>
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-2xl font-bold tabular-nums">{doneLoggable}/{planned}</div>
            <div className="text-xs text-slate-500">serii</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{num(total / 1000, 1)} t</div>
            <div className="text-xs text-slate-500">tonaż</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{prev ? `${total - prev.tonnage >= 0 ? '+' : ''}${num((total - prev.tonnage) / 1000, 1)} t` : '—'}</div>
            <div className="text-xs text-slate-500">{prev ? `vs ${prev.date.slice(5)}` : 'brak poprzedniej'}</div>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Ćwiczenia główne (e1RM Epley) i sugestie na następny tydzień</h2>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
          {session.items.filter(isLoggable).map((it) => {
            const mine = sets.filter((s) => s.exercise_id === it.exercise && s.weight_kg && s.reps)
            const best = mine.reduce((b, s) => Math.max(b, epley1RM(s.weight_kg!, s.reps!)), 0)
            const targetReps = parseReps(it.rx.reps)
            const targetRir = parseRir(it.rx.rir)
            const hist = histories[it.exercise] ?? []
            const sugg = targetReps != null && hist.length ? suggestLoad(it.exercise, hist.map((h) => ({ date: h.date, rx: { sets: h.sets.length, reps: h.sets[0]?.reps ?? targetReps, rir: targetRir }, sets: h.sets.map((s) => ({ weight_kg: s.weight_kg ?? 0, reps: s.reps ?? 0, rir: s.rir })) })), { sets: setsOf(it), reps: targetReps, rir: targetRir }, { deload: false, intro: week < 2 }) : null
            return (
              <li key={it.exercise} className="py-2">
                <div className="flex justify-between">
                  <span className="font-medium">{program.exercises[it.exercise]?.name ?? it.exercise}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">{mine.length ? `${mine.map((s) => `${num(s.weight_kg!)}×${s.reps}`).join(', ')}` : 'brak serii'}</span>
                </div>
                {MAIN_LIFTS.includes(it.exercise) && best > 0 && <div className="text-xs text-slate-500">e1RM ≈ {num(best, 0)} kg</div>}
                {sugg && sugg.weight_kg != null && <div className="text-xs text-sky-700 dark:text-sky-300">Następnym razem: {num(sugg.weight_kg)} kg – {sugg.reason}</div>}
              </li>
            )
          })}
        </ul>
        {deload && <p className="mt-2 text-xs text-slate-500">Tydzień rozładowania – sugestie liczone dla pełnego ciężaru w kolejnym tygodniu.</p>}
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => finish('done')}>✓ Zakończ: wykonane</Button>
        <Button variant="secondary" onClick={() => finish('modified')}>
          ± Zakończ: zmienione
        </Button>
      </div>
    </div>
  )
}
