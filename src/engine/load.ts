/** R8 – progresja ciężaru i e1RM. */

export interface LoggedSet {
  weight_kg: number
  reps: number
  rir: number | null
  is_warmup?: boolean
}

export interface SessionHistoryEntry {
  date: string
  /** preskrypcja obowiązująca w tamtej sesji */
  rx: { sets: number; reps: number; rir: number | null }
  sets: LoggedSet[]
}

export interface LoadSuggestion {
  weight_kg: number | null
  delta_kg: number
  reason: string
  /** true, gdy brak historii – UI pyta o ciężar startowy */
  needs_start_weight: boolean
}

const BARBELL = new Set(['back_squat', 'rdl', 'trap_bar_deadlift', 'hip_thrust', 'back_extension'])
const DUMBBELL = new Set(['step_up', 'bulgarian_split_squat', 'db_row', 'farmer_walk', 'calf_raise', 'jump_squat', 'kb_swing'])

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

export function loadStep(exerciseId: string): number {
  if (BARBELL.has(exerciseId)) return 2.5
  if (DUMBBELL.has(exerciseId)) return 1
  return 2.5
}

export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0) return 0
  if (reps === 1) return weightKg
  return weightKg * (1 + reps / 30)
}

function workingWeight(entry: SessionHistoryEntry): number {
  const work = entry.sets.filter((s) => !s.is_warmup)
  if (work.length === 0) return 0
  return Math.max(...work.map((s) => s.weight_kg))
}

function missedSets(entry: SessionHistoryEntry): number {
  const rir = entry.rx.rir
  return entry.sets
    .filter((s) => !s.is_warmup)
    .filter((s) => s.reps < entry.rx.reps || (rir != null && s.rir != null && s.rir < rir)).length
}

export function suggestLoad(
  exerciseId: string,
  history: SessionHistoryEntry[],
  rx: { sets: number; reps: number; rir: number | null },
  opts: { deload?: boolean; intro?: boolean } = {},
): LoadSuggestion {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : 1))
  const last = sorted.at(-1)
  if (!last || last.sets.filter((s) => !s.is_warmup).length === 0) {
    return { weight_kg: null, delta_kg: 0, reason: 'Brak historii – wpisz ciężar, który zrobisz 8× z zapasem 3–4 powtórzeń.', needs_start_weight: true }
  }
  const step = loadStep(exerciseId)
  const isBarbell = BARBELL.has(exerciseId)
  const lastW = workingWeight(last)
  const round = (w: number) => roundTo(w, step)

  if (opts.deload) {
    const w = round(lastW * 0.9)
    return { weight_kg: w, delta_kg: w - lastW, reason: 'Tydzień rozładowania: ciężar −10%, serie −40%, RIR +1.', needs_start_weight: false }
  }
  if (opts.intro) {
    return { weight_kg: lastW, delta_kg: 0, reason: 'Tygodnie wdrożenia: dobierz ciężar tak, by zostały 4 powtórzenia w zapasie.', needs_start_weight: false }
  }
  if (rx.reps < last.rx.reps) {
    const w = round(lastW + (isBarbell ? 2.5 : step))
    return { weight_kg: w, delta_kg: w - lastW, reason: `Mniej powtórzeń w nowym tygodniu (${last.rx.reps} → ${rx.reps}): +${w - lastW} kg względem ostatniego ciężaru.`, needs_start_weight: false }
  }
  const missed = missedSets(last)
  if (missed === 0) {
    const work = last.sets.filter((s) => !s.is_warmup)
    const bigMargin = rx.rir != null && work.every((s) => s.rir != null && s.rir >= (rx.rir as number) + 2)
    let inc: number
    if (isBarbell) inc = bigMargin ? 5 : 2.5
    else inc = bigMargin ? 2 : 1
    const w = round(lastW + inc)
    return {
      weight_kg: w,
      delta_kg: w - lastW,
      reason: bigMargin ? `Wszystkie serie z dużym zapasem (RIR ≥ ${(rx.rir ?? 0) + 2}): +${inc} kg.` : `Wszystkie serie wykonane z zadanym zapasem: +${inc} kg.`,
      needs_start_weight: false,
    }
  }
  if (missed === 1) {
    return { weight_kg: lastW, delta_kg: 0, reason: 'Jedna seria z brakującym powtórzeniem: ten sam ciężar.', needs_start_weight: false }
  }
  const prev = sorted.at(-2)
  if (prev && missedSets(prev) >= 2) {
    const w = round(lastW * 0.9)
    return { weight_kg: w, delta_kg: w - lastW, reason: 'Drugi raz z rzędu ≥ 2 serie z brakami: −10% i odbudowa.', needs_start_weight: false }
  }
  return { weight_kg: lastW, delta_kg: 0, reason: '≥ 2 serie z brakami: ten sam ciężar. Jeśli powtórzy się w przyszłym tygodniu – −10%.', needs_start_weight: false }
}

/** Serie wstępne z ciężaru roboczego: pusta sztanga → 50% → 70% → 85%. */
export function warmupSets(workingKg: number, barKg = 20): { weight_kg: number; reps: number }[] {
  if (workingKg <= barKg) return [{ weight_kg: barKg, reps: 8 }]
  return [
    { weight_kg: barKg, reps: 8 },
    { weight_kg: roundTo(workingKg * 0.5, 2.5), reps: 5 },
    { weight_kg: roundTo(workingKg * 0.7, 2.5), reps: 3 },
    { weight_kg: roundTo(workingKg * 0.85, 2.5), reps: 2 },
  ]
}
