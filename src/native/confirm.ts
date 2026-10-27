import { ActionSheet, ActionSheetButtonStyle } from '@capacitor/action-sheet'
import { t } from '@/i18n'
import { isNative } from './platform'

/**
 * Potwierdzenie akcji nieodwracalnej (docs/27 § 3.1, § 6): w aplikacji iOS systemowy arkusz akcji z czerwonym
 * przyciskiem i „Anuluj”; na webie arkusz w tym samym stylu z `/m` (`ActionSheetHost` rejestruje się przez
 * `setWebConfirm`), a poza `/m` – `window.confirm`. Zwraca true tylko po wyborze akcji – zamknięcie arkusza to „nie”.
 */
export interface ConfirmRequest {
  title?: string
  message?: string
  action: string
  /** false = zwykła (niebieska) akcja zamiast czerwonej */
  destructive?: boolean
}

let webConfirm: ((r: ConfirmRequest) => Promise<boolean>) | null = null

/** Interfejs webowy podstawia własny arkusz; `null` przywraca `window.confirm`. */
export function setWebConfirm(fn: ((r: ConfirmRequest) => Promise<boolean>) | null) {
  webConfirm = fn
}

export async function confirmAction({ title, message, action, destructive = true }: ConfirmRequest): Promise<boolean> {
  if (isNative()) {
    try {
      const r = await ActionSheet.showActions({
        title,
        message,
        options: [
          { title: action, style: destructive ? ActionSheetButtonStyle.Destructive : ActionSheetButtonStyle.Default },
          { title: t().common.cancel, style: ActionSheetButtonStyle.Cancel },
        ],
      })
      return r.index === 0
    } catch {
      return false
    }
  }
  if (webConfirm) return webConfirm({ title, message, action, destructive })
  return window.confirm([title, message].filter(Boolean).join('\n\n') || `${action}?`)
}
