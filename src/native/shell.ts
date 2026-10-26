import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isNative } from './platform'

/**
 * Start powłoki natywnej (etap 0, docs/26 § 3 pkt 5): ciemny tekst paska statusu na jasnym tle `/m`.
 * Na webie nic nie robi. Błędy wtyczek nie mogą zatrzymać aplikacji.
 */
export async function initShell(): Promise<void> {
  if (!isNative()) return
  document.documentElement.classList.add('native')
  // bez przybliżania szczypnięciem (WKWebView respektuje `user-scalable=no`, Safari nie)
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no')
  // zapas: gdy pierwszy ekran się nie narysuje (błąd, długie czekanie na profil), ekran startowy i tak znika
  window.setTimeout(revealSplash, 4000)
  try {
    await StatusBar.setStyle({ style: Style.Light })
  } catch {
    /* brak wtyczki – zostaje styl z Info.plist */
  }
}

let hidden = false
let held = false
let drawn = false
const onDrawn: Array<() => void> = []

/**
 * Pierwszy ekran `/m` jest narysowany: chowa ekran startowy (w capacitor.config.ts `launchAutoHide: false`) – bez białego
 * błysku WebView między ekranem startowym a treścią. Gdy start przejęło intro (`holdSplash`), ekran startowy chowa intro.
 */
export function hideSplash(): void {
  if (!drawn) {
    drawn = true
    onDrawn.splice(0).forEach((f) => f())
  }
  if (!held) revealSplash()
}

/**
 * Intro (src/m/Intro.tsx) przejmuje ekran startowy: odsłania go samo, gdy scena jest gotowa (`revealSplash`). Zwraca
 * zwolnienie – po nim ekran startowy znika jak bez intro, czyli z pierwszym ekranem `/m`.
 */
export function holdSplash(): () => void {
  held = true
  return () => {
    held = false
    if (drawn) revealSplash()
  }
}

/** Rozwiązuje się, gdy pierwszy ekran `/m` jest narysowany – intro nie zasłania pustego ekranu ani czekania na dane. */
export function firstScreenDrawn(): Promise<void> {
  return drawn ? Promise.resolve() : new Promise((r) => onDrawn.push(r))
}

/** Jasny tekst paska statusu na ciemnym niebie intro (wieczór, noc), potem znów ciemny na jasnym tle `/m`. */
export function statusBarLight(light: boolean): void {
  if (!isNative()) return
  void StatusBar.setStyle({ style: light ? Style.Dark : Style.Light }).catch(() => {})
}

/** Chowa natywny ekran startowy (raz); na webie nic nie robi. */
export function revealSplash(): void {
  if (hidden || !isNative()) return
  hidden = true
  window.requestAnimationFrame(() => {
    void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})
  })
}
