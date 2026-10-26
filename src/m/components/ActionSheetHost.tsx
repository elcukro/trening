import { useEffect, useRef, useState } from 'react'
import { setWebConfirm, type ConfirmRequest } from '@/native'
import { useT } from '@/i18n/react'

/**
 * Arkusz akcji jak systemowy `UIAlertController(.actionSheet)` dla `/m` w przeglądarce (docs/27 § 6): tytuł i opis
 * szarym drobnym tekstem, akcja (czerwona przy nieodwracalnej) i osobny „Anuluj”. W aplikacji iOS `confirmAction`
 * pokazuje arkusz systemowy i tu nic nie trafia. Tło, Esc i „Anuluj” = nie.
 */
export function ActionSheetHost() {
  const t = useT()
  const [req, setReq] = useState<(ConfirmRequest & { resolve: (v: boolean) => void }) | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setWebConfirm((r) => new Promise<boolean>((resolve) => setReq({ ...r, resolve })))
    return () => setWebConfirm(null)
  }, [])

  useEffect(() => {
    if (!req) return
    const prev = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      req.resolve(false)
      setReq(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [req])

  function answer(v: boolean) {
    req?.resolve(v)
    setReq(null)
  }

  if (!req) return null
  return (
    <div className="m-asheet-root">
      <div className="m-asheet-backdrop" onClick={() => answer(false)} aria-hidden />
      <div className="m-asheet" role="alertdialog" aria-modal="true" aria-labelledby={req.title ? 'm-asheet-title' : undefined} aria-describedby={req.message ? 'm-asheet-msg' : undefined}>
        <div className="m-asheet-group">
          {(req.title || req.message) && (
            <div className="m-asheet-head">
              {req.title && <p id="m-asheet-title" className="m-asheet-title">{req.title}</p>}
              {req.message && <p id="m-asheet-msg" className="m-asheet-msg">{req.message}</p>}
            </div>
          )}
          <button type="button" className={`m-asheet-btn ${req.destructive === false ? '' : 'm-asheet-destructive'}`} onClick={() => answer(true)}>
            {req.action}
          </button>
        </div>
        <button ref={cancelRef} type="button" className="m-asheet-btn m-asheet-cancel" onClick={() => answer(false)}>
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}
