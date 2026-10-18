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
}

export interface ChatReply {
  content: ChatBlock[]
  stop_reason: string
  text: string
  tools: { id: string; name: string; input: Record<string, unknown> }[]
}

export const canChat = !!supabase

export async function askCoach(messages: ChatMessage[], context: unknown): Promise<ChatReply> {
  if (!supabase) throw new Error('Bez konta trener nie odpowiada')
  const { data, error } = await supabase.functions.invoke<ChatReply & { error?: string }>('coach-chat', { body: { messages, context } })
  if (error) throw new Error(error.message)
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
