import { Capacitor } from '@capacitor/core'

/**
 * Cel builda znany w czasie kompilacji (`VITE_TARGET=ios`, docs/26 § 1): pozwala wyciąć z bundla iOS klasyczne UI,
 * `/i` i service worker. Stała, więc warunki z nią minifikator składa na etapie builda.
 */
export const IS_IOS_APP = import.meta.env.VITE_TARGET === 'ios'

/** Czy kod działa w natywnej powłoce (Capacitor), a nie w przeglądarce – np. build iOS otwarty w `vite preview`. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/** `ios`, `android` albo `web`. */
export function platform(): string {
  return Capacitor.getPlatform()
}
