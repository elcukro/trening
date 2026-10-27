import alpsJson from '../../data/program.json'
import ftp300Json from '../../data/program-ftp300.json'
import { parseProgram, type Program } from '@/engine/schema'
import { getLang, type Lang } from '@/i18n/core'
import { localizeProgram } from './localize'

/**
 * Rejestr plików programów. Nazwy, cele, żywienie, rowery i kadencja siedzą w samych plikach
 * (`meta`, `goal`, `nutrition`, `bikes`, `cadence`) – tu jest tylko identyfikator i źródło.
 */
export const PROGRAMS = [
  { id: 'alps2027', json: alpsJson as unknown },
  { id: 'ftp300', json: ftp300Json as unknown },
] as const

export type ProgramId = (typeof PROGRAMS)[number]['id']
export const DEFAULT_PROGRAM_ID: ProgramId = 'alps2027'

const cache = new Map<string, Program>()

/** Program treningowy z `data/`, zwalidowany schematem Zod, w danym języku (raz na identyfikator i język). */
export function loadProgram(id: string = DEFAULT_PROGRAM_ID, lang: Lang = getLang()): Program {
  const key = `${id}|${lang}`
  const found = cache.get(key)
  if (found) return found
  const entry = PROGRAMS.find((p) => p.id === id) ?? PROGRAMS[0]
  const parsed = localizeProgram(parseProgram(entry.json), lang)
  cache.set(key, parsed)
  return parsed
}

/** Lista do wyboru w Ustawieniach: identyfikator + nazwa z pliku programu. */
export function programOptions(): { id: string; name: string }[] {
  return PROGRAMS.map((p) => ({ id: p.id, name: loadProgram(p.id).meta.name }))
}
