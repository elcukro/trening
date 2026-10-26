import { ActionSheet, ActionSheetButtonStyle } from '@capacitor/action-sheet'
import { isNative } from './platform'

/**
 * Potwierdzenie akcji nieodwracalnej (docs/27 § 3.1): w aplikacji iOS systemowy arkusz akcji z czerwonym przyciskiem
 * i „Anuluj”, na webie `window.confirm`. Zwraca true tylko po wyborze akcji – zamknięcie arkusza to „nie”.
 */
export async function confirmAction({ title, message, action }: { title?: string; message?: string; action: string }): Promise<boolean> {
  if (isNative()) {
    try {
      const r = await ActionSheet.showActions({
        title,
        message,
        options: [
          { title: action, style: ActionSheetButtonStyle.Destructive },
          { title: 'Anuluj', style: ActionSheetButtonStyle.Cancel },
        ],
      })
      return r.index === 0
    } catch {
      return false
    }
  }
  return window.confirm([title, message].filter(Boolean).join('\n\n') || `${action}?`)
}
