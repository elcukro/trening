import type { PlanRow } from '@/db'
import { GENERATED_PROGRAM_ID, GENERATOR_VERSION, generateFromInputs } from '@/engine/generator'
import type { Program } from '@/engine/schema'
import { getLang, type Lang } from '@/i18n/core'
import { DEFAULT_PROGRAM_ID, loadProgram } from './program'

/**
 * Program konta z wiersza `plans` (docs/32 § 7): regenerowany deterministycznie z parametrów i daty `generated_for`,
 * raz na wersję wiersza (pamięć podręczna po `updated_at`). Czysty TS bez React – `useSettings` tylko podaje wiersz.
 */

let cache: { key: string; program: Program } | null = null

export function generatedProgram(row: PlanRow, lang: Lang = getLang()): Program {
  const key = `${row.id}|${row.updated_at}|${GENERATOR_VERSION}|${lang}`
  if (cache?.key === key) return cache.program
  const program = generateFromInputs(row.inputs, row.extras, row.generated_for, row.tuning).program
  cache = { key, program }
  return program
}

/** Plan liczony inną wersją generatora – aplikacja może zaproponować przeliczenie zamiast zmieniać plan po cichu. */
export function planOutdated(row: PlanRow | null | undefined): boolean {
  return !!row && row.generator_version !== GENERATOR_VERSION
}

/**
 * Program dla identyfikatora z profilu: `generated` → z wiersza `plans` (gdy jest), inaczej program z `data/`.
 * `generated` bez wiersza (świeże urządzenie przed synchronizacją, usunięty plan) spada na program domyślny –
 * o tym, czy to chwilowe, decyduje `useSettings` (stan oczekiwania).
 */
export function resolveProgram(programId: string | undefined, plan: PlanRow | null | undefined, lang: Lang = getLang()): Program {
  if (programId === GENERATED_PROGRAM_ID && plan && !plan.deleted_at) return generatedProgram(plan, lang)
  return loadProgram(programId === GENERATED_PROGRAM_ID ? DEFAULT_PROGRAM_ID : programId, lang)
}

export { GENERATED_PROGRAM_ID }
