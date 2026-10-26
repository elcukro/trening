import { useCallback, useEffect, useRef, useState } from 'react'
import type { ISODate } from '@/engine/dates'
import { askCoach, canChat, clearChat, loadChat, pruneChats, saveChat, type ChatBlock, type ChatMessage } from '@/sync/coachChat'
import { useToast } from '@/components/Toast'
import { runCoachTool } from '@/day/coachTools'
import { useCoach } from '@/day/useCoach'
import type { IosDay } from '@/day/useIos'
import { Sheet } from './Chrome'
import { IconCheck, IconClose } from './Icons'
import { useT } from '@/i18n/react'

/** Ile razy z rzędu model może sięgnąć po narzędzie w jednej wiadomości (każda runda = jedno wywołanie modelu). */
const MAX_ROUNDS = 4

interface Line {
  role: 'user' | 'assistant' | 'tool'
  text: string
  ok?: boolean
}

/** Model mimo instrukcji potrafi pogrubić markdownem – w dymku ma być czysty tekst. */
const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)_(.+?)_(?=\s|$|[.,])/g, '$1$2')

/** Historia (bloki) → linie do wyświetlenia: tekst zawodnika, tekst trenera, wyniki narzędzi. */
function toLines(messages: ChatMessage[]): Line[] {
  const out: Line[] = []
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, text: m.content })
      continue
    }
    for (const b of m.content) {
      if (b.type === 'text' && b.text.trim()) out.push({ role: m.role, text: plain(b.text) })
      else if (b.type === 'tool_result') out.push({ role: 'tool', text: b.content, ok: !b.is_error })
    }
  }
  return out
}

/** Czat z trenerem (docs/23): kontekst z aplikacji przy każdej wiadomości, narzędzia wykonywane lokalnie. */
export function CoachSheet({ d, date, onClose }: { d: IosDay; date: ISODate; onClose: () => void }) {
  const toast = useToast()
  const tr = useT()
  const tx = tr.ios.coach
  const { context, deps } = useCoach(d, date)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void pruneChats(deps.today)
    loadChat(date).then((m) => {
      setMessages(m)
      setLoaded(true)
    })
  }, [date, deps.today])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy])

  const send = useCallback(
    async (text: string) => {
      const t = text.trim()
      if (!t || busy) return
      setError(null)
      setDraft('')
      let history: ChatMessage[] = [...messages, { role: 'user', content: t }]
      setMessages(history)
      setBusy(tx.reading)
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const reply = await askCoach(history, context())
          history = [...history, { role: 'assistant', content: reply.content }]
          setMessages(history)
          if (reply.stop_reason !== 'tool_use' || !reply.tools.length) break
          const results: ChatBlock[] = []
          for (const call of reply.tools) {
            setBusy(tx.running((tx.tool as Record<string, string>)[call.name] ?? call.name))
            const r = await runCoachTool(call.name, call.input, deps)
            results.push({ type: 'tool_result', tool_use_id: call.id, content: r.text, ...(r.ok ? {} : { is_error: true }) })
            if (r.ok && r.changed) toast.notify((tx.changed as Record<string, string>)[r.changed] ?? tr.common.saved)
          }
          history = [...history, { role: 'user', content: results }]
          setMessages(history)
          setBusy(tx.replying)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : tx.noReply)
      } finally {
        setBusy(null)
        await saveChat(date, history)
      }
    },
    [busy, messages, context, deps, date, toast, tx, tr],
  )

  const reset = async () => {
    await clearChat(date)
    setMessages([])
    setError(null)
  }

  const lines = toLines(messages)

  return (
    <Sheet title={tx.title} onClose={onClose} done={lines.length ? { label: tx.clear, onClick: () => void reset(), disabled: !!busy } : undefined}>
      <div className="flex min-h-full flex-col px-4" style={{ minHeight: '60vh' }}>
        {!canChat && <p className="ios-footnote ios-dim py-6 text-center">{tx.needsAccount}</p>}
        {canChat && loaded && !lines.length && (
          <div className="py-2">
            <p className="ios-footnote ios-dim mb-3">{tx.intro}</p>
            <div className="flex flex-col gap-2">
              {tx.examples.map((x) => (
                <button key={x} className="ios-press rounded-xl px-3 py-2 text-left text-[15px]" style={{ background: 'var(--fill)', color: 'var(--label)' }} onClick={() => void send(x)}>
                  {x}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2 py-2" aria-live="polite">
          {lines.map((l, i) =>
            l.role === 'tool' ? (
              <div key={i} className="ios-caption flex items-start gap-1.5 self-center px-2 py-1" style={{ color: l.ok ? 'var(--green)' : 'var(--red)' }}>
                {l.ok ? <IconCheck size={14} /> : <IconClose size={14} />}
                <span>{l.text}</span>
              </div>
            ) : (
              <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[16px] leading-snug ${l.role === 'user' ? 'self-end' : 'self-start'}`} style={l.role === 'user' ? { background: 'var(--blue)', color: '#fff' } : { background: 'var(--fill)', color: 'var(--label)' }}>
                {l.text}
              </div>
            ),
          )}
          {busy && <div className="ios-caption ios-dim self-start px-2 py-1">{busy}</div>}
          {error && <div className="ios-caption self-start px-2 py-1" style={{ color: 'var(--red)' }}>{error}</div>}
          <div ref={bottom} />
        </div>
        {canChat && (
          <form
            className="sticky bottom-0 flex items-end gap-2 py-2"
            style={{ background: 'var(--bg)' }}
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
            }}
          >
            <textarea
              ref={input}
              className="ios-input ios-input-block"
              style={{ padding: '10px 12px', resize: 'none' }}
              rows={1}
              placeholder={tx.placeholder}
              aria-label={tx.inputLabel}
              value={draft}
              disabled={!!busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
            />
            <button type="submit" className="ios-btn ios-btn-filled shrink-0" disabled={!!busy || !draft.trim()} aria-label={tx.send}>
              {tx.send}
            </button>
          </form>
        )}
      </div>
    </Sheet>
  )
}
