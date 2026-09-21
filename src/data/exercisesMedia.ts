import mediaJson from '../../data/exercises_media.json'

/** Zdjęcia (free-exercise-db, domena publiczna), film z techniką i gryf do kalkulatora talerzy – `data/exercises_media.json` (pkt 8). */
export interface ExerciseMedia {
  /** zdjęcia: pozycja startowa i końcowa */
  photos: [string, string]
  video_url: string
  bar_kg: number | null
  note: string | null
}

interface MediaEntry {
  search: string
  video_id?: string
  bar_kg: number | null
  photo_source?: string
  note?: string
}

const ENTRIES = (mediaJson as { exercises: Record<string, MediaEntry> }).exercises

export function mediaFor(exerciseId: string): ExerciseMedia | null {
  const e = ENTRIES[exerciseId]
  if (!e) return null
  const video_url = e.video_id ? `https://www.youtube.com/watch?v=${e.video_id}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(e.search)}`
  return { photos: [`/exercises/${exerciseId}-0.jpg`, `/exercises/${exerciseId}-1.jpg`], video_url, bar_kg: e.bar_kg, note: e.note ?? null }
}
