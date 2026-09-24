import alpsJson from '../../data/program.json'
import ftp300Json from '../../data/program-ftp300.json'
import { parseProgram, type Program } from '@/engine/schema'

/**
 * Programy treningowe. Każde konto ma swój (`settings.program_id`) – ustalenia jednego zawodnika
 * (strefy, kadencja, żywienie, rower) nie przenoszą się na drugiego, bo siedzą w jego pliku programu.
 */
export const PROGRAMS = [
  {
    id: 'alps2027',
    name: 'Alpy 2027 – baza i góry',
    short: 'Alpy 2027',
    /** cel wyrażony prędkością: wymagane FTP liczy fizyka (masa, CdA, Crr) */
    goal: { kind: 'speed', kmh: 30, label: '30 km/h przez 2–3 godziny' },
    json: alpsJson as unknown,
  },
  {
    id: 'ftp300',
    name: 'FTP 300 – próg i VO2max',
    short: 'FTP 300',
    /** cel wyrażony wprost mocą progową – z ustawienia `ftp_w_goal` */
    goal: { kind: 'ftp', label: 'FTP 300 W i wyższe VO2max' },
    json: ftp300Json as unknown,
  },
] as const

export type ProgramId = (typeof PROGRAMS)[number]['id']
export const DEFAULT_PROGRAM_ID: ProgramId = 'alps2027'

const cache = new Map<string, Program>()

/** Program treningowy z `data/`, zwalidowany schematem Zod (raz na identyfikator). */
export function loadProgram(id: string = DEFAULT_PROGRAM_ID): Program {
  const found = cache.get(id)
  if (found) return found
  const entry = PROGRAMS.find((p) => p.id === id) ?? PROGRAMS[0]
  const parsed = parseProgram(entry.json)
  cache.set(id, parsed)
  return parsed
}

export function programMeta(id: string | undefined) {
  return PROGRAMS.find((p) => p.id === id) ?? PROGRAMS[0]
}
