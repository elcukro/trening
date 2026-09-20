/** Motyw: system (domyślnie), jasny albo ciemny – zapamiętany w localStorage, klasa `dark` na <html>. */
export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'theme'
const media = () => (typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null)

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const dark = pref === 'dark' || (pref === 'system' && !!media()?.matches)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* prywatne okno */
  }
  applyTheme(pref)
}

/** Reaguje na zmianę motywu systemu, gdy wybrano „system”. */
export function watchSystemTheme(): void {
  media()?.addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system')
  })
}
