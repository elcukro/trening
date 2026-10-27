import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Natywna aplikacja iOS (docs/26): ten sam `/m` w powłoce Capacitora. Bundle z `dist/` jest wbudowany w aplikację
 * (bez `server.url`), budowany przez `npm run build:ios` (VITE_TARGET=ios). Identyfikator i nazwa do potwierdzenia
 * przed App Store (docs/26 § 9 pkt 4).
 */
const config: CapacitorConfig = {
  appId: 'pl.felsztukier.trening',
  appName: 'Bicycle Coach',
  webDir: 'dist',
  // tło WebView takie jak tło `/m` (#f2f2f7) – bez białego błysku przed pierwszym rysunkiem
  backgroundColor: '#f2f2f7',
  ios: {
    // safe areas obsługuje CSS (`env(safe-area-inset-*)`, viewport-fit=cover), WebView zajmuje cały ekran
    contentInset: 'never',
    // odbicie przewijania całego dokumentu – przewija się `.m-scroll`, nie strona
    scrollEnabled: false,
    backgroundColor: '#f2f2f7',
  },
  plugins: {
    SplashScreen: {
      // ekran startowy znika dopiero, gdy `/m` się narysuje (`hideSplash` w src/native)
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#f2f2f7',
      showSpinner: false,
    },
    StatusBar: {
      // ciemny tekst na jasnym tle; pasek nad treścią (treść sama odsuwa się o safe area)
      style: 'LIGHT',
      overlaysWebView: true,
    },
    Keyboard: {
      // docs/26 § 3 pkt 5 i § 8: zachowanie klawiatury w powłoce – wyniki z symulatora w docs/26 § 8
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
