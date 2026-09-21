import { mediaFor } from '@/data/exercisesMedia'
import { buttonClass } from '@/components/ui'

/** Schemat ćwiczenia (start → koniec) i link do krótkiego filmu z techniką (otwierany na zewnątrz – offline i bez śledzenia). */
export function ExerciseMedia({ exerciseId, name, compact = false }: { exerciseId: string; name: string; compact?: boolean }) {
  const m = mediaFor(exerciseId)
  if (!m) return null
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <img src={m.image} alt={`Schemat: ${name} – pozycja startowa i końcowa`} className={`w-full rounded-xl bg-slate-50 dark:bg-slate-700/60 ${compact ? 'max-h-32' : 'max-h-44'} object-contain`} loading="lazy" />
      <a href={m.video_url} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', compact ? 'sm' : 'md', 'w-full')}>
        ▶ Pokaż technikę (YouTube)
      </a>
    </div>
  )
}
