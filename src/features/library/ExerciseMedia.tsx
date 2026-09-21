import { mediaFor } from '@/data/exercisesMedia'
import { buttonClass } from '@/components/ui'

/**
 * Zdjęcia ćwiczenia (pozycja startowa i końcowa; free-exercise-db, domena publiczna) i link do krótkiego filmu
 * z techniką – otwierany na zewnątrz (offline i bez osadzania YouTube).
 */
export function ExerciseMedia({ exerciseId, name, compact = false }: { exerciseId: string; name: string; compact?: boolean }) {
  const m = mediaFor(exerciseId)
  if (!m) return null
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="grid grid-cols-2 gap-2">
        {m.photos.map((src, i) => (
          <figure key={src} className="m-0 min-w-0">
            <img src={src} alt={`${name} – ${i === 0 ? 'pozycja startowa' : 'pozycja końcowa'}`} className="aspect-[3/2] w-full rounded-xl bg-slate-100 object-cover dark:bg-slate-700/60" loading="lazy" width={480} height={320} />
            <figcaption className="mt-0.5 text-center text-xs text-slate-500 dark:text-slate-400">{i === 0 ? 'start' : 'koniec'}</figcaption>
          </figure>
        ))}
      </div>
      {m.note && <p className="text-xs text-slate-500 dark:text-slate-400">{m.note}</p>}
      <a href={m.video_url} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', compact ? 'sm' : 'md', 'w-full')}>
        ▶ Pokaż technikę (YouTube)
      </a>
    </div>
  )
}
