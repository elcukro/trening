import type { BikeWorkout, HrZone, PowerZone, Program, Step, StepBlock } from './schema'
import type { ResolvedStep, ResolvedWorkout, ZoneBpm } from './types'

export function computeZones(zones: HrZone[], lthr: number): ZoneBpm[] {
  return zones.map((z) => ({
    id: z.id,
    name: z.name,
    low_frac: z.low,
    high_frac: z.high,
    low_bpm: Math.round(z.low * lthr),
    high_bpm: Math.round(z.high * lthr),
    rpe: z.rpe,
  }))
}

/**
 * Strefa mocy odpowiadająca strefie tętna kroku. Z5a (nadprogowa) nie ma osobnej strefy mocy –
 * dostaje przedział tuż nad FTP.
 */
export function powerFraction(zoneId: string, zones: PowerZone[]): { low: number; high: number } | null {
  const z = zones.find((p) => p.id === zoneId)
  if (z) return { low: z.low, high: z.high }
  if (zoneId === 'Z5a') return { low: 1.0, high: 1.06 }
  return null
}

export function wattsRange(zoneId: string, zones: PowerZone[], ftp: number | null): [number, number] | null {
  if (!ftp) return null
  const f = powerFraction(zoneId, zones)
  if (!f) return null
  return [Math.round(f.low * ftp), Math.round(f.high * ftp)]
}

export function bpmRange(step: Pick<Step, 'target'>, lthr: number | null, heatOffset = 0): [number, number] | null {
  if (!lthr) return null
  const lo = Math.round(step.target.low * lthr) - heatOffset
  const hi = Math.round(step.target.high * lthr) - heatOffset
  return [Math.max(0, lo), Math.max(0, hi)]
}

function isRepeat(b: StepBlock): b is { repeat: number; steps: StepBlock[] } {
  return 'repeat' in b
}

export function totalSeconds(blocks: StepBlock[]): number {
  let t = 0
  for (const b of blocks) {
    t += isRepeat(b) ? b.repeat * totalSeconds(b.steps) : b.duration_s
  }
  return t
}

interface FlattenOpts {
  lthr: number | null
  heatOffset: number
  ftp: number | null
  powerZones: PowerZone[]
}

function flatten(blocks: StepBlock[], o: FlattenOpts, depth: number, out: ResolvedStep[]): void {
  for (const b of blocks) {
    if (isRepeat(b)) {
      for (let r = 1; r <= b.repeat; r++) {
        const before = out.length
        flatten(b.steps, o, depth + 1, out)
        for (let i = before; i < out.length; i++) out[i]!.repeat_label = `${r}/${b.repeat}`
      }
    } else {
      const step: ResolvedStep = {
        name: b.name,
        duration_s: b.duration_s,
        zone: b.zone,
        bpm: bpmRange(b, o.lthr, o.heatOffset),
        watts: wattsRange(b.zone, o.powerZones, o.ftp),
        rpe: b.rpe,
        intensity_type: b.intensity_type,
        depth,
      }
      if (b.cadence_rpm) step.cadence_rpm = b.cadence_rpm
      if (b.note) step.note = b.note
      out.push(step)
    }
  }
}

/** Kroki treningu z czasem z kalendarza (jazdy parametryczne) i celami w bpm (gdy jest LTHR). */
export function resolveWorkout(
  workout: BikeWorkout,
  durationMin: number,
  lthr: number | null,
  opts: { heatOffsetBpm?: number; ftp?: number | null; powerZones?: PowerZone[] } = {},
): ResolvedWorkout {
  const heat = opts.heatOffsetBpm ?? 0
  let blocks: StepBlock[] = workout.steps
  if (workout.parametric_duration && workout.steps.length === 1 && !isRepeat(workout.steps[0]!)) {
    const base = workout.steps[0]!
    const total = durationMin * 60
    if (workout.insert) {
      const insertSec = totalSeconds([workout.insert])
      const rest = Math.max(0, total - insertSec)
      const before = Math.round(rest / 2 / 60) * 60
      const after = Math.max(0, rest - before)
      blocks = [{ ...base, duration_s: before }, workout.insert, { ...base, name: `${base.name} (c.d.)`, duration_s: after }]
    } else {
      blocks = [{ ...base, duration_s: total }]
    }
  }
  const steps: ResolvedStep[] = []
  flatten(blocks, { lthr, heatOffset: heat, ftp: opts.ftp ?? null, powerZones: opts.powerZones ?? [] }, 0, steps)
  return {
    id: workout.id,
    name: workout.name,
    category: workout.category,
    key: workout.key,
    description: workout.description,
    duration_min: workout.parametric_duration ? durationMin : workout.duration_min,
    steps,
    has_bpm: lthr != null,
  }
}

export function zoneById(program: Program, id: string): HrZone | undefined {
  return program.hr_zones_lthr_fraction.find((z) => z.id === id)
}

/** Czas w strefach (sekundy) z histogramu tętna (indeks = bpm) dla danego LTHR. Strefy nakładające się (SS/Z4/THR) – bpm liczy się do pierwszej pasującej w kolejności listy. */
export function zoneDistribution(histogram: number[], zones: HrZone[], lthr: number): { id: string; seconds: number; pct: number }[] {
  const bpmZones = computeZones(zones, lthr)
  const out = bpmZones.map((z) => ({ id: z.id, seconds: 0, pct: 0 }))
  let total = 0
  histogram.forEach((sec, bpm) => {
    if (!sec) return
    total += sec
    const idx = bpmZones.findIndex((z, i) => bpm >= z.low_bpm && (bpm < z.high_bpm || (i === bpmZones.length - 1 && bpm >= z.low_bpm)))
    // granice po zaokrągleniu mają dziury (np. Z3 do 140, Z4 od 141): wartość z dziury należy do najbliższej strefy
    // poniżej – wcześniej trafiała do ostatniej (Z5c na spokojnej jeździe)
    let target = idx
    if (target < 0) {
      target = 0
      bpmZones.forEach((z, i) => {
        if (bpm >= z.high_bpm && z.high_bpm >= bpmZones[target]!.high_bpm) target = i
      })
      if (bpm > bpmZones.at(-1)!.high_bpm) target = bpmZones.length - 1
    }
    out[target]!.seconds += sec
  })
  if (total > 0) for (const o of out) o.pct = Math.round((o.seconds / total) * 100)
  return out
}
