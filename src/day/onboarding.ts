import type { OnboardingRow } from '@/db'
import type { Settings } from '@/engine/schema'
import { STEPS, firstIncomplete, type Draft, type Step, type StepOrSummary } from '@/engine/onboarding'

/**
 * Onboarding bez UI (docs/31): kiedy go pokazać i od czego zacząć. Wspólne dla `/m` i testów.
 */

export type StartStep = StepOrSummary | 'intro'

/**
 * Pokazujemy sami tylko kontu, które go nie zaczęło albo nie skończyło – i dopiero po pełnym pobraniu tabeli
 * `onboarding` (inaczej istniejące konto na nowym urządzeniu zobaczyłoby kwestionariusz, zanim dojdzie jego wiersz
 * `legacy`). „Później” odkłada go do końca sesji.
 */
export function onboardingDue(o: { signedIn: boolean; synced: boolean; row: OnboardingRow | null | undefined; later: boolean }): boolean {
  if (!o.signedIn || !o.synced || o.later || o.row === undefined) return false
  return !o.row || o.row.deleted_at != null || o.row.status === 'draft'
}

const isStep = (s: string | null | undefined): s is Step => !!s && (STEPS as readonly string[]).includes(s)

/** Szkic i ekran startowy: skończony → podsumowanie (poprawki), przerwany → tam, gdzie skończył, nowy → powitanie. */
export function startFrom(row: OnboardingRow | null | undefined, settings: Partial<Settings>): { draft: Draft; step: StartStep } {
  if (row && !row.deleted_at && row.status === 'done' && row.data) {
    const { version: _v, ...data } = row.data
    return { draft: data, step: 'summary' }
  }
  if (row && !row.deleted_at && row.draft) {
    const first = firstIncomplete(row.draft)
    // zapisany krok, o ile wszystkie wcześniejsze są wypełnione (szkic mógł zmienić się na innym urządzeniu)
    const step = isStep(row.step) && (first === 'summary' || STEPS.indexOf(row.step) <= STEPS.indexOf(first)) ? row.step : first
    return { draft: row.draft, step }
  }
  return { draft: prefill(settings, row?.status === 'legacy'), step: 'intro' }
}

/**
 * Pola, które konto już ma w profilu. Progi i miernik tylko dla kont sprzed onboardingu – nowe konto ma w ustawieniach
 * wartości domyślne programu, nie swoje (docs/18, SettingsGate).
 */
export function prefill(s: Partial<Settings>, legacy: boolean): Draft {
  const d: Draft = {}
  if (s.height_cm != null || s.birth_date) d.body = { ...(s.height_cm != null ? { height_cm: s.height_cm } : {}), ...(s.birth_date ? { birth_date: s.birth_date } : {}) }
  if (legacy) {
    d.measure = s.power_meter ? { level: 'power', ftp_w: s.ftp_w_estimate ?? null } : { level: s.lthr_bpm ? 'hr' : 'rpe' }
    if (s.lthr_bpm) d.measure.lthr_bpm = s.lthr_bpm
    if (s.hr_max_bpm) d.measure.hr_max_bpm = s.hr_max_bpm
  }
  return d
}
