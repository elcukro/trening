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

/**
 * Odpowiednik ścieżki (pełnej aplikacji albo `/i`) w mobilnym v2 `/m` (docs/24): Dziś, dzień, Plan (tydzień), Ja (postęp).
 * `null`, gdy ekranu nie ma w `/m` (raporty, biblioteka – zostaje pełna aplikacja).
 */
export function mobilePathFor(pathname: string): string | null {
  if (pathname === '/' || pathname === '' || pathname === '/i' || pathname === '/i/') return '/m'
  if (pathname.startsWith('/m/') || pathname === '/m') return null
  const m = pathname.match(/^\/(?:i\/)?(dzien|tydzien|postep|trening|wiecej)(\/[^/]+)?$/)
  if (!m) return null
  switch (m[1]) {
    case 'dzien':
      return `/m/dzien${m[2] ?? ''}`
    case 'trening':
      return m[2] ? `/m/jazda${m[2]}` : '/m'
    case 'tydzien':
      return `/m/plan${m[2] ?? ''}`
    case 'postep':
      return m[2] ? null : '/m/ja'
    case 'wiecej':
      return '/m/ja'
    default:
      return null
  }
}

export interface NavigateMessage {
  type: 'navigate'
  url: string
}

export function isNavigateMessage(data: unknown): data is NavigateMessage {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'navigate' && typeof (data as { url?: unknown }).url === 'string'
}
