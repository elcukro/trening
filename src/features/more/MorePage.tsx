import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { PageTitle } from '@/components/ui'
import { FULL_ESCAPE, useUiMode } from '@/day/useIos'
import type { Feature } from '@/engine/schema'
import { helpUrl } from '@/lib/help'
import { useT } from '@/i18n/react'

type ItemKey = 'calendar' | 'season' | 'gear' | 'trip' | 'needs' | 'settings' | 'zones' | 'rules' | 'help'

/** Pozycje „Więcej”; nazwa i opis ze słownika (`classic.more.items`). */
const ITEMS: { to: string; icon: string; key: ItemKey; feature?: Feature; external?: boolean }[] = [
  { to: '/kalendarz', icon: '🗓️', key: 'calendar' },
  { to: '/wiecej/sezon', icon: '🗺️', key: 'season' },
  { to: '/wiecej/sprzet', icon: '🔧', key: 'gear' },
  { to: '/wiecej/wyjazd', icon: '🎒', key: 'trip', feature: 'trip' },
  { to: '/start', icon: '🎯', key: 'needs' },
  { to: '/wiecej/ustawienia', icon: '⚙️', key: 'settings' },
  { to: '/biblioteka/strefy', icon: '❤️', key: 'zones' },
  { to: '/biblioteka/zasady', icon: '📜', key: 'rules' },
  { get to() { return helpUrl() }, icon: '📖', key: 'help', external: true },
]

function ItemLink({ to, external, children }: { to: string; external?: boolean; children: ReactNode }) {
  const cls = 'flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-sky-50 lg:py-4 dark:hover:bg-slate-700'
  return external ? (
    <a href={to} className={cls}>
      {children}
    </a>
  ) : (
    <Link to={to} className={cls}>
      {children}
    </Link>
  )
}

const LATER: { icon: string; label: string; sub: string }[] = []

export function MorePage() {
  const engine = useEngine()
  const navigate = useNavigate()
  const ui = useUiMode()
  const t = useT()
  const M = t.classic.more
  return (
    <div>
      <PageTitle sub={M.programVersion(engine.ctx.program.version)}>{M.title}</PageTitle>
      <button
        onClick={() => {
          try {
            sessionStorage.removeItem(FULL_ESCAPE)
          } catch {
            /* prywatne okno */
          }
          navigate(ui.mode === 'ios' ? '/i' : '/m')
        }}
        className="mb-3 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-left transition-colors hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:hover:bg-sky-900/50"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-base leading-none text-white" aria-hidden>
          ✦
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{M.simpleView}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{M.simpleViewSub}</span>
        </span>
        <span className="text-slate-400" aria-hidden>
          ›
        </span>
      </button>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:shadow-none dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800 lg:dark:bg-transparent">
        {ITEMS.filter((it) => !it.feature || engine.ctx.program.features.includes(it.feature)).map((it) => (
          <li key={it.to} className="lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-card lg:transition-colors lg:hover:bg-sky-50 lg:dark:border-slate-700 lg:dark:bg-slate-800 lg:dark:hover:bg-slate-700">
            <ItemLink to={it.to} external={it.external}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base leading-none dark:bg-slate-700" aria-hidden>
                {it.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{M.items[it.key].label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{M.items[it.key].sub}</span>
              </span>
              <span className="text-slate-400" aria-hidden>
                ›
              </span>
            </ItemLink>
          </li>
        ))}
        {LATER.map((it) => (
          <li key={it.label} className="flex min-h-14 items-center gap-3 px-4 py-3 opacity-50">
            <span className="text-xl" aria-hidden>
              {it.icon}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{it.label}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{it.sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
