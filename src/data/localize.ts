import type { Lang } from '@/i18n/core'
import type { Program } from '@/engine/schema'

/** Pola, których nie tłumaczymy, nawet gdy wartość przypadkiem równa się tekstowi z tabeli (identyfikatory, daty). */
const SKIP_KEYS = new Set(['id', 'version', 'program_id', 'language', 'kind', 'phase', 'type', 'intensity', 'day_type', 'workout', 'translations'])

function swap(value: unknown, table: Record<string, string>, key?: string): unknown {
  if (key && SKIP_KEYS.has(key)) return value
  if (typeof value === 'string') return table[value] ?? value
  if (Array.isArray(value)) return value.map((v) => swap(v, table))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = swap(v, table, k)
    return out
  }
  return value
}

/**
 * Program w danym języku (docs/34 § 5): teksty polskie podmienione według `program.translations[lang]`.
 * Struktura, liczby i identyfikatory bez zmian – silnik liczy dokładnie to samo, tylko opisy są w innym języku.
 */
export function localizeProgram(program: Program, lang: Lang): Program {
  if (lang === 'pl') return program
  const table = program.translations?.[lang]
  if (!table) return program
  return swap(program, table) as Program
}
