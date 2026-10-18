/**
 * Narzędzia trenera (docs/23) wykonywane w aplikacji: model prosi (`tool_use`), kod sprawdza zakresy i reguły planu,
 * zapisuje przez repo (Dexie + outbox) i oddaje modelowi krótki wynik po polsku. Czysty TS – zapisy wstrzykiwane
 * (`CoachToolDeps`), testy w __tests__/coachTools.test.ts.
 */
import type { CalendarDay } from '@/engine/types'
import type { ISODate } from '@/engine/dates'
import { isValidISODate } from '@/engine/dates'
import { validateMove } from '@/engine/rules'
import type { Checkin, SessionLog } from '@/db'

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
const pl = (x: number) => String(x).replace('.', ',')

export async function runCoachTool(name: string, input: Record<string, unknown>, deps: CoachToolDeps): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'save_checkin': {
        const date = dateOr(input.date, deps.today)
        if (!date) return { ok: false, text: 'Zła data.' }
        const patch: Partial<Checkin> = {}
        const got: string[] = []
        const w = inRange(input.weight_kg, 40, 200, r1)
        if (w != null) {
          patch.weight_kg = w
          got.push(`waga ${pl(w)} kg`)
        }
        const hr = inRange(input.resting_hr, 30, 120, Math.round)
        if (hr != null) {
          patch.resting_hr = hr
          got.push(`tętno ${hr}`)
        }
        for (const k of ['sleep', 'legs', 'motivation'] as const) {
          const v = inRange(input[k], 1, 5, Math.round)
          if (v != null) {
            patch[k] = v
            got.push(`${{ sleep: 'sen', legs: 'nogi', motivation: 'motywacja' }[k]} ${v}`)
          }
        }
        if (typeof input.sick === 'boolean') {
          patch.sick = input.sick
          got.push(input.sick ? 'choroba: tak' : 'choroba: nie')
        }
        if (typeof input.notes === 'string' && input.notes.trim()) {
          patch.notes = input.notes.trim().slice(0, 300)
          got.push(`uwagi: „${patch.notes}”`)
        }
        if (!got.length) return { ok: false, text: 'Brak poprawnych pól (waga 40–200 kg, tętno 30–120, oceny 1–5).' }
        await deps.upsertCheckin(date, patch)
        return { ok: true, text: `Zapisano check-in ${date}: ${got.join(', ')}.`, changed: 'checkin' }
      }
      case 'set_rpe': {
        const date = dateOr(input.date, deps.today)
        if (!date) return { ok: false, text: 'Zła data.' }
        const rpe = inRange(input.rpe, 1, 10, Math.round)
        if (rpe == null) return { ok: false, text: 'RPE musi być liczbą 1–10.' }
        const day = deps.window.find((d) => d.date === date)
        const kind: SessionLog['kind'] = day && !day.bike && day.gym ? 'gym' : 'bike'
        const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 300) : undefined
        await deps.upsertSessionLog(date, kind, { rpe, ...(notes ? { notes } : {}) })
        return { ok: true, text: `Zapisano RPE ${rpe} dla ${date}${notes ? ' z notatką' : ''}.`, changed: 'log' }
      }
      case 'mark_skipped': {
        const date = dateOr(input.date, deps.today)
        if (!date) return { ok: false, text: 'Zła data.' }
        const day = deps.window.find((d) => d.date === date)
        if (!day) return { ok: false, text: `Dnia ${date} nie ma w oknie planu (±7 dni).` }
        if (!day.bike && !day.gym) return { ok: false, text: `${date} to dzień wolny – nie ma czego pomijać.` }
        const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 200) : null
        const kind: SessionLog['kind'] = day.bike ? 'bike' : 'gym'
        await deps.upsertSessionLog(date, kind, { planned_workout_id: (day.bike ? day.bike.workout_id : day.gym?.session) ?? null, status: 'skipped', rpe: null, ...(reason ? { notes: reason } : {}) })
        // nadpisanie `skip` zdejmuje trening z planu (Bolt, raporty) – log mówi „pominięte”, override „nie ma”
        await deps.addOverride(date, 'skip', { what: day.bike && day.gym ? 'both' : kind })
        return { ok: true, text: `Oznaczono ${date} (${day.bike?.name ?? day.gym?.name}) jako pominięte${reason ? `: ${reason}` : ''}.`, changed: 'plan' }
      }
      case 'move_ride': {
        const from = dateOr(input.from, '')
        const to = dateOr(input.to, '')
        if (!from || !to) return { ok: false, text: 'Podaj daty „from” i „to” w formacie YYYY-MM-DD.' }
        const src = deps.window.find((d) => d.date === from)
        if (!src?.bike) return { ok: false, text: `${from} nie ma jazdy do przeniesienia.` }
        const v = validateMove(from, to, deps.window, { today: deps.today })
        if (!v.ok) return { ok: false, text: `Nie można przenieść: ${v.reason ?? 'reguły planu'}.` }
        await deps.addOverride(from, 'move', { to, what: 'bike' })
        return { ok: true, text: `Przeniesiono „${src.bike.name}” z ${from} na ${to}.${v.warning ? ` Uwaga: ${v.warning}` : ''} Plan na Bolcie wymaga wysyłki.`, changed: 'plan' }
      }
      case 'push_wahoo': {
        const r = await deps.pushWahoo()
        if (r.errors.length) return { ok: r.pushed > 0, text: `Wysłano ${r.pushed} dni, błędy: ${r.errors.join('; ')}.`, changed: 'bolt' }
        return { ok: true, text: `Wysłano plan na Bolta (${r.pushed} dni).`, changed: 'bolt' }
      }
      default:
        return { ok: false, text: `Nieznane narzędzie ${name}.` }
    }
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) }
  }
}
