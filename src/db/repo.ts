import { db, newId, nowISO, type Checkin, type SessionLog, type SetLog, type SyncTable, type SyncedRow, type TestResult } from './index'

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
