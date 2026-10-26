import { supabase } from './supabase'

export interface ParsedMeal {
  kind: 'dish' | 'label'
  name: string
  items: { name: string; grams: number | null; kcal: number; protein_g: number }[]
  total: { kcal: number; protein_g: number; carbs_g: number | null; fat_g: number | null }
  confidence: number
  question: string | null
  label: { unit: 'g' | 'ml'; per_100: { kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }; package: number | null; serving: number | null } | null
  warnings: string[]
}

/** Zdjęcie z aparatu → JPEG ≤ 1024 px (~150 kB) jako data URL. Oryginał nigdzie nie trafia (docs/25 § 2 pkt 1). */
export async function shrinkPhoto(file: Blob, maxPx = 1024, quality = 0.8): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvas.toDataURL('image/jpeg', quality)
}

/** Zdjęcia posiłku albo etykiety → podgląd (Edge Function `meal-parse`). Zapis robi arkusz po korekcie. */
/** `signal` – „Anuluj” w arkuszu posiłku przerywa czekanie (docs/27 § 6). */
export async function parseMealPhotos(images: string[], note: string, hint: { protein_target?: number }, signal?: AbortSignal): Promise<ParsedMeal> {
  if (!supabase) throw new Error('Bez konta rozpoznawanie nie działa')
  const { data, error } = await supabase.functions.invoke<{ meal?: ParsedMeal; error?: string }>('meal-parse', { body: { images, note, hint }, signal })
  if (error) {
    // treść błędu funkcji (limit, wyłączone konto) jest w odpowiedzi, a nie w `error.message`
    const ctx = (error as { context?: Response }).context
    const msg = ctx ? await ctx.json().then((b: { error?: string }) => b.error).catch(() => null) : null
    throw new Error(msg ?? error.message)
  }
  if (!data?.meal) throw new Error(data?.error ?? 'brak odpowiedzi')
  return data.meal
}

export const canParseMeal = !!supabase
