import type { MealRow } from '@/db'
import type { MealsDay } from '@/day/useMeals'
import { Btn, Card } from './Chrome'

const k = (n: number) => n.toLocaleString('pl-PL')

/**
 * Karta „Jedzenie” na Dziś w `/m` (docs/25 § 3): pasek zjedzone/budżet, białko, lista posiłków i „Dodaj posiłek”.
 * Bez wzrostu albo roku urodzenia w profilu – tylko sumy i prośba o uzupełnienie.
 */
export function FoodCard({ food, label, onAdd, onOpen, onProfile }: { food: MealsDay; label: string; onAdd: () => void; onOpen: (m: MealRow) => void; onProfile: () => void }) {
  const i = food.intake
  if (!i) return null
  const b = i.budget
  const pct = b && b.kcal > 0 ? Math.min(100, (i.eaten.kcal / b.kcal) * 100) : 0
  const over = b ? b.left < 0 : false
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-headline">Jedzenie</h2>
        <span className="m-foot m-dim text-right">{b ? (b.deficit_kcal > 0 ? `deficyt ok. ${k(b.deficit_kcal)} kcal` : 'bez deficytu') : ''}</span>
      </div>
      {b ? (
        <>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--fill)' }} role="progressbar" aria-valuenow={i.eaten.kcal} aria-valuemax={b.kcal} aria-label="Zjedzone z budżetu">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? 'var(--orange)' : 'var(--green)' }} />
          </div>
          <p className="m-sub mt-2 m-num">
            {k(i.eaten.kcal)} z ~{k(b.kcal)} kcal · {over ? `ponad o ~${k(-b.left)}` : `zostało ~${k(b.left)}`}
          </p>
        </>
      ) : (
        <p className="m-sub mt-2 m-num">zjedzone {k(i.eaten.kcal)} kcal</p>
      )}
      <p className="m-foot m-dim mt-0.5 m-num">
        białko {i.eaten.protein_g} / {i.protein_target_g} g{b && b.ride_kcal > 0 ? ` · jazda ${b.ride_source === 'plan' ? '~' : ''}${k(b.ride_kcal)} kcal${b.ride_source === 'plan' ? ' (plan)' : ''}` : ''}
      </p>
      {b && b.deficit_kcal === 0 && <p className="m-foot m-dim mt-1">{label}</p>}
      {!b && (
        <button className="m-foot mt-1 text-left" style={{ color: 'var(--accent)' }} onClick={onProfile}>
          Uzupełnij wzrost i datę urodzenia, żeby zobaczyć budżet dnia
        </button>
      )}
      {food.meals.length > 0 && (
        <div className="mt-3 flex flex-col">
          {food.meals.map((m) => (
            <button key={m.id} className="flex min-h-11 items-center gap-2 border-t py-2 text-left" style={{ borderColor: 'var(--separator)' }} onClick={() => onOpen(m)}>
              <span className="m-foot m-dim m-num w-11 shrink-0">{m.time ?? ''}</span>
              <span className="m-sub min-w-0 flex-1 truncate">{m.name}</span>
              <span className="m-sub m-num shrink-0">{k(m.kcal)} kcal</span>
            </button>
          ))}
        </div>
      )}
      <Btn onClick={onAdd} className="mt-4 w-full">
        Dodaj posiłek
      </Btn>
    </Card>
  )
}
