import { useEffect, useState } from 'react'
import { mediaFor } from '@/data/exercisesMedia'
import { buttonClass } from '@/components/ui'

const CAPTION = ['pozycja startowa', 'pozycja końcowa'] as const

/**
 * Zdjęcia ćwiczenia (pozycja startowa i końcowa; free-exercise-db, domena publiczna) i link do krótkiego filmu
 * z techniką – otwierany na zewnątrz (offline i bez osadzania YouTube). Dotknięcie zdjęcia otwiera je na pełnym ekranie.
 */
export function ExerciseMedia({ exerciseId, name, compact = false }: { exerciseId: string; name: string; compact?: boolean }) {
  const m = mediaFor(exerciseId)
  const [open, setOpen] = useState<number | null>(null)
  if (!m) return null
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="grid grid-cols-2 gap-2">
        {m.photos.map((src, i) => (
          <figure key={src} className="m-0 min-w-0">
            <button type="button" className="block w-full rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none" onClick={() => setOpen(i)} aria-label={`Powiększ: ${name} – ${CAPTION[i] ?? ''}`}>
              <img src={src} alt={`${name} – ${CAPTION[i] ?? ''}`} className="aspect-[3/2] w-full rounded-xl bg-slate-100 object-cover dark:bg-slate-700/60" loading="lazy" width={480} height={320} />
            </button>
            <figcaption className="mt-0.5 text-center text-xs text-slate-500 dark:text-slate-400">{i === 0 ? 'start' : 'koniec'}</figcaption>
          </figure>
        ))}
      </div>
      {m.note && <p className="text-xs text-slate-500 dark:text-slate-400">{m.note}</p>}
      <a href={m.video_url} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', compact ? 'sm' : 'md', 'w-full')}>
        ▶ Pokaż technikę (YouTube)
      </a>
      {open !== null && <Lightbox photos={m.photos} index={open} name={name} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Pełnoekranowy podgląd: ✕ / Escape / dotknięcie tła zamyka, strzałki i przyciski przełączają start ↔ koniec. */
function Lightbox({ photos, index, name, onIndex, onClose }: { photos: readonly string[]; index: number; name: string; onIndex: (i: number) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [index, photos.length, onClose, onIndex])
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label={`${name} – ${CAPTION[index] ?? ''}`} onClick={onClose}>
      <button type="button" className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20" onClick={onClose} aria-label="Zamknij">
        ×
      </button>
      <img src={photos[index]} alt={`${name} – ${CAPTION[index] ?? ''}`} className="max-h-[80vh] w-auto max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
      <div className="mt-3 flex items-center gap-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="min-h-11 rounded-xl bg-white/10 px-4 hover:bg-white/20 disabled:opacity-30" onClick={() => onIndex(0)} disabled={index === 0}>
          ‹ start
        </button>
        <span className="text-slate-300">{CAPTION[index]}</span>
        <button type="button" className="min-h-11 rounded-xl bg-white/10 px-4 hover:bg-white/20 disabled:opacity-30" onClick={() => onIndex(1)} disabled={index === photos.length - 1}>
          koniec ›
        </button>
      </div>
    </div>
  )
}
