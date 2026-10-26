/**
 * Zastępuje `virtual:pwa-register` w buildzie iOS (alias w vite.config.ts): WKWebView pod `capacitor://` ładuje
 * zasoby z bundla, więc service worker i jego aktualizacje nie są potrzebne.
 */
export function registerSW(_options?: unknown): (reloadPage?: boolean) => Promise<void> {
  return async () => {}
}
