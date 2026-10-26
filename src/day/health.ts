import type { Checkin, HealthField } from '@/db'
import { num } from '@/lib/format'

/**
 * Apple Health w check-inie (docs/27 § 2) – logika bez UI i bez wtyczki: co ze Zdrowia trafia do check-inu,
 * kiedy wpis ręczny wygrywa i kiedy check-in liczy się jako zrobiony.
 */

/** Jeden dzień ze Zdrowia (src/native/health.ts → `readDay`); brak pola = brak danych. */
export interface HealthDay {
  weight_kg?: number | null
  resting_hr?: number | null
  hrv_ms?: number | null
  sleep_min?: number | null
}

export const HEALTH_FIELDS: readonly HealthField[] = ['weight_kg', 'resting_hr', 'hrv_ms', 'sleep_min']

/** Zaokrąglenia jak przy wpisie ręcznym: waga do 0,1 kg, reszta do całości. */
function rounded(field: HealthField, v: number): number {
  return field === 'weight_kg' ? Math.round(v * 10) / 10 : Math.round(v)
}

/**
 * Zmiana check-inu z danych Zdrowia: pole puste albo wcześniej wypełnione przez Zdrowie dostaje nową wartość;
 * pole wpisane ręcznie zostaje. `null`, gdy nic się nie zmienia (bez zapisu i bez synchronizacji).
 */
export function healthPatch(existing: Checkin | undefined, day: HealthDay): Partial<Checkin> | null {
  const sources = { ...existing?.field_sources }
  const patch: Partial<Checkin> = {}
  for (const f of HEALTH_FIELDS) {
    const raw = day[f]
    if (raw == null || !Number.isFinite(raw) || raw <= 0) continue
    const v = rounded(f, raw)
    const cur = existing?.[f] ?? null
    const fromHealth = sources[f] === 'health'
    if (cur != null && !fromHealth) continue
    if (cur === v && fromHealth) continue
    patch[f] = v
    sources[f] = 'health'
  }
  if (Object.keys(patch).length === 0) return null
  return { ...patch, field_sources: sources }
}

/** Źródła po zapisie ręcznym: pole, którego wartość się zmieniła, przestaje być „ze Zdrowia”. */
export function sourcesAfterManual(existing: Checkin | undefined, patch: Partial<Checkin>): Checkin['field_sources'] {
  const sources = { ...existing?.field_sources }
  for (const f of HEALTH_FIELDS) {
    if (!(f in patch)) continue
    if ((patch[f] ?? null) !== (existing?.[f] ?? null)) delete sources[f]
  }
  return Object.keys(sources).length ? sources : null
}

/** Czy pole przyszło ze Zdrowia (do podpisu „ze Zdrowia” w UI). */
export function fromHealth(c: Checkin | undefined | null, f: HealthField): boolean {
  return c?.field_sources?.[f] === 'health' && c[f] != null
}

/**
 * Check-in zrobiony = zawodnik coś sam ocenił albo wpisał. Dane ze Zdrowia (waga z wagi łazienkowej, tętno, HRV, sen)
 * same go nie zaliczają – rano zostają nogi i samopoczucie (docs/27 § 1).
 */
export function isCheckedIn(c: Checkin | undefined | null): boolean {
  if (!c) return false
  if (c.sleep != null || c.legs != null || c.motivation != null) return true
  return c.weight_kg != null && !fromHealth(c, 'weight_kg')
}

/** Sen w minutach jako „7 h 05”. */
export function sleepLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h} h ${String(m).padStart(2, '0')}`
}

/** Jedna linia „co przyszło ze Zdrowia”: „waga 103,4 kg · tętno 52 · HRV 42 ms · sen 7 h 05”; pusta, gdy nic. */
export function healthLine(d: HealthDay | Checkin | null | undefined, only?: (f: HealthField) => boolean): string {
  if (!d) return ''
  const ok = (f: HealthField) => d[f] != null && (!only || only(f))
  return [
    ok('weight_kg') ? `waga ${num(d.weight_kg as number)} kg` : null,
    ok('resting_hr') ? `tętno ${Math.round(d.resting_hr as number)}` : null,
    ok('hrv_ms') ? `HRV ${Math.round(d.hrv_ms as number)} ms` : null,
    ok('sleep_min') ? `sen ${sleepLabel(d.sleep_min as number)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
