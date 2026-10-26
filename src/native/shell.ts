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
  window.setTimeout(hideSplash, 4000)
  try {
    await StatusBar.setStyle({ style: Style.Light })
  } catch {
    /* brak wtyczki – zostaje styl z Info.plist */
  }
}

let hidden = false

/**
 * Chowa ekran startowy, gdy pierwszy ekran `/m` jest już narysowany (w capacitor.config.ts `launchAutoHide: false`) –
 * bez białego błysku WebView między ekranem startowym a treścią.
 */
export function hideSplash(): void {
  if (hidden || !isNative()) return
  hidden = true
  window.requestAnimationFrame(() => {
    void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})
  })
}
