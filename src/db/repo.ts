import { db, newId, nowISO, type BaselineEntry, type Checkin, type GearTaskState, type PackingState, type PlanOverrideRow, type ServiceLogRow, type SessionLog, type SetLog, type SyncTable, type SyncedRow, type TestResult } from './index'

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
export async function upsertCheckin(date: string, patch: Partial<Checkin>): Promise<Checkin> {
  const existing = await db.checkins.where('date').equals(date).first()
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

// ---------------------------------------------------------------- serie
export async function putSet(row: Omit<SetLog, 'updated_at'> & Partial<Pick<SetLog, 'updated_at'>>): Promise<SetLog> {
  return putSynced('set_logs', { ...row, updated_at: row.updated_at ?? nowISO() })
}

export async function setsForSession(sessionLogId: string): Promise<SetLog[]> {
  const rows = await db.set_logs.where('session_log_id').equals(sessionLogId).toArray()
  return rows.filter((r) => !r.deleted_at).toSorted((a, b) => a.set_no - b.set_no)
}

/** Historia ćwiczenia: sesje (data + serie robocze), od najstarszej. */
export async function exerciseHistory(exerciseId: string): Promise<{ date: string; session_log_id: string; sets: SetLog[] }[]> {
  const sets = (await db.set_logs.where('exercise_id').equals(exerciseId).toArray()).filter((s) => !s.deleted_at && !s.is_warmup)
  if (sets.length === 0) return []
  const ids = [...new Set(sets.map((s) => s.session_log_id))]
  const sessions = await db.session_logs.bulkGet(ids)
  const byId = new Map(sessions.filter((s): s is SessionLog => !!s && !s.deleted_at).map((s) => [s.id, s]))
  const grouped = new Map<string, { date: string; session_log_id: string; sets: SetLog[] }>()
  for (const s of sets) {
    const sess = byId.get(s.session_log_id)
    if (!sess) continue
    const g = grouped.get(sess.id) ?? { date: sess.date, session_log_id: sess.id, sets: [] }
    g.sets.push(s)
    grouped.set(sess.id, g)
  }
  return [...grouped.values()].map((g) => ({ ...g, sets: g.sets.toSorted((a, b) => a.set_no - b.set_no) })).toSorted((a, b) => (a.date < b.date ? -1 : 1))
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
  // jeden aktywny wpis danego rodzaju na dzień – ponowne kliknięcie zastępuje poprzedni
  const same = (await db.plan_overrides.where('date').equals(date).toArray()).filter((o) => !o.deleted_at && o.kind === kind)
  for (const o of same) await softDelete('plan_overrides', o.id)
  return putSynced('plan_overrides', { id: newId(), date, kind, payload, updated_at: nowISO() })
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
    done_at: status === 'done' ? (existing?.done_at ?? nowISO().slice(0, 10)) : null,
    notes: notes ?? existing?.notes ?? null,
    updated_at: nowISO(),
  })
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
