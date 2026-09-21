import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type GearTaskState, type ServiceLogRow } from '@/db'
import { addServiceEntry, setGearStatus } from '@/db/repo'
import { BIKE_LABEL, loadGearTasks } from '@/data/gear'
import { useEngine } from '@/app/useSettings'
import { todayISO, fmtDate } from '@/lib/dates'
import { num } from '@/lib/format'
import { Badge, Button, Card, CardSection, CardTitle, Field, Input, PageTitle, Select } from '@/components/ui'
import { useToast } from '@/components/Toast'

const BIKES = [
  { id: 'checkpoint', name: 'Trek Checkpoint ALR 4', role: 'Alpy, zima, mokro, szuter, weekendy w górach, bloki z bagażem. Przełożenie 40/50, hamulce tarczowe.' },
  { id: 'dogma', name: 'Pinarello Dogma 60.1', role: '80% treningów szosowych po suchym: sweet spot, tempo 30 km/h, długie jazdy. Hamulce szczękowe, więc nie jedzie w Alpy.' },
]

export function GearPage() {
  const engine = useEngine()
  const toast = useToast()
  const today = todayISO()
  const tasks = loadGearTasks()
  const states = useLiveQuery(() => db.gear_task_state.toArray(), [], [] as GearTaskState[])
  const services = useLiveQuery(() => db.service_log.orderBy('date').reverse().toArray(), [], [] as ServiceLogRow[])
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState({ date: today, bike: 'checkpoint', km: '', description: '' })
  const byId = new Map(states.filter((s) => !s.deleted_at).map((s) => [s.task_id, s]))

  const sorted = [...tasks].toSorted((a, b) => (a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1)
  const openTasks = sorted.filter((t) => (byId.get(t.id)?.status ?? 'todo') === 'todo')
  const doneTasks = sorted.filter((t) => (byId.get(t.id)?.status ?? 'todo') !== 'todo')
  const cost = openTasks.reduce((a, t) => a + (t.cost_pln ?? 0), 0)

  async function saveService() {
    if (!form.description.trim()) return
    await toast.run('Zapisuję…', () => addServiceEntry({ date: form.date, bike: form.bike, km: form.km ? Number(form.km) : null, description: form.description.trim() }), () => 'Dopisano do dziennika')
    setForm({ date: today, bike: form.bike, km: '', description: '' })
  }

  return (
    <div className="space-y-3">
      <Link to="/wiecej" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
        ‹ Więcej
      </Link>
      <PageTitle sub={`${openTasks.length} zadań do zrobienia${cost > 0 ? ` · ok. ${num(cost, 0)} zł` : ''}`}>Sprzęt</PageTitle>

      {BIKES.map((b) => (
        <Card key={b.id} tone="muted">
          <CardTitle icon="🚲">{b.name}</CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-300">{b.role}</p>
        </Card>
      ))}

      <Card>
        <CardTitle icon="🔧">Zadania</CardTitle>
        <ul className="divide-y divide-slate-100 dark:divide-slate-700/80">
          {[...openTasks, ...doneTasks].map((t) => {
            const state = byId.get(t.id)
            const done = state?.status === 'done'
            const skipped = state?.status === 'skipped'
            const overdue = !done && !skipped && t.due && t.due < today
            return (
              <li key={t.id} className="py-2">
                <div className="flex items-start gap-3">
                  <button
                    aria-label={done ? 'Cofnij odhaczenie' : 'Odhacz zadanie'}
                    onClick={() => setGearStatus(t.id, done ? 'todo' : 'done')}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-base transition-colors ${done ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500' : 'border-slate-300 hover:border-sky-500 hover:bg-sky-50 dark:border-slate-600 dark:hover:bg-slate-700'}`}
                  >
                    {done ? '✓' : ''}
                  </button>
                  <div className="min-w-0 flex-1 py-1.5">
                    <button onClick={() => setOpen(open === t.id ? null : t.id)} className="block w-full text-left" aria-expanded={open === t.id}>
                      <span className={`text-sm font-medium leading-5 ${done || skipped ? 'text-slate-400 line-through' : ''}`}>{t.title}</span>
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {t.bike && <Badge color="bg-slate-500">{BIKE_LABEL[t.bike]}</Badge>}
                      {t.due && <span className={overdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}>do {fmtDate(t.due)}</span>}
                      {t.recurring === 'monthly' && <span>co miesiąc</span>}
                      {t.cost_pln && <span className="tabular-nums">{num(t.cost_pln, 0)} zł</span>}
                      {done && state?.done_at && <span className="text-emerald-600 dark:text-emerald-400">zrobione {fmtDate(state.done_at)}</span>}
                    </div>
                    {open === t.id && (
                      <div className="mt-1">
                        <p className="text-xs text-slate-600 dark:text-slate-300">{t.details}</p>
                        <button onClick={() => setGearStatus(t.id, skipped ? 'todo' : 'skipped')} className="mt-1 min-h-9 text-xs text-slate-500 underline dark:text-slate-400">
                          {skipped ? 'Przywróć' : 'Nie dotyczy'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle icon="📒">Dziennik serwisu</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Rower">
            <Select value={form.bike} onChange={(e) => setForm({ ...form, bike: e.target.value })}>
              <option value="checkpoint">Checkpoint</option>
              <option value="dogma">Dogma</option>
            </Select>
          </Field>
          <Field label="Przebieg (km)">
            <Input inputMode="numeric" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} />
          </Field>
          <Field label="Co zrobione" className="col-span-2">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="np. wymiana łańcucha, klocki przód" />
          </Field>
        </div>
        <Button onClick={saveService} disabled={!form.description.trim()} className="mt-3 w-full">
          Dopisz do dziennika
        </Button>
        {services.filter((s) => !s.deleted_at).length > 0 && (
          <CardSection>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700/80">
              {services
                .filter((s) => !s.deleted_at)
                .map((s) => (
                  <li key={s.id} className="py-1.5">
                    <span className="text-slate-500 tabular-nums dark:text-slate-400">{fmtDate(s.date)}</span> · {BIKE_LABEL[s.bike] ?? s.bike}
                    {s.km != null && <span className="text-slate-500 tabular-nums dark:text-slate-400"> · {num(s.km, 0)} km</span>}
                    <div>{s.description}</div>
                  </li>
                ))}
            </ul>
          </CardSection>
        )}
      </Card>
      <p className="text-xs text-slate-400 dark:text-slate-500">Program {engine.ctx.program.version}. Terminy zadań pochodzą z planu sezonu.</p>
    </div>
  )
}
