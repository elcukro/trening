/**
 * „Zapytaj trenera” (docs/23): wywołanie Edge Function `coach-chat` i historia rozmowy w `kv` (per dzień, lokalnie,
 * 7 dni wstecz – starsze wpisy znikają przy otwarciu czatu). Narzędzia wykonuje arkusz (src/ios/coachTools.ts).
 */
import { db } from '@/db'
import { addDays, type ISODate } from '@/engine/dates'
import { supabase } from './supabase'

export type ChatBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | ChatBlock[]
  /** kiedy (ISO) – tylko w jednym wątku `/m`; serwer to pole ignoruje */
  at?: string
}

export interface ChatReply {
  content: ChatBlock[]
  stop_reason: string
  text: string
  tools: { id: string; name: string; input: Record<string, unknown> }[]
}

/** Błąd funkcji po ludzku: treść `error` z odpowiedzi serwera (limit, brak klucza) albo status (401 = sesja wygasła). */
async function describeError(e: unknown): Promise<string> {
  const ctx = (e as { context?: Response }).context
  if (ctx instanceof Response) {
    if (ctx.status === 401) return 'Sesja wygasła – zaloguj się ponownie.'
    try {
      const body = (await ctx.clone().json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* odpowiedź bez JSON */
    }
    return `Trener nie odpowiada (${ctx.status}).`
  }
  return e instanceof Error ? e.message : 'Trener nie odpowiada'
}

export const canChat = !!supabase

/** Błąd sieci (żądanie nie wyszło z telefonu): supabase-js zgłasza go bez odpowiedzi serwera. */
function isNetworkError(e: unknown): boolean {
  return !((e as { context?: unknown }).context instanceof Response)
}

export async function askCoach(messages: ChatMessage[], context: unknown, signal?: AbortSignal): Promise<ChatReply> {
  if (!supabase) throw new Error('Bez konta trener nie odpowiada')
  const call = () => supabase!.functions.invoke<ChatReply & { error?: string }>('coach-chat', { body: { messages, context }, signal })
  let { data, error } = await call()
  // iOS po wybudzeniu aplikacji potrafi zerwać pierwsze żądanie, zanim wyjdzie z telefonu (21.10.2026: serwer nie dostał nic) –
  // jedna ponowna próba po chwili, potem komunikat po polsku zamiast „Failed to send a request to the Edge Function”
  if (error && isNetworkError(error) && !signal?.aborted) {
    await new Promise((r) => setTimeout(r, 1500))
    ;({ data, error } = await call())
    if (error && isNetworkError(error)) throw new Error('Brak połączenia z trenerem – sprawdź sieć i wyślij jeszcze raz.')
  }
  if (error) throw new Error(await describeError(error))
  if (!data || data.error) throw new Error(data?.error ?? 'brak odpowiedzi')
  return data
}

const KEY = 'coach_chat:'
const KEEP_DAYS = 7

export async function loadChat(date: ISODate): Promise<ChatMessage[]> {
  const row = await db.kv.get(`${KEY}${date}`)
  return Array.isArray(row?.value) ? (row.value as ChatMessage[]) : []
}

export async function saveChat(date: ISODate, messages: ChatMessage[]): Promise<void> {
  await db.kv.put({ key: `${KEY}${date}`, value: messages, updated_at: new Date().toISOString() })
}

export async function clearChat(date: ISODate): Promise<void> {
  await db.kv.delete(`${KEY}${date}`)
}

/** Rozmowy starsze niż tydzień nie są nikomu potrzebne – historia ma być krótka. */
export async function pruneChats(today: ISODate): Promise<void> {
  const cutoff = `${KEY}${addDays(today, -KEEP_DAYS)}`
  const old = (await db.kv.where('key').startsWith(KEY).toArray()).filter((r) => r.key < cutoff)
  if (old.length) await db.kv.bulkDelete(old.map((r) => r.key))
}

/* ------------------------------------------------------------------ jeden ciągły wątek (mobilny v2, docs/24 § 4) */

const THREAD_KEY = 'coach_thread'

/** Wątek z ostatnich 7 dni – zawodnik pyta wieczorem o jutro, więc podział per dzień nie ma sensu. */
export async function loadThread(today: ISODate): Promise<ChatMessage[]> {
  const row = await db.kv.get(THREAD_KEY)
  const all = Array.isArray(row?.value) ? (row.value as ChatMessage[]) : []
  const cutoff = `${addDays(today, -KEEP_DAYS)}T00:00:00`
  const kept = all.filter((m) => !m.at || m.at >= cutoff)
  // wątek nie może zaczynać się od asystenta ani od wyników narzędzi bez ich wywołania – obcinamy do pierwszej wiadomości użytkownika z tekstem
  const start = kept.findIndex((m) => m.role === 'user' && (typeof m.content === 'string' || m.content.some((b) => b.type === 'text')))
  return start < 0 ? [] : kept.slice(start)
}

export async function saveThread(messages: ChatMessage[]): Promise<void> {
  await db.kv.put({ key: THREAD_KEY, value: messages, updated_at: new Date().toISOString() })
}

export async function clearThread(): Promise<void> {
  await db.kv.delete(THREAD_KEY)
}
