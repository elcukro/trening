import type { OnboardingRow } from '@/db'
import { addDays } from '@/engine/dates'
import type { HealthProfile } from './health'
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

export type BodyField = 'height_cm' | 'weight_kg' | 'birth_date' | 'sex'

/** Najpóźniejsza data urodzenia w onboardingu (16 lat – minimalny wiek, docs/29 § 1); ten sam limit ma kalendarz. */
export const birthMax = (today: string) => addDays(today, -16 * 365)

/**
 * Ciało ze Zdrowia (aplikacja iOS, docs/31): wypełnia tylko pola puste – wartość z profilu i wybór zawodnika zostają.
 * Puste jest też `null` (pominięty krok, „nie wiem”), bo po zapisie nie da się ich odróżnić; wypełnienie dzieje się raz
 * przy wejściu na krok i zawodnik może je od razu poprawić. Liczby jak na listach: wzrost w cm, masa co 0,5 kg;
 * wartości spoza zakresów schematu odpadają.
 */
export function bodyFromHealth(body: Draft['body'], h: HealthProfile | null, today: string): { body: NonNullable<Draft['body']>; filled: BodyField[] } {
  const out = { ...body }
  const filled: BodyField[] = []
  if (!h) return { body: out, filled }
  const height = h.height_cm != null ? Math.round(h.height_cm) : null
  if (out.height_cm == null && height != null && height >= 120 && height <= 230) {
    out.height_cm = height
    filled.push('height_cm')
  }
  const weight = h.weight_kg != null ? Math.round(h.weight_kg * 2) / 2 : null
  if (out.weight_kg == null && weight != null && weight >= 35 && weight <= 200) {
    out.weight_kg = weight
    filled.push('weight_kg')
  }
  if (out.birth_date == null && h.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(h.birth_date) && h.birth_date >= '1920-01-01' && h.birth_date <= birthMax(today)) {
    out.birth_date = h.birth_date
    filled.push('birth_date')
  }
  if (out.sex == null && (h.sex === 'female' || h.sex === 'male')) {
    out.sex = h.sex
    filled.push('sex')
  }
  return { body: out, filled }
}
