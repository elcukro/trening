/**
 * Warstwa natywna (docs/26 § 1) – jedyne miejsce, które importuje wtyczki Capacitora. Reszta kodu woła te funkcje;
 * na webie są puste, więc ekrany i testy Vitest/Playwright działają bez zmian.
 */
export { IS_IOS_APP, isNative, platform } from './platform'
export { hideSplash, initShell } from './shell'
