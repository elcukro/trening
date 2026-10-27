/**
 * Narzędzia trenera (docs/23) wykonywane w aplikacji: model prosi (`tool_use`), kod sprawdza zakresy i reguły planu,
 * zapisuje przez repo (Dexie + outbox) i oddaje krótki wynik w języku zawodnika (widzi go model i zawodnik w czacie). Czysty TS – zapisy wstrzykiwane
 * (`CoachToolDeps`), testy w __tests__/coachTools.test.ts.
 */
import type { CalendarDay } from '@/engine/types'
import type { ISODate } from '@/engine/dates'
import { isValidISODate } from '@/engine/dates'
import { validateMove } from '@/engine/rules'
import type { Checkin, SessionLog } from '@/db'
import { t } from '@/i18n'
import { num } from '@/lib/format'

export interface CoachToolDeps {
  today: ISODate
  /** dni po nałożeniu nadpisań – do walidacji przeniesień */
  window: CalendarDay[]
  upsertCheckin: (date: ISODate, patch: Partial<Checkin>) => Promise<unknown>
  upsertSessionLog: (date: ISODate, kind: SessionLog['kind'], patch: Partial<SessionLog>) => Promise<unknown>
  addOverride: (date: ISODate, kind: 'move' | 'skip', payload: Record<string, unknown>) => Promise<unknown>
  pushWahoo: () => Promise<{ pushed: number; errors: string[] }>
}

export interface ToolOutcome {
  ok: boolean
  /** wynik dla modelu i do pokazania w czacie */
  text: string
  /** co się zmieniło – do odświeżenia widoku / toastu */
  changed?: 'checkin' | 'log' | 'plan' | 'bolt'
}

const n = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(x) ? x : null
}
const inRange = (v: unknown, lo: number, hi: number, round: (x: number) => number): number | null => {
  const x = n(v)
  return x != null && x >= lo && x <= hi ? round(x) : null
}
const r1 = (x: number) => Math.round(x * 10) / 10
const dateOr = (v: unknown, fallback: ISODate): ISODate | null => (v == null || v === '' ? fallback : typeof v === 'string' && isValidISODate(v) ? v : null)

export async function runCoachTool(name: string, input: Record<string, unknown>, deps: CoachToolDeps): Promise<ToolOutcome> {
  const L = t().day.tools
  try {
    switch (name) {
      case 'save_checkin': {
        const date = dateOr(input.date, deps.today)
        if (!date) return { ok: false, text: L.badDate }
        const patch: Partial<Checkin> = {}
        const got: string[] = []
        const w = inRange(input.weight_kg, 40, 200, r1)
        if (w != null) {
          patch.weight_kg = w
          got.push(L.weight(num(w, 1)))
        }
        const hr = inRange(input.resting_hr, 30, 120, Math.round)
        if (hr != null) {
          patch.resting_hr = hr
          got.push(L.restingHr(hr))
        }
        for (const k of ['sleep', 'legs', 'motivation'] as const) {
          const v = inRange(input[k], 1, 5, Math.round)
          if (v != null) {
            patch[k] = v
            got.push(`${L.rating[k]} ${v}`)
          }
        }
        if (typeof input.sick === 'boolean') {
          patch.sick = input.sick
          got.push(input.sick ? L.sickYes : L.sickNo)
        }
        if (typeof input.notes === 'string' && input.notes.trim()) {
          patch.notes = input.notes.trim().slice(0, 300)
          got.push(L.notes(patch.notes))
        }
        if (!got.length) return { ok: false, text: L.noFields }
        await deps.upsertCheckin(date, patch)
        return { ok: true, text: L.checkinSaved(date, got.join(', ')), changed: 'checkin' }
      }
      case 'set_rpe': {
        const date = dateOr(input.date, deps.today)
        if (!date) return { ok: false, text: L.badDate }
        const rpe = inRange(input.rpe, 1, 10, Math.round)
        if (rpe == null) return { ok: false, text: L.rpeRange }
        const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 300) : undefined
        await deps.upsertSessionLog(date, 'bike', { rpe, ...(notes ? { notes } : {}) })
        return { ok: true, text: L.rpeSaved(rpe, date, !!notes), changed: 'log' }
      }
      case 'mark_skipped': {
        const date = dateOr(input.date, deps.today)
        if (!date) return { ok: false, text: L.badDate }
        const day = deps.window.find((d) => d.date === date)
        if (!day) return { ok: false, text: L.outsideWindow(date) }
        if (!day.bike) return { ok: false, text: L.restDay(date) }
        const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 200) : null
        await deps.upsertSessionLog(date, 'bike', { planned_workout_id: day.bike.workout_id, status: 'skipped', rpe: null, ...(reason ? { notes: reason } : {}) })
        // nadpisanie `skip` zdejmuje trening z planu (Bolt, raporty) – log mówi „pominięte”, override „nie ma”
        await deps.addOverride(date, 'skip', { what: 'bike' })
        return { ok: true, text: L.skipped(date, day.bike.name, reason), changed: 'plan' }
      }
      case 'move_ride': {
        const from = dateOr(input.from, '')
        const to = dateOr(input.to, '')
        if (!from || !to) return { ok: false, text: L.moveDates }
        const src = deps.window.find((d) => d.date === from)
        if (!src?.bike) return { ok: false, text: L.nothingToMove(from) }
        const v = validateMove(from, to, deps.window, { today: deps.today })
        if (!v.ok) return { ok: false, text: L.cantMove(v.reason ?? null) }
        await deps.addOverride(from, 'move', { to, what: 'bike' })
        return { ok: true, text: L.moved(src.bike.name, from, to, v.warning ?? null), changed: 'plan' }
      }
      case 'push_wahoo': {
        const r = await deps.pushWahoo()
        if (r.errors.length) return { ok: r.pushed > 0, text: L.pushPartial(r.pushed, r.errors.join('; ')), changed: 'bolt' }
        return { ok: true, text: L.pushed(r.pushed), changed: 'bolt' }
      }
      default:
        return { ok: false, text: L.unknownTool(name) }
    }
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) }
  }
}
