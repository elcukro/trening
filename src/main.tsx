import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { IS_IOS_APP, initShell } from './native'

// aplikacja iOS ma tylko jasny wygląd `/m` (docs/26 § 3 pkt 8) – motyw systemu jej nie dotyczy
if (IS_IOS_APP) void initShell()
else {
  applyTheme()
  watchSystemTheme()
}
import { App } from './app/App'

// autoUpdate przeładowuje stronę, gdy nowy service worker przejmie kontrolę;
// dodatkowe sprawdzanie co godzinę skraca okno, w którym otwarta karta trzyma starą wersję
// (w buildzie iOS `registerSW` to pusta funkcja – src/native/noServiceWorker.ts)
if (!IS_IOS_APP) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (r) setInterval(() => void r.update(), 60 * 60 * 1000)
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
