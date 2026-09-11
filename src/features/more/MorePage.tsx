import { Link } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { PageTitle } from '@/components/ui'

const ITEMS = [
  { to: '/wiecej/sezon', icon: '🗺️', label: 'Sezon', sub: 'Fazy, tabela 53 tygodni, wydarzenia' },
  { to: '/wiecej/sprzet', icon: '🔧', label: 'Sprzęt', sub: 'Zadania serwisowe, terminy, dziennik' },
  { to: '/wiecej/wyjazd', icon: '🎒', label: 'Wyjazd', sub: 'Checklista, torby, strategia na przełęcz' },
  { to: '/wiecej/ustawienia', icon: '⚙️', label: 'Ustawienia', sub: 'Profil, LTHR, daty, integracje, kopia' },
  { to: '/biblioteka/strefy', icon: '❤️', label: 'Strefy tętna', sub: 'Tabela bpm dla aktualnego LTHR' },
  { to: '/biblioteka/zasady', icon: '📜', label: 'Zasady R1–R16', sub: 'Co robić, gdy plan się sypie' },
]

const LATER: { icon: string; label: string; sub: string }[] = []

export function MorePage() {
  const engine = useEngine()
  return (
    <div>
      <PageTitle sub={`Program ${engine.ctx.program.version}`}>Więcej</PageTitle>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
        {ITEMS.map((it) => (
          <li key={it.to}>
            <Link to={it.to} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <span className="text-xl" aria-hidden>
                {it.icon}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{it.label}</span>
                <span className="block text-xs text-slate-500">{it.sub}</span>
              </span>
              <span className="text-slate-400">›</span>
            </Link>
          </li>
        ))}
        {LATER.map((it) => (
          <li key={it.label} className="flex min-h-14 items-center gap-3 px-4 py-3 opacity-50">
            <span className="text-xl" aria-hidden>
              {it.icon}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{it.label}</span>
              <span className="block text-xs text-slate-500">{it.sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
