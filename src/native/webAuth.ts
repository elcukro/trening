import { registerPlugin } from '@capacitor/core'

/** Wtyczka Swift `native/trening-auth` (ASWebAuthenticationSession) – metody jak w `TreningAuthPlugin.swift`. */
interface TreningAuthPlugin {
  open(options: { url: string; callbackScheme: string }): Promise<{ url: string }>
}

const plugin = registerPlugin<TreningAuthPlugin>('TreningAuth')

/**
 * Logowanie w systemowym oknie (docs/28): otwiera `url` i czeka na powrót na `callbackScheme://…`.
 * Zwraca pełny adres powrotu albo `null`, gdy użytkownik zamknął okno. Tylko w aplikacji iOS.
 */
export async function openAuthSession(url: string, callbackScheme: string): Promise<string | null> {
  try {
    return (await plugin.open({ url, callbackScheme })).url
  } catch (e) {
    if ((e as { code?: string }).code === 'CANCELED') return null
    throw e
  }
}
