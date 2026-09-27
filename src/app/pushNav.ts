/**
 * Cele powiadomień push (docs/12) na telefonie w uproszczonym interfejsie (`/i`).
 * Serwer wysyła ścieżki pełnej aplikacji (`/`, `/dzien/:date`, `/postep/tydzien/:monday`) – service worker
 * nie wie, którego widoku używa telefon, więc mapowanie robi aplikacja przy wejściu (ModeGate) i po wiadomości z SW.
 */

/** Odpowiednik ścieżki pełnej aplikacji w `/i`; `null`, gdy ekranu nie ma w uproszczonym interfejsie (zostaje pełna aplikacja). */
export function iosPathFor(pathname: string): string | null {
  if (pathname === '/' || pathname === '') return '/i'
  if (pathname.startsWith('/i/') || pathname === '/i') return null
  const m = pathname.match(/^\/(dzien|tydzien|postep)(\/[^/]+)?$/)
  if (!m) return null
  // /postep/:cos to raporty pełnej aplikacji – w /i jest tylko sam Postęp
  if (m[1] === 'postep' && m[2]) return null
  return `/i/${m[1]}${m[2] ?? ''}`
}

export interface NavigateMessage {
  type: 'navigate'
  url: string
}

export function isNavigateMessage(data: unknown): data is NavigateMessage {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'navigate' && typeof (data as { url?: unknown }).url === 'string'
}
