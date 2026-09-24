import { useSyncStatus, useOpenFull } from '../useIos'
import { IconChevron, IconGear } from './Icons'

/**
 * Pasek, gdy dane z konta nie docierają. Bez niego uproszczony interfejs po cichu pokazuje
 * pusty tydzień i nieaktualny plan – a to wygląda jak błąd aplikacji, nie jak brak logowania.
 */
export function SyncBanner() {
  const sync = useSyncStatus()
  const openFull = useOpenFull()
  if (sync.state === 'idle' || sync.state === 'syncing' || sync.state === 'disabled') return null

  const info =
    sync.state === 'unauthenticated'
      ? { bg: 'var(--red)', title: 'Nie jesteś zalogowany', sub: 'Jazdy ze Stravy, check-iny i zmiany planu nie pobierają się z konta. Dotknij, żeby się zalogować.', to: '/wiecej/ustawienia' }
      : sync.state === 'offline'
        ? { bg: 'var(--orange)', title: 'Brak sieci', sub: sync.pending > 0 ? `${sync.pending} zapisów czeka w kolejce – pojadą po powrocie zasięgu.` : 'Plan działa offline; nowe dane dociągną się później.', to: null }
        : { bg: 'var(--orange)', title: 'Synchronizacja się nie udała', sub: sync.error ?? 'Spróbuj ponownie w Więcej → Konto i synchronizacja.', to: '/wiecej/ustawienia' }

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
