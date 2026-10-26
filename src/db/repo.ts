import { db, newId, nowISO, type BaselineEntry, type BikeRow, type Checkin, type GearTaskState, type MealRow, type PackingState, type PlanOverrideRow, type ServiceLogRow, type SessionLog, type SyncTable, type SyncedRow, type TestResult } from './index'
import { addDays } from '@/engine/dates'
import { swapToUndo } from '@/engine/rules'
import { healthPatch, sourcesAfterManual, type HealthDay } from '@/day/health'

/** Zapis lokalny + wpis do outboxa (jedna transakcja). */
export async function putSynced<T extends SyncedRow>(table: SyncTable, row: T): Promise<T> {
  const stamped = { ...row, updated_at: nowISO() }
  await db.transaction('rw', [db.table(table), db.outbox], async () => {
    await db.table(table).put(stamped)
    const existing = await db.outbox.where('[table+row_id]').equals([table, row.id]).first()
    if (!existing) await db.outbox.add({ table, row_id: row.id, ts: stamped.updated_at })
  })
  return stamped
}

export async function softDelete(table: SyncTable, id: string): Promise<void> {
  const row = (await db.table(table).get(id)) as SyncedRow | undefined
  if (!row) return
  await putSynced(table, { ...row, deleted_at: nowISO() })
}

// ---------------------------------------------------------------- check-in
/** Check-in wpisany ręcznie (arkusz, trener): pole zmienione ręcznie przestaje być „ze Zdrowia” (docs/27 § 2). */
export async function upsertCheckin(date: string, patch: Partial<Checkin>): Promise<Checkin> {
  const existing = await db.checkins.where('date').equals(date).first()
  const field_sources = 'field_sources' in patch ? patch.field_sources : sourcesAfterManual(existing, patch)
  return writeCheckin(date, existing, { ...patch, field_sources })
}

/**
 * Dane dnia z Apple Health → check-in: tylko pola puste albo wcześniej ze Zdrowia. Bez zmian = bez zapisu,
 * więc odczyt przy każdym otwarciu aplikacji nie generuje synchronizacji. Zwraca, czy coś zapisano.
 */
export async function applyHealthDay(date: string, day: HealthDay): Promise<boolean> {
  const existing = await db.checkins.where('date').equals(date).first()
  const live = existing?.deleted_at ? undefined : existing
  const patch = healthPatch(live, day)
  if (!patch) return false
  // usunięty wcześniej check-in tego dnia: to samo id (unikat user_id+date na serwerze), ale bez starych ocen
  const reset: Partial<Checkin> = existing && !live ? { weight_kg: null, resting_hr: null, sleep: null, legs: null, motivation: null, sick: false, notes: null, hrv_ms: null, sleep_min: null, deleted_at: null } : {}
  await writeCheckin(date, existing, { ...reset, ...patch })
  return true
}

async function writeCheckin(date: string, existing: Checkin | undefined, patch: Partial<Checkin>): Promise<Checkin> {
  const row: Checkin = {
    id: existing?.id ?? newId(),
    date,
    weight_kg: null,
    resting_hr: null,
    sleep: null,
    legs: null,
    motivation: null,
    sick: false,
    ...existing,
    ...patch,
    updated_at: nowISO(),
  }
  return putSynced('checkins', row)
}

// ---------------------------------------------------------------- logi sesji
export async function findSessionLog(date: string, kind: SessionLog['kind']): Promise<SessionLog | undefined> {
  const rows = await db.session_logs.where('[date+kind]').equals([date, kind]).toArray()
  return rows.find((r) => !r.deleted_at)
}

export async function upsertSessionLog(date: string, kind: SessionLog['kind'], patch: Partial<SessionLog>): Promise<SessionLog> {
  const existing = await findSessionLog(date, kind)
  const row: SessionLog = {
    id: existing?.id ?? newId(),
    date,
    kind,
    planned_workout_id: null,
    status: 'planned',
    ...existing,
    ...patch,
    updated_at: nowISO(),
  }
  return putSynced('session_logs', row)
}

// ---------------------------------------------------------------- testy
export async function saveTestResult(row: Omit<TestResult, 'id' | 'updated_at'> & { id?: string }): Promise<TestResult> {
  return putSynced('test_results', { ...row, id: row.id ?? newId(), updated_at: nowISO() })
}

export async function activeRows<T extends SyncedRow>(table: SyncTable): Promise<T[]> {
  const rows = (await db.table(table).toArray()) as T[]
  return rows.filter((r) => !r.deleted_at)
}

// ---------------------------------------------------------------- nadpisania planu (R1–R15)
export async function addOverride(date: string, kind: PlanOverrideRow['kind'], payload: Record<string, unknown> = {}): Promise<PlanOverrideRow> {
  // jeden aktywny wpis danego rodzaju na dzień – ponowne kliknięcie zastępuje poprzedni.
  // Zamiany są wyjątkiem: kolejna zamiana tego samego dnia działa na wyniku poprzedniej, więc jej nie kasuje (`swapDays`).
  if (kind !== 'swap') {
    const same = (await db.plan_overrides.where('date').equals(date).toArray()).filter((o) => !o.deleted_at && o.kind === kind)
    for (const o of same) await softDelete('plan_overrides', o.id)
  }
  return putSynced('plan_overrides', { id: newId(), date, kind, payload, updated_at: nowISO() })
}

/**
 * Zamiana dwóch dni. Kolejne zamiany się składają (A↔B, potem A↔C); powtórzenie ostatniej zamiany tej samej pary
 * cofa ją zamiast dokładać drugi wpis.
 */
export async function swapDays(a: string, b: string): Promise<{ outcome: 'swapped' | 'undone'; id: string }> {
  const lo = a < b ? a : b
  const hi = a < b ? b : a
  const near = (await db.plan_overrides.where('date').between(addDays(lo, -7), addDays(hi, 7), true, true).toArray()).filter((o) => !o.deleted_at)
  const undo = swapToUndo(near.map((o) => ({ id: o.id, date: o.date, kind: o.kind, payload: o.payload, at: o.updated_at })), a, b)
  if (undo) {
    await softDelete('plan_overrides', undo)
    return { outcome: 'undone', id: undo }
  }
  const row = await addOverride(a, 'swap', { swap_with: b })
  return { outcome: 'swapped', id: row.id }
}

export async function removeOverride(id: string): Promise<void> {
  await softDelete('plan_overrides', id)
}

export async function overridesFor(dates: string[]): Promise<PlanOverrideRow[]> {
  const rows = await db.plan_overrides.where('date').anyOf(dates).toArray()
  return rows.filter((o) => !o.deleted_at)
}

// ---------------------------------------------------------------- sprzęt i wyjazd
export async function setGearStatus(taskId: string, status: GearTaskState['status'], notes?: string | null): Promise<GearTaskState> {
  const existing = await db.gear_task_state.get(taskId)
  return putSynced('gear_task_state', {
    id: taskId,
    task_id: taskId,
    status,
    // każde odhaczenie to nowa data – zadania cykliczne liczą od niej następny termin
    done_at: status === 'done' ? nowISO().slice(0, 10) : null,
    notes: notes ?? existing?.notes ?? null,
    updated_at: nowISO(),
  })
}

export async function saveBike(bike: Omit<BikeRow, 'id' | 'updated_at'> & { id?: string }): Promise<BikeRow> {
  return putSynced('bikes', { ...bike, id: bike.id ?? newId(), updated_at: nowISO() })
}

export async function deleteBike(id: string): Promise<void> {
  await softDelete('bikes', id)
}

export async function addServiceEntry(entry: Omit<ServiceLogRow, 'id' | 'updated_at'>): Promise<ServiceLogRow> {
  return putSynced('service_log', { ...entry, id: newId(), updated_at: nowISO() })
}

export async function setPacked(tripKey: string, itemKey: string, checked: boolean): Promise<PackingState> {
  return putSynced('packing_state', { id: `${tripKey}:${itemKey}`, trip_key: tripKey, item_key: itemKey, checked, updated_at: nowISO() })
}

export async function resetPacking(tripKey: string): Promise<void> {
  const rows = (await db.packing_state.where('trip_key').equals(tripKey).toArray()).filter((r) => r.checked)
  for (const r of rows) await putSynced('packing_state', { ...r, checked: false })
}

// ---------------------------------------------------------------- punkt wyjścia
export async function addBaselineEntry(entry: Omit<BaselineEntry, 'id' | 'updated_at'>): Promise<BaselineEntry> {
  return putSynced('baseline_entries', { id: newId(), updated_at: nowISO(), ...entry })
}

// ---------------------------------------------------------------- posiłki (docs/25)
export async function addMeal(meal: Omit<MealRow, 'id' | 'updated_at'> & { id?: string }): Promise<MealRow> {
  return putSynced('meals', { ...meal, id: meal.id ?? newId(), updated_at: nowISO() })
}

export async function updateMeal(id: string, patch: Partial<Omit<MealRow, 'id'>>): Promise<MealRow | undefined> {
  const row = await db.meals.get(id)
  if (!row) return undefined
  return putSynced('meals', { ...row, ...patch })
}

export async function deleteMeal(id: string): Promise<void> {
  await softDelete('meals', id)
}

/** Przywraca posiłek usunięty przez „Cofnij”. */
export async function restoreMeal(id: string): Promise<void> {
  const row = await db.meals.get(id)
  if (row) await putSynced('meals', { ...row, deleted_at: null })
}

export async function mealsFor(date: string): Promise<MealRow[]> {
  const rows = await db.meals.where('date').equals(date).toArray()
  return rows.filter((m) => !m.deleted_at).toSorted((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
}
