import { supabase } from './supabase'

/** Odpowiedź `fit-upload` (docs/33 § 7a). */
export interface FitUploadResult {
  id: number
  date: string
  name: string
  moving_time_s: number
  /** ten sam plik był już wgrany – jazda się nie dubluje */
  duplicate: boolean
  /** ta sama jazda jest na Stravie (MyWhoosh) – w aplikacji zastępuje ją kopia z pliku */
  replaces_strava: boolean
}

/** Do 8 MB – godzina jazdy z MyWhoosh to ok. 200–400 kB. */
export const FIT_MAX_BYTES = 8 * 1024 * 1024

/** Plik FIT po nagłówku: bajty 8–11 to „.FIT” (rozszerzenie bywa inne, gdy plik przeszedł przez komunikator). */
export async function looksLikeFit(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  return head.length >= 12 && String.fromCharCode(head[8]!, head[9]!, head[10]!, head[11]!) === '.FIT'
}

async function base64Of(file: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('Nie udało się odczytać pliku'))
    r.readAsDataURL(file)
  })
  return url.slice(url.indexOf(',') + 1)
}

async function invoke<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new Error('Wgrywanie jazd wymaga konta')
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('fit-upload', { body, signal })
  if (error) {
    // treść błędu funkcji („W pliku nie ma jazdy…”) jest w odpowiedzi, a nie w `error.message`
    const ctx = (error as { context?: Response }).context
    const msg = ctx ? await ctx.json().then((b: { error?: string }) => b.error).catch(() => null) : null
    throw new Error(msg ?? error.message)
  }
  if (!data) throw new Error('brak odpowiedzi')
  return data
}

/** Plik FIT → jazda (źródło `fit`). Notatka trenera i mail powstają na serwerze w tle; jazdę przynosi synchronizacja. */
export async function uploadFit(file: File, signal?: AbortSignal): Promise<FitUploadResult> {
  if (file.size > FIT_MAX_BYTES) throw new Error('Plik jest za duży (do 8 MB)')
  if (!(await looksLikeFit(file))) throw new Error('To nie jest plik FIT – w MyWhoosh pobierz jazdę jako .fit')
  return invoke<FitUploadResult>({ file: await base64Of(file), file_name: file.name }, signal)
}

/** Usuwa wgraną jazdę (na serwerze soft delete – log dnia przelicza się sam). */
export async function deleteFit(id: number | string): Promise<void> {
  await invoke({ delete: Number(id) })
}

export const canUploadFit = !!supabase
