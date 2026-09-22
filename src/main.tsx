import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { applyTheme, watchSystemTheme } from './lib/theme'

applyTheme()
watchSystemTheme()
import { App } from './app/App'

// autoUpdate przeładowuje stronę, gdy nowy service worker przejmie kontrolę;
// dodatkowe sprawdzanie co godzinę skraca okno, w którym otwarta karta trzyma starą wersję
registerSW({
  immediate: true,
  onRegisteredSW(_url, r) {
    if (r) setInterval(() => void r.update(), 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
