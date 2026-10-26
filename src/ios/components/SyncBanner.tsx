import { useSyncStatus, useOpenFull } from '@/day/useIos'
import { useT } from '@/i18n/react'
import { IconChevron, IconGear } from './Icons'

/**
 * Pasek, gdy dane z konta nie docierają. Bez niego uproszczony interfejs po cichu pokazuje
 * pusty tydzień i nieaktualny plan – a to wygląda jak błąd aplikacji, nie jak brak logowania.
 */
export function SyncBanner() {
  const sync = useSyncStatus()
  const openFull = useOpenFull()
  const t = useT()
  const tx = t.ios.syncBanner
  if (sync.state === 'idle' || sync.state === 'syncing' || sync.state === 'disabled') return null

  const info =
    sync.state === 'unauthenticated'
      ? { bg: 'var(--red)', title: tx.unauthTitle, sub: tx.unauthSub, to: '/wiecej/ustawienia' }
      : sync.state === 'offline'
        ? { bg: 'var(--orange)', title: tx.offlineTitle, sub: sync.pending > 0 ? tx.offlinePending(sync.pending) : tx.offlineSub, to: null }
        : { bg: 'var(--orange)', title: tx.failedTitle, sub: sync.error ?? tx.failedSub, to: '/wiecej/ustawienia' }

  const Tag = info.to ? 'button' : 'div'
  return (
    <div className="mb-4 px-4">
      <Tag
        type={info.to ? 'button' : undefined}
        onClick={info.to ? () => openFull(info.to!) : undefined}
        className="ios-press flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
        style={{ background: info.bg, color: '#fff' }}
      >
        <IconGear size={20} />
        <span className="min-w-0 flex-1">
          <span className="ios-headline block">{info.title}</span>
          <span className="ios-foot mt-0.5 block opacity-90">{info.sub}</span>
        </span>
        {info.to && <IconChevron size={18} />}
      </Tag>
    </div>
  )
}
