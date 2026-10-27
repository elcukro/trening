import { useRef, useState } from 'react'
import { useSettings } from '@/app/useSettings'
import { useToast } from '@/components/Toast'
import { friendlyError } from '@/lib/errors'
import { AVATAR_NONE, squarePhoto, type AvatarView } from '@/lib/avatar'
import { haptic } from '@/native'
import { useT } from '@/i18n/react'
import { Sheet } from './Chrome'

/** Kółko ze zdjęciem albo inicjałami; zdjęcie z Google, które się nie wczyta (offline, wygasły adres), daje inicjały. */
export function Avatar({ view, fallback, size }: { view: AvatarView; fallback: string; size: number }) {
  const [broken, setBroken] = useState<string | null>(null)
  const style = { width: size, height: size }
  if (view.kind === 'photo' && broken !== view.src) {
    return <img src={view.src} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={style} onError={() => setBroken(view.src)} />
  }
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ ...style, background: 'var(--accent)', fontSize: size * 0.4 }}>
      {view.kind === 'initials' ? view.text : fallback}
    </span>
  )
}

export function AvatarSheet({ view, initials, google, onClose }: { view: AvatarView; initials: string; google: string | null; onClose: () => void }) {
  const t = useT()
  const tm = t.m.avatar
  const { update } = useSettings()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function save(avatar: string | null, ok: string) {
    haptic.selection()
    setBusy(true)
    try {
      await update({ avatar })
      toast.notify(ok, 'success')
      onClose()
    } catch (e) {
      toast.notify(tm.failed, 'error', friendlyError(e).message)
    } finally {
      setBusy(false)
    }
  }

  async function picked(file: File | undefined) {
    if (!file) return
    let data: string
    try {
      data = await squarePhoto(file)
    } catch {
      toast.notify(tm.failed, 'error', tm.unreadable)
      return
    }
    await save(data, tm.saved)
  }

  return (
    <Sheet title={tm.title} onClose={onClose}>
      <div className="flex justify-center py-2">
        <Avatar view={view} fallback={initials} size={96} />
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void picked(e.target.files?.[0])} />
      <div className="m-list mt-3">
        <button className="m-row" disabled={busy} onClick={() => input.current?.click()}>
          <span className="flex-1 text-left" style={{ color: 'var(--accent)' }}>{view.kind === 'photo' && view.source === 'own' ? tm.change : tm.choose}</span>
        </button>
        {google && !(view.kind === 'photo' && view.source === 'google') && (
          <button className="m-row" disabled={busy} onClick={() => void save(null, tm.googleSet)}>
            <span className="flex-1 text-left" style={{ color: 'var(--accent)' }}>{tm.useGoogle}</span>
          </button>
        )}
        {view.kind === 'photo' && (
          <button className="m-row" disabled={busy} onClick={() => void save(google ? AVATAR_NONE : null, tm.removed)}>
            <span className="flex-1 text-left" style={{ color: 'var(--red)' }}>{tm.remove}</span>
          </button>
        )}
      </div>
      <p className="m-foot m-dim mt-3 px-1">{tm.hint}</p>
    </Sheet>
  )
}
