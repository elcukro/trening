import { Link } from 'react-router'
import { useEngine } from '@/app/useSettings'
import { PageTitle } from '@/components/ui'

const ITEMS = [
  { to: '/kalendarz', icon: '🗓️', label: 'Kalendarz', sub: 'Miesiąc w siatce: jazdy, siłownia, znaczniki, wykonanie' },
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
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:border-0 lg:bg-transparent dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800 lg:dark:bg-transparent">
        {ITEMS.map((it) => (
          <li key={it.to} className="lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm lg:transition-colors lg:hover:bg-sky-50 lg:dark:border-slate-700 lg:dark:bg-slate-800 lg:dark:hover:bg-slate-700">
            <Link to={it.to} className="flex min-h-14 items-center gap-3 px-4 py-3 lg:py-4">
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
