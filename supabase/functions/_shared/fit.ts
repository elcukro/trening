/**
 * Dekoder pliku FIT z jazdy (Wahoo ELEMNT – `workout_summary.file.url`, docs/33 § 7). Czysty TypeScript bez zależności,
 * testowany Vitestem (`src/engine/__tests__/fit.test.ts`). Czyta tylko to, czego potrzebują metryki: wiadomości
 * `record` (globalny numer 20) z czasem, mocą, tętnem, kadencją, prędkością, dystansem i wysokością. Pola deweloperskie
 * i pozostałe wiadomości są pomijane.
 *
 * Wynik ma kształt strumieni Stravy (`RawStreams`: time, heartrate, watts, cadence, velocity_smooth, distance,
 * altitude, moving), więc dalej liczy ten sam kod (`resample`, `rideMetrics`, `hrHistogram` z `metrics.ts`).
 */
import type { RawStreams } from './metrics.ts'

const RECORD = 20
/** sekundy między epoką FIT (1989-12-31T00:00:00Z) a epoką Uniksa */
const FIT_EPOCH_S = 631065600

interface FieldDef {
  num: number
  size: number
  base: number
}

interface Definition {
  global: number
  little: boolean
  fields: FieldDef[]
  devSize: number
  size: number
}

export interface FitRecord {
  /** sekundy od epoki Uniksa */
  t: number
  power: number | null
  hr: number | null
  cadence: number | null
  /** m/s */
  speed: number | null
  /** m */
  distance: number | null
  /** m */
  altitude: number | null
}

export interface FitDecoded {
  records: FitRecord[]
  /** czas pierwszej próbki (ISO) */
  start: string | null
}

// rozmiar i wartość „brak” dla typów bazowych FIT (numer typu = młodsze 5 bitów)
const BASE: Record<number, { size: number; invalid: number | null; signed: boolean; float?: boolean }> = {
  0x00: { size: 1, invalid: 0xff, signed: false },
  0x01: { size: 1, invalid: 0x7f, signed: true },
  0x02: { size: 1, invalid: 0xff, signed: false },
  0x03: { size: 2, invalid: 0x7fff, signed: true },
  0x04: { size: 2, invalid: 0xffff, signed: false },
  0x05: { size: 4, invalid: 0x7fffffff, signed: true },
  0x06: { size: 4, invalid: 0xffffffff, signed: false },
  0x08: { size: 4, invalid: null, signed: true, float: true },
  0x09: { size: 8, invalid: null, signed: true, float: true },
  0x0a: { size: 1, invalid: 0, signed: false },
  0x0b: { size: 2, invalid: 0, signed: false },
  0x0c: { size: 4, invalid: 0, signed: false },
}

function readValue(view: DataView, pos: number, f: FieldDef, little: boolean): number | null {
  const b = BASE[f.base & 0x1f]
  if (!b || b.size !== f.size) return null // tablice, napisy, typy 64-bitowe – niepotrzebne
  let v: number
  if (b.float) v = b.size === 4 ? view.getFloat32(pos, little) : view.getFloat64(pos, little)
  else if (b.size === 1) v = b.signed ? view.getInt8(pos) : view.getUint8(pos)
  else if (b.size === 2) v = b.signed ? view.getInt16(pos, little) : view.getUint16(pos, little)
  else v = b.signed ? view.getInt32(pos, little) : view.getUint32(pos, little)
  if (b.invalid != null && (b.signed ? v === b.invalid : v === b.invalid)) return null
  return Number.isFinite(v) ? v : null
}

/** Dekoduje plik FIT. Rzuca przy złym nagłówku; ucięty plik daje to, co dało się przeczytać. */
export function decodeFit(buf: ArrayBuffer | Uint8Array): FitDecoded {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerSize = bytes[0] ?? 0
  if ((headerSize !== 12 && headerSize !== 14) || bytes.length < headerSize) throw new Error('fit: zły nagłówek')
  const tag = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!)
  if (tag !== '.FIT') throw new Error('fit: brak sygnatury .FIT')
  const dataSize = view.getUint32(4, true)
  const end = Math.min(bytes.length, headerSize + dataSize)

  const defs = new Map<number, Definition>()
  const records: FitRecord[] = []
  let pos = headerSize
  let lastTs: number | null = null

  while (pos < end) {
    const h = bytes[pos++]!
    if (h & 0x80) {
      // skompresowany znacznik czasu: typ lokalny w bitach 5–6, przesunięcie w bitach 0–4
      const local = (h >> 5) & 0x03
      const offset = h & 0x1f
      const def = defs.get(local)
      if (!def || pos + def.size > end) break
      let ts: number | null = null
      if (lastTs != null) {
        ts = (lastTs & ~0x1f) + offset
        if (offset < (lastTs & 0x1f)) ts += 0x20
        lastTs = ts
      }
      readData(def, pos, ts)
      pos += def.size
      continue
    }
    const local = h & 0x0f
    if (h & 0x40) {
      // definicja
      if (pos + 5 > end) break
      const little = bytes[pos + 1] === 0
      const global = view.getUint16(pos + 2, little)
      const nf = bytes[pos + 4]!
      pos += 5
      const fields: FieldDef[] = []
      for (let i = 0; i < nf; i++) {
        fields.push({ num: bytes[pos]!, size: bytes[pos + 1]!, base: bytes[pos + 2]! })
        pos += 3
      }
      let devSize = 0
      if (h & 0x20) {
        const nd = bytes[pos++]!
        for (let i = 0; i < nd; i++) {
          devSize += bytes[pos + 1]!
          pos += 3
        }
      }
      const size = fields.reduce((s, f) => s + f.size, 0) + devSize
      defs.set(local, { global, little, fields, devSize, size })
      continue
    }
    const def = defs.get(local)
    if (!def || pos + def.size > end) break
    readData(def, pos, null)
    pos += def.size
  }

  function readData(def: Definition, at: number, compressedTs: number | null): void {
    let p = at
    const v: Record<number, number | null> = {}
    for (const f of def.fields) {
      v[f.num] = readValue(view, p, f, def.little)
      p += f.size
    }
    const ts = v[253] ?? compressedTs
    if (v[253] != null) lastTs = v[253]!
    if (def.global !== RECORD || ts == null) return
    const speed = v[73] != null ? v[73]! / 1000 : v[6] != null ? v[6]! / 1000 : null
    const altitude = v[78] != null ? v[78]! / 5 - 500 : v[2] != null ? v[2]! / 5 - 500 : null
    records.push({
      t: ts + FIT_EPOCH_S,
      power: v[7] ?? null,
      hr: v[3] ?? null,
      cadence: v[4] ?? null,
      speed,
      distance: v[5] != null ? v[5]! / 100 : null,
      altitude,
    })
  }

  records.sort((a, b) => a.t - b.t)
  return { records, start: records[0] ? new Date(records[0].t * 1000).toISOString() : null }
}

/**
 * Próbki FIT → strumienie w formacie Stravy. `moving`: prędkość > 0,5 m/s, a bez prędkości (trenażer bez czujnika)
 * – kadencja albo moc > 0. Czas od pierwszej próbki, z przerwami (jak `time` w Stravie).
 */
export function fitToStreams(d: FitDecoded): RawStreams | null {
  const r = d.records
  if (r.length < 2) return null
  const t0 = r[0]!.t
  const col = <K extends keyof FitRecord>(k: K) => r.map((x) => x[k] as number | null)
  const has = (k: keyof FitRecord) => r.some((x) => x[k] != null)
  const out: RawStreams = { time: { data: r.map((x) => x.t - t0) } }
  if (has('hr')) out.heartrate = { data: col('hr') }
  if (has('power')) out.watts = { data: col('power') }
  if (has('cadence')) out.cadence = { data: col('cadence') }
  if (has('speed')) out.velocity_smooth = { data: col('speed') }
  if (has('distance')) out.distance = { data: col('distance') }
  if (has('altitude')) out.altitude = { data: col('altitude') }
  out.moving = { data: r.map((x) => (x.speed != null ? x.speed > 0.5 : (x.cadence ?? 0) > 0 || (x.power ?? 0) > 0)) }
  return out
}
