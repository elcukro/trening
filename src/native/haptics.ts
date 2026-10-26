import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNative } from './platform'

/**
 * Haptyka (docs/27 § 1 pkt 2) – w aplikacji iOS przez Taptic Engine. Na webie nic: iOS w Safari nie ma
 * `navigator.vibrate`, a na Androidzie wibracja przy każdym dotknięciu byłaby za mocna.
 * Zasady jak w HIG: `selection` przy wyborze wartości, `impact` przy fizycznym geście (podniesienie dnia),
 * `success`/`warning`/`error` po zakończeniu akcji – nigdy przy zwykłej nawigacji.
 */
function run(fn: () => Promise<void>): void {
  if (!isNative()) return
  void fn().catch(() => {})
}

export const haptic = {
  selection: () => run(() => Haptics.selectionChanged()),
  light: () => run(() => Haptics.impact({ style: ImpactStyle.Light })),
  medium: () => run(() => Haptics.impact({ style: ImpactStyle.Medium })),
  success: () => run(() => Haptics.notification({ type: NotificationType.Success })),
  warning: () => run(() => Haptics.notification({ type: NotificationType.Warning })),
  error: () => run(() => Haptics.notification({ type: NotificationType.Error })),
}
