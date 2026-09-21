import mediaJson from '../../data/exercises_media.json'

/** Schemat, film z techniką i gryf do kalkulatora talerzy – `data/exercises_media.json` (pkt 8). */
export interface ExerciseMedia {
  image: string
  video_url: string
  bar_kg: number | null
}

interface MediaEntry {
  search: string
  video_id?: string
  bar_kg: number | null
}

const ENTRIES = (mediaJson as { exercises: Record<string, MediaEntry> }).exercises

export function mediaFor(exerciseId: string): ExerciseMedia | null {
  const e = ENTRIES[exerciseId]
  if (!e) return null
  const video_url = e.video_id ? `https://www.youtube.com/watch?v=${e.video_id}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(e.search)}`
  return { image: `/exercises/${exerciseId}.svg`, video_url, bar_kg: e.bar_kg }
}
