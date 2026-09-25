import type { ProgramGearTask } from './schema'
import { addDays, compareISO, type ISODate } from './dates'

/**
 * Zadania sprzętowe (docs/18, krok 4): zadania z planu sezonu (program) plus serwis cykliczny
 * z szablonu dla każdego roweru użytkownika, dobrany do typu roweru i hamulców.
 * Czysty TS – stan odhaczeń przychodzi z bazy, rowery z tabeli `bikes`.
 */

export type BikeKind = 'road' | 'gravel' | 'mtb' | 'tt' | 'other'
export type BrakeKind = 'disc' | 'rim'

export interface BikeLike {
  id: string
  name: string
  kind: BikeKind
  brakes: BrakeKind
}

export interface GearTemplate {
  id: string
  every_days: number
  title: string
  details: string
  /** tylko rowery tych typów (brak = wszystkie) */
  kinds?: BikeKind[]
  /** tylko rowery z tymi hamulcami (brak = wszystkie) */
  brakes?: BrakeKind
}

export interface TaskStateLike {
  task_id: string
  status: 'todo' | 'done' | 'skipped'
  done_at: string | null
  deleted_at?: string | null
}

export interface GearTaskView {
  id: string
  title: string
  details: string
  bike_label: string | null
  due: ISODate | null
  cost_pln: number | null
  /** cykliczne: co ile dni */
  every_days: number | null
  status: 'todo' | 'done' | 'skipped'
  /** ostatnie wykonanie (także dla cyklicznych, które znów czekają) */
  done_at: ISODate | null
}

export const BIKE_KIND_LABEL: Record<BikeKind, string> = { road: 'szosa', gravel: 'gravel', mtb: 'MTB', tt: 'czasówka', other: 'inny' }
export const BRAKES_LABEL: Record<BrakeKind, string> = { disc: 'tarczowe', rim: 'szczękowe' }

/** Klucz stanu zadania cyklicznego – jeden na szablon i rower, żeby odhaczenie jednego roweru nie gasiło drugiego. */
export function templateTaskId(templateId: string, bikeId: string): string {
  return `${templateId}:${bikeId}`
}

export function templateApplies(t: GearTemplate, bike: BikeLike): boolean {
  return (!t.kinds || t.kinds.includes(bike.kind)) && (!t.brakes || t.brakes === bike.brakes)
}

export function gearTasks(opts: { programTasks: ProgramGearTask[]; templates: GearTemplate[]; bikes: BikeLike[]; states: TaskStateLike[]; today: ISODate }): GearTaskView[] {
  const byId = new Map(opts.states.filter((s) => !s.deleted_at).map((s) => [s.task_id, s]))
  const out: GearTaskView[] = []

  for (const t of opts.programTasks) {
    const s = byId.get(t.id)
    out.push({ id: t.id, title: t.title, details: t.details, bike_label: t.bike_label ?? null, due: t.due ?? null, cost_pln: t.cost_pln ?? null, every_days: null, status: s?.status ?? 'todo', done_at: s?.done_at ?? null })
  }

  for (const bike of opts.bikes) {
    for (const t of opts.templates) {
      if (!templateApplies(t, bike)) continue
      const id = templateTaskId(t.id, bike.id)
      const s = byId.get(id)
      // zrobione wraca do listy, gdy minie okres; „nie dotyczy” zostaje na stałe
      const next = s?.status === 'done' && s.done_at ? addDays(s.done_at, t.every_days) : null
      const status = s?.status === 'skipped' ? 'skipped' : next && compareISO(next, opts.today) > 0 ? 'done' : 'todo'
      out.push({ id, title: t.title, details: t.details, bike_label: bike.name, due: next ?? opts.today, cost_pln: null, every_days: t.every_days, status, done_at: s?.done_at ?? null })
    }
  }

  return out.toSorted((a, b) => (a.due ?? '9999') < (b.due ?? '9999') ? -1 : (a.due ?? '9999') > (b.due ?? '9999') ? 1 : a.title.localeCompare(b.title, 'pl'))
}
