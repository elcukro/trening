import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BikeRow, type GearTaskState, type ServiceLogRow } from '@/db'
import { addServiceEntry, deleteBike, saveBike, setGearStatus } from '@/db/repo'
import { loadGearTemplates } from '@/data/gear'
import { useEngine } from '@/app/useSettings'
import { BIKE_KIND_LABEL, BRAKES_LABEL, gearTasks, type BikeKind, type BrakeKind } from '@/engine/gear'
import { todayISO, fmtDate } from '@/lib/dates'
import { num } from '@/lib/format'
import { Actions, Badge, Button, Card, CardSection, CardTitle, Field, Input, PageTitle, Select } from '@/components/ui'
import { useToast } from '@/components/Toast'

/**
 * Sprzęt (docs/18, krok 4): rowery są danymi konta, serwis cykliczny powstaje z szablonu dla każdego roweru,
 * a zadania z terminami dokłada program (plan sezonu), jeśli je ma.
 */

type BikeForm = { id?: string; name: string; kind: BikeKind; brakes: BrakeKind; role: string }
const EMPTY_BIKE: BikeForm = { name: '', kind: 'road', brakes: 'disc', role: '' }

function BikesCard({ bikes }: { bikes: BikeRow[] }) {
  const toast = useToast()
  const [form, setForm] = useState<BikeForm | null>(null)

  async function save() {
    if (!form?.name.trim()) return
    const f = form
    await toast.run('Zapisuję rower…', () => saveBike({ id: f.id, name: f.name.trim(), kind: f.kind, brakes: f.brakes, role: f.role.trim() || null }), () => 'Rower zapisany')
    setForm(null)
  }

  return (
    <Card>
      <CardTitle
        icon="🚲"
        right={
          !form && (
            <Button variant="ghost" size="sm" onClick={() => setForm(EMPTY_BIKE)}>
              + Rower
            </Button>
          )
        }
      >
        Twoje rowery
      </CardTitle>
      {bikes.length === 0 && !form && <p className="text-sm text-slate-600 dark:text-slate-300">Dodaj swój rower – serwis cykliczny (łańcuch, opony, hamulce) dobierze się do jego typu i hamulców.</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-700/80">
        {bikes.map((b) => (
          <li key={b.id} className="flex items-start gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{b.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {BIKE_KIND_LABEL[b.kind]} · hamulce {BRAKES_LABEL[b.brakes]}
              </div>
              {b.role && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{b.role}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setForm({ id: b.id, name: b.name, kind: b.kind, brakes: b.brakes, role: b.role ?? '' })}>
              Edytuj
            </Button>
          </li>
        ))}
      </ul>
      {form && (
        <CardSection>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nazwa" className="col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="np. marka i model" />
            </Field>
            <Field label="Typ">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as BikeKind })}>
                {(Object.keys(BIKE_KIND_LABEL) as BikeKind[]).map((k) => (
                  <option key={k} value={k}>
                    {BIKE_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hamulce">
              <Select value={form.brakes} onChange={(e) => setForm({ ...form, brakes: e.target.value as BrakeKind })}>
                {(Object.keys(BRAKES_LABEL) as BrakeKind[]).map((k) => (
                  <option key={k} value={k}>
                    {BRAKES_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Do czego (opcjonalnie)" className="col-span-2">
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="np. trenażer, zima, długie jazdy" />
            </Field>
          </div>
          <Actions className="mt-3">
            <Button onClick={save} disabled={!form.name.trim()} className="flex-1">
              Zapisz
            </Button>
            <Button variant="secondary" onClick={() => setForm(null)}>
              Anuluj
            </Button>
            {form.id && (
              <Button
                variant="danger"
                onClick={() => {
                  const id = form.id!
                  void toast.run('Usuwam…', () => deleteBike(id), () => 'Rower usunięty')
                  setForm(null)
                }}
              >
                Usuń
              </Button>
            )}
          </Actions>
        </CardSection>
      )}
    </Card>
  )
}

export function GearPage() {
  const engine = useEngine()
  const toast = useToast()
  const today = todayISO()
  const allBikes = useLiveQuery(() => db.bikes.toArray(), [], [] as BikeRow[])
  const states = useLiveQuery(() => db.gear_task_state.toArray(), [], [] as GearTaskState[])
  const services = useLiveQuery(() => db.service_log.orderBy('date').reverse().toArray(), [], [] as ServiceLogRow[])
  const bikes = useMemo(() => allBikes.filter((b) => !b.deleted_at).toSorted((a, b) => a.name.localeCompare(b.name, 'pl')), [allBikes])
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState({ date: today, bike: '', km: '', description: '' })
  const serviceBike = form.bike || bikes[0]?.id || ''

  const tasks = useMemo(
    () => gearTasks({ programTasks: engine.ctx.program.gear_tasks ?? [], templates: loadGearTemplates(), bikes, states, today }),
    [engine.ctx.program.gear_tasks, bikes, states, today],
  )
  const openTasks = tasks.filter((t) => t.status === 'todo')
  const doneTasks = tasks.filter((t) => t.status !== 'todo')
  const cost = openTasks.reduce((a, t) => a + (t.cost_pln ?? 0), 0)
  const bikeName = new Map(allBikes.map((b) => [b.id, b.name]))

  async function saveService() {
    if (!form.description.trim() || !serviceBike) return
    await toast.run('Zapisuję…', () => addServiceEntry({ date: form.date, bike: serviceBike, km: form.km ? Number(form.km) : null, description: form.description.trim() }), () => 'Dopisano do dziennika')
    setForm({ date: today, bike: serviceBike, km: '', description: '' })
  }

  return (
    <div className="space-y-3">
      <Link to="/wiecej" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
        ‹ Więcej
      </Link>
      <PageTitle sub={`${openTasks.length} zadań do zrobienia${cost > 0 ? ` · ok. ${num(cost, 0)} zł` : ''}`}>Sprzęt</PageTitle>

      <BikesCard bikes={bikes} />

      {tasks.length > 0 && (
        <Card>
          <CardTitle icon="🔧">Zadania</CardTitle>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/80">
            {[...openTasks, ...doneTasks].map((t) => {
              const done = t.status === 'done'
              const skipped = t.status === 'skipped'
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
                        {t.bike_label && <Badge color="bg-slate-500">{t.bike_label}</Badge>}
                        {t.every_days ? (
                          <span className={overdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
                            co {t.every_days} dni{done ? ` · następnie ${fmtDate(t.due!)}` : t.done_at ? ` · ostatnio ${fmtDate(t.done_at)}` : ''}
                          </span>
                        ) : (
                          t.due && <span className={overdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}>do {fmtDate(t.due)}</span>
                        )}
                        {t.cost_pln != null && <span className="tabular-nums">{num(t.cost_pln, 0)} zł</span>}
                        {done && !t.every_days && t.done_at && <span className="text-emerald-600 dark:text-emerald-400">zrobione {fmtDate(t.done_at)}</span>}
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
      )}

      <Card>
        <CardTitle icon="📒">Dziennik serwisu</CardTitle>
        {bikes.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Najpierw dodaj rower – wpisy w dzienniku są przypisane do roweru.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data">
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Rower">
                <Select value={serviceBike} onChange={(e) => setForm({ ...form, bike: e.target.value })}>
                  {bikes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
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
          </>
        )}
        {services.filter((s) => !s.deleted_at).length > 0 && (
          <CardSection>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700/80">
              {services
                .filter((s) => !s.deleted_at)
                .map((s) => (
                  <li key={s.id} className="py-1.5">
                    <span className="text-slate-500 tabular-nums dark:text-slate-400">{fmtDate(s.date)}</span> · {bikeName.get(s.bike) ?? s.bike}
                    {s.km != null && <span className="text-slate-500 tabular-nums dark:text-slate-400"> · {num(s.km, 0)} km</span>}
                    <div>{s.description}</div>
                  </li>
                ))}
            </ul>
          </CardSection>
        )}
      </Card>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {engine.ctx.program.gear_tasks?.length ? 'Zadania z terminami pochodzą z planu sezonu, serwis cykliczny – z Twoich rowerów.' : 'Serwis cykliczny powstaje z Twoich rowerów.'}
      </p>
    </div>
  )
}
