import type { GymItem, GymSession } from '@/engine/schema'

/**
 * Kolejność serii w sesji: ćwiczenia wykonywane po kolei, ale superserie (bloki 3A/3B, 4A/4B)
 * i obwody (`circuit`) przeplatają się: runda 1: A1, B1; runda 2: A2, B2…
 * Rozgrzewka i schłodzenie to pojedyncze „serie” do odhaczenia.
 */
export interface SeqStep {
  itemIndex: number
  setNo: number
  totalSets: number
  /** ćwiczenia w tej samej grupie (superseria/obwód) – do przełączania na ekranie */
  groupIndexes: number[]
}

export function setsOf(item: GymItem): number {
  return typeof item.rx.sets === 'number' ? item.rx.sets : 1
}

function groupKey(item: GymItem): string | null {
  if (item.circuit) return `circuit:${item.circuit}`
  const m = item.block ? /^(\d+)([A-Za-z])$/.exec(item.block) : null
  return m ? `super:${m[1]}` : null
}

export function buildSequence(session: GymSession): SeqStep[] {
  const groups: number[][] = []
  const byKey = new Map<string, number[]>()
  session.items.forEach((it, i) => {
    const k = groupKey(it)
    if (!k) {
      groups.push([i])
      return
    }
    let g = byKey.get(k)
    if (!g) {
      g = []
      byKey.set(k, g)
      groups.push(g)
    }
    g.push(i)
  })
  const out: SeqStep[] = []
  for (const g of groups) {
    const rounds = Math.max(...g.map((i) => setsOf(session.items[i]!)))
    for (let r = 1; r <= rounds; r++) {
      for (const i of g) {
        const total = setsOf(session.items[i]!)
        if (r <= total) out.push({ itemIndex: i, setNo: r, totalSets: total, groupIndexes: g })
      }
    }
  }
  return out
}

/** Czy ćwiczenie ma ciężar/powtórzenia do wpisania (a nie tylko odhaczenie). */
export function isLoggable(item: GymItem): boolean {
  return !['mobility_circuit', 'cooldown_stretch'].includes(item.exercise)
}

export function parseReps(reps: number | string): number | null {
  if (typeof reps === 'number') return reps
  const m = /^(\d+)/.exec(reps)
  return m ? Number(m[1]) : null
}

export function parseRir(rir: number | string | undefined): number | null {
  if (rir === undefined) return null
  if (typeof rir === 'number') return rir
  const m = /^(\d+)/.exec(rir)
  return m ? Number(m[1]) : null
}
