/**
 * Scalanie profilu per pole (docs/18, krok 5). Każde pole ma własny znacznik czasu – lokalnie
 * `settings.field_updated_at`, na serwerze `profiles.field_updated_at` – i wygrywa nowszy zapis tego pola,
 * a nie całego wiersza. Dzięki temu:
 * - pole, którego stary klient nie znał (np. `program_id`), dochodzi do nowego klienta mimo zrównanych znaczników wiersza,
 * - zmiana pola w SQL Editorze (trigger stempluje ją na serwerze) nie jest nadpisywana przez niezwiązaną zmianę na telefonie.
 *
 * Brak znacznika pola = znacznik całego wiersza (dane sprzed tej zmiany). Czysty TS, bez bazy i sieci.
 */

export interface LocalProfile {
  value: Record<string, unknown>
  updated_at: string
  field_updated_at?: Record<string, string>
}

export interface RemoteProfile {
  updated_at: string
  field_updated_at?: Record<string, string> | null
  [column: string]: unknown
}

export interface ProfileMerge {
  /** kolumny do wysłania (z wartościami i znacznikami); null = nic */
  push: { row: Record<string, unknown>; field_updated_at: Record<string, string>; updated_at: string } | null
  /** nowy stan lokalny; null = bez zmian */
  pull: LocalProfile | null
}

/** Liczby z Postgresa (numeric) przychodzą jako tekst. */
function fromRemote(key: string, v: unknown, textKeys: ReadonlySet<string>): unknown {
  return typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && !textKeys.has(key) ? Number(v) : v
}

export function mergeProfile(local: LocalProfile | undefined, remote: RemoteProfile | null, map: readonly (readonly [string, string])[], textKeys: ReadonlySet<string> = new Set()): ProfileMerge {
  const pushRow: Record<string, unknown> = {}
  const pushTs: Record<string, string> = {}
  const pulledValue: Record<string, unknown> = { ...local?.value }
  const pulledTs: Record<string, string> = local ? withFieldStamps(local) : {}
  let pulled = false

  for (const [key, col] of map) {
    const hasLocal = !!local && key in local.value && local.value[key] !== undefined
    const lts = hasLocal ? (local!.field_updated_at?.[key] ?? local!.updated_at) : null
    const rv = remote?.[col]
    const hasRemote = rv !== null && rv !== undefined
    const rts = remote && (hasRemote || remote.field_updated_at?.[col]) ? (remote.field_updated_at?.[col] ?? remote.updated_at) : null

    if (lts && (!rts || lts > rts)) {
      pushRow[col] = local!.value[key]
      pushTs[col] = lts
    } else if (rts && (hasRemote || !!remote?.field_updated_at?.[col]) && (!lts || rts > lts)) {
      // pole wyczyszczone na innym urządzeniu (null ze znacznikiem) też dochodzi
      pulledValue[key] = hasRemote ? fromRemote(key, rv, textKeys) : null
      pulledTs[key] = rts
      pulled = true
    }
  }

  const tsList = [...Object.values(pushTs), local?.updated_at, remote?.updated_at].filter((x): x is string => !!x)
  const newest = tsList.toSorted().at(-1) ?? new Date(0).toISOString()
  return {
    push: Object.keys(pushRow).length > 0 ? { row: pushRow, field_updated_at: pushTs, updated_at: newest } : null,
    pull: pulled ? { value: pulledValue, field_updated_at: pulledTs, updated_at: [local?.updated_at, remote?.updated_at].filter((x): x is string => !!x).toSorted().at(-1)! } : null,
  }
}

/**
 * Znaczniki pól z uzupełnieniem: pole bez własnego znacznika dostaje znacznik wiersza. Trzeba to zrobić,
 * zanim wiersz dostanie nowszy `updated_at` – inaczej stare pola udawałyby świeże i wracałyby na serwer.
 */
export function withFieldStamps(p: LocalProfile): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(p.value)) if (p.value[k] !== undefined) out[k] = p.updated_at
  return { ...out, ...p.field_updated_at }
}

/** Które klucze naprawdę zmienia zapis (porównanie z tym, co użytkownik widzi) – tylko one dostają nowy znacznik. */
export function changedKeys(stored: Record<string, unknown>, effective: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  return Object.keys(patch).filter((k) => patch[k] !== undefined && !same(k in stored ? stored[k] : effective[k], patch[k]))
}
