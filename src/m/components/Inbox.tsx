import { useState } from 'react'
import { useNavigate } from 'react-router'
import { IconBell } from '@/ios/components/Icons'
import { useInbox } from '@/day/useInbox'
import type { InboxItem } from '@/day/inbox'
import { haptic } from '@/native'
import { useT } from '@/i18n/react'
import { useAvatar } from '../useAvatar'
import { Avatar } from './AvatarSheet'
import { Group, Row, Sheet } from './Chrome'

/** Lewy róg Dziś i Planu: zdjęcie profilowe → Profil. Bez konta nic (Profil jest w dolnym pasku). */
export function NavAvatar() {
  const a = useAvatar()
  const navigate = useNavigate()
  const t = useT()
  if (!a.signedIn) return <span className="w-2" />
  return (
    <button className="m-nav-btn" aria-label={t.m.chrome.tabs.me} onClick={() => navigate('/m/ja')}>
      <Avatar view={a.view} fallback={a.initials} size={32} />
    </button>
  )
}

/** Prawy róg: dzwonek ze skrzynką. Liczba = „Do zrobienia”, kropka = tylko coś nowego. */
export function InboxBell() {
  const inbox = useInbox()
  const [open, setOpen] = useState(false)
  const t = useT()
  const L = t.day.inbox
  return (
    <>
      <button className="m-nav-btn relative" aria-label={inbox.badge > 0 ? L.bellCount(inbox.badge) : L.bell} onClick={() => setOpen(true)}>
        <IconBell size={24} />
        {inbox.badge > 0 && (
          <span aria-hidden className="m-num absolute top-1.5 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: 'var(--red)' }}>
            {inbox.badge}
          </span>
        )}
        {inbox.dot && <span aria-hidden className="absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent)' }} />}
      </button>
      {open && <InboxSheet inbox={inbox} onClose={() => setOpen(false)} />}
    </>
  )
}

function InboxSheet({ inbox, onClose }: { inbox: ReturnType<typeof useInbox>; onClose: () => void }) {
  const t = useT()
  const L = t.day.inbox
  const navigate = useNavigate()

  function go(item: InboxItem) {
    haptic.selection()
    if (item.kind !== 'todo') void inbox.markSeen(item.id)
    onClose()
    navigate(item.to, item.state ? { state: item.state } : undefined)
  }

  const row = (item: InboxItem) => <Row key={item.id} icon={<img src={item.art} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={item.title} sub={item.sub ?? undefined} onClick={() => go(item)} />

  return (
    <Sheet title={L.title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {inbox.todo.length > 0 && <Group label={L.todo}>{inbox.todo.map(row)}</Group>}
        {inbox.fresh.length > 0 && <Group label={L.fresh}>{inbox.fresh.map(row)}</Group>}
        {inbox.soon.length > 0 && <Group label={L.soon}>{inbox.soon.map(row)}</Group>}
        {inbox.todo.length === 0 && inbox.fresh.length === 0 && inbox.soon.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <img src="/m/art/coach-wave.png" alt="" width={72} height={72} className="h-18 w-18 object-contain" />
            <p className="m-title">{L.empty}</p>
            <p className="m-sub m-dim px-4">{L.emptySub}</p>
          </div>
        )}
      </div>
    </Sheet>
  )
}
