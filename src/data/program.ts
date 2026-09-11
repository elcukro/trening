import programJson from '../../data/program.json'
import { parseProgram, type Program } from '@/engine/schema'

let cached: Program | null = null

/** Program treningowy z `data/program.json`, zwalidowany schematem Zod (raz, przy pierwszym użyciu). */
export function loadProgram(): Program {
  if (!cached) cached = parseProgram(programJson)
  return cached
}
