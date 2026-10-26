/// <reference types="vite/client" />
declare const __BUILD_ID__: string

interface ImportMetaEnv {
  /** `ios` w buildzie aplikacji natywnej (`npm run build:ios`, docs/26); brak = web/PWA. */
  readonly VITE_TARGET?: 'ios'
}
