import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PackingState } from '@/db'
import { resetPacking, setPacked } from '@/db/repo'
import { itemKey, loadPackingList } from '@/data/gear'
import { useEngine } from '@/app/useSettings'
import { diffDays } from '@/engine/dates'
import { todayISO, fmtDate } from '@/lib/dates'
import { days as daysLabel, num } from '@/lib/format'
import { Button, Card, CardTitle, PageTitle } from '@/components/ui'
import { PASS_STRATEGY } from '@/data/rules'

type TripMode = 'hotel' | 'camp'

export function TripPage() {
  const engine = useEngine()
  const list = loadPackingList()
  const [mode, setMode] = useState<TripMode>('hotel')
  const rows = useLiveQuery(() => db.packing_state.where('trip_key').equals(mode).toArray(), [mode], [] as PackingState[])
  const checked = new Map(rows.filter((r) => !r.deleted_at).map((r) => [r.item_key, r.checked]))
  const toTrip = diffDays(engine.ctx.settings.trip_start, todayISO())

  const groups = useMemo(() => {
    const m = new Map<string, { item: (typeof list.items)[number]; key: string }[]>()
    list.items.forEach((it, i) => {
      if (mode !== 'camp' && it.only === 'biwak') return // pozycje tylko na biwak
      const g = m.get(it.cat) ?? []
      g.push({ item: it, key: itemKey(it, i) })
      m.set(it.cat, g)
    })
    return [...m.entries()]
  }, [list, mode])

  const total = groups.reduce((a, [, g]) => a + g.length, 0)
  const done = groups.reduce((a, [, g]) => a + g.filter(({ key }) => checked.get(key)).length, 0)
  const price = groups.reduce((a, [, g]) => a + g.reduce((b, { item }) => b + (item.price_pln ?? 0), 0), 0)

  return (
    <div className="space-y-3">
      <Link to="/wiecej" className="text-sm text-sky-600">
        ‹ Więcej
      </Link>
      <PageTitle sub={toTrip > 0 ? `${daysLabel(toTrip)} do wyjazdu (${fmtDate(engine.ctx.settings.trip_start)})` : 'Wyjazd trwa'}>Wyjazd</PageTitle>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-700">
        {(['hotel', 'camp'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`min-h-10 rounded-lg text-sm font-semibold ${mode === m ? 'bg-white shadow dark:bg-slate-900' : 'text-slate-600 dark:text-slate-300'}`}>
            {m === 'hotel' ? 'Hotele' : 'Biwak'}
          </button>
        ))}
      </div>

      <Card>
        <CardTitle icon="✅" right={<span className="text-sm tabular-nums">{done}/{total}</span>}>
          Checklista
        </CardTitle>
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
          <div className="h-full bg-emerald-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        {groups.map(([cat, items]) => (
          <div key={cat} className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</h3>
            <ul>
              {items.map(({ item, key }) => (
                <li key={key}>
                  <label className="flex min-h-11 items-center gap-2 py-1">
                    <input type="checkbox" className="h-6 w-6 shrink-0" checked={!!checked.get(key)} onChange={(e) => setPacked(mode, key, e.target.checked)} />
                    <span className={`flex-1 text-sm ${checked.get(key) ? 'text-slate-400 line-through' : ''}`}>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="underline decoration-slate-300">
                          {item.name}
                        </a>
                      ) : (
                        item.name
                      )}
                    </span>
                    {item.price_pln != null && <span className="shrink-0 text-xs text-slate-500">{num(item.price_pln, 0)} zł</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">Razem na liście: {num(price, 0)} zł</span>
          <Button variant="secondary" onClick={() => resetPacking(mode)}>
            Odznacz wszystko
          </Button>
        </div>
      </Card>

      <Card tone="muted">
        <CardTitle icon="🎒">Podział na torby</CardTitle>
        <p className="mb-2 text-sm">{list.system}</p>
        <ul className="space-y-2 text-sm">
          {list.bags.map((b) => (
            <li key={b.id}>
              <span className="font-medium">{b.name}</span>
              <p className="text-slate-600 dark:text-slate-300">{b.content}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card tone="accent">
        <CardTitle icon="🏔️">Strategia na przełęcz</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {PASS_STRATEGY.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
