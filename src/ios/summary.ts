import type { ResolvedStep, ResolvedWorkout } from '@/engine/types'
import { isWorkStep } from '@/engine/analysis'

/**
 * Cel „główny” treningu: najdłuższy krok pracy. Uproszczony interfejs pokazuje jedną trójkę
 * (waty / bpm / kadencja) zamiast całej listy kroków – szczegóły są na ekranie treningu.
 */
export interface MainTarget {
  zone: string
  watts: [number, number] | null
  bpm: [number, number] | null
  cadence: [number, number] | null
  rpe: [number, number]
}

export function mainTarget(w: ResolvedWorkout): MainTarget | null {
  const work = w.steps.filter((s) => isWorkStep(s))
  const pick: ResolvedStep | undefined = (work.length ? work : w.steps).reduce<ResolvedStep | undefined>((best, s) => (!best || s.duration_s > best.duration_s ? s : best), undefined)
  if (!pick) return null
  return { zone: pick.zone, watts: pick.watts, bpm: pick.bpm, cadence: pick.cadence_rpm ?? null, rpe: pick.rpe }
}

/** Ile razy powtarza się krok pracy – „3 × 12 min” zamiast dziesięciu wierszy. */
export function structureLabel(w: ResolvedWorkout): string | null {
  const work = w.steps.filter((s) => isWorkStep(s) && s.depth > 0)
  if (work.length < 2) return null
  const first = work[0]
  if (!first) return null
  const same = work.filter((s) => s.name === first.name)
  if (same.length < 2) return null
  const min = Math.round(first.duration_s / 60)
  return `${same.length} × ${min} min`
}
