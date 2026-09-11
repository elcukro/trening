import { supabase } from './supabase'

export interface StravaStatus {
  connected: boolean
  athlete_id: string | null
  expires_at: string | null
  scope: string | null
  activities: number
}


const ERROR_PL: Record<string, string> = {
  unauthorized: 'Zaloguj się w Ustawieniach → Konto, żeby korzystać z integracji.',
  not_connected: 'Integracja nie jest połączona – zrób to w Ustawieniach → Integracje.',
  no_items: 'Na ten okres nie ma treningów do wysłania.',
  unknown_action: 'Nieznana akcja – zgłoś błąd.',
  method: 'Nieobsługiwane żądanie.',
}

function translate(code: string): string {
  return ERROR_PL[code] ?? code
}

/** Żądanie do funkcji nie może wisieć w nieskończoność – bez tego interfejs zostaje „w toku”. */
async function withTimeout<T>(p: Promise<T>, ms = 45_000): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Brak odpowiedzi serwera w ${ms / 1000} s.`)), ms))])
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Brak konfiguracji Supabase.')
  const { data, error } = await withTimeout(supabase.functions.invoke('strava-oauth', { body: { action, ...extra } }))
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) detail = ((await ctx.json()) as { error?: string }).error ?? detail
    } catch {
      /* ignoruj */
    }
    throw new Error(translate(detail))
  }
  return data as T
}

export const strava = {
  status: () => call<StravaStatus>('status'),
  startUrl: () => call<{ url: string }>('start'),
  disconnect: () => call<{ ok: boolean }>('disconnect'),
  subscribe: () => call<{ ok: boolean; detail: string }>('subscribe'),
  sync: (days = 14) => call<{ ok: boolean; imported: number; scanned: number }>('sync', { days }),
}
