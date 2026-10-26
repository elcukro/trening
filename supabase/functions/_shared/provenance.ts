/**
 * Proweniencja danych dla AI (docs/33 § 4). Czysty TS – ten sam kod w Edge Functions i w aplikacji (Vitest:
 * `src/engine/__tests__/provenance.test.ts`).
 *
 * Polityka API Stravy (1.06.2026) § 5.3 zakazuje użycia danych Stravy – także pochodnych – „in connection with the […]
 * operation of any AI Application”, łącznie z „ingestion into a context window”, a § 5.10 przekazywania ich dostawcom
 * AI „even if a user […] consents”. Dlatego do modelu idą wyłącznie dane z oznaczonym źródłem z `AI_SOURCES`.
 */

/** Skąd pochodzi wiersz z metrykami jazdy albo dnia. */
export type DataSource = 'wahoo' | 'strava' | 'fit' | 'manual' | 'health'

/** Źródła, które wolno przekazać modelowi (Anthropic, OpenRouter). Strava – nigdy. */
export const AI_SOURCES: readonly DataSource[] = ['wahoo', 'fit', 'manual', 'health']

export const isAiSource = (s: string | null | undefined): boolean => s != null && (AI_SOURCES as readonly string[]).includes(s)

/** Tylko wiersze o źródle dozwolonym dla AI (wiersz bez źródła odpada – bez proweniencji nie wiemy, skąd jest). */
export function aiSafe<T extends { source?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((r) => isAiSource(r.source))
}

export class StravaDataInAiError extends Error {
  constructor(public path: string) {
    super(`dane Stravy w danych dla AI: ${path}`)
  }
}

/**
 * Sprawdza cały obiekt, zanim trafi do modelu: rzuca, gdy znajdzie `source: 'strava'` albo klucz zaczynający się od
 * `strava` z wartością (np. `strava_activity_id`). Drugi bezpiecznik po filtrach w budowaniu kontekstu – serwer
 * odrzuca także kontekst przysłany przez aplikację.
 */
export function assertAiSafe(payload: unknown, path = '$'): void {
  if (payload == null || typeof payload !== 'object') return
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertAiSafe(v, `${path}[${i}]`))
    return
  }
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (k === 'source' && v === 'strava') throw new StravaDataInAiError(`${path}.${k}`)
    if (/^strava/i.test(k) && v != null && v !== false) throw new StravaDataInAiError(`${path}.${k}`)
    // log dnia zbudowany z jazd Stravy ma w notatce „Strava: <nazwy>” (trigger `rebuild_day_log`)
    if (typeof v === 'string' && v.startsWith('Strava: ')) throw new StravaDataInAiError(`${path}.${k}`)
    assertAiSafe(v, `${path}.${k}`)
  }
}
