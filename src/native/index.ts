/**
 * Warstwa natywna (docs/26 § 1) – jedyne miejsce, które importuje wtyczki Capacitora. Reszta kodu woła te funkcje;
 * na webie są puste, więc ekrany i testy Vitest/Playwright działają bez zmian.
 */
export { IS_IOS_APP, isNative, platform } from './platform'
export { firstScreenDrawn, hideSplash, holdSplash, initShell, revealSplash, statusBarLight } from './shell'
export { haptic } from './haptics'
export { confirmAction } from './confirm'
export { health } from './health'
export { currentPosition } from './location'
export { openAuthSession } from './webAuth'
