import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays } from '@/engine/dates'
import { useIosDay } from '@/day/useIos'
import { useCoach } from '@/day/useCoach'
import { runCoachTool } from '@/day/coachTools'
import { coachChips } from '@/day/coachChips'
import { askCoach, canChat, clearThread, loadThread, saveThread, type ChatBlock, type ChatMessage } from '@/sync/coachChat'
import { useToast } from '@/components/Toast'
import { fmtDayMonth, todayISO } from '@/lib/dates'
import { IconCheck, IconClose } from '@/ios/components/Icons'
import { Sheet } from './Chrome'
import { useDayPhase } from '../useDayPhase'
import { ART } from '../art'

const MAX_ROUNDS = 4
const TOOL_LABEL: Record<string, string> = { save_checkin: 'zapis check-inu', set_rpe: 'zapis RPE', mark_skipped: 'oznaczenie pominięcia', move_ride: 'przeniesienie jazdy', push_wahoo: 'wysyłka na Bolta' }
const CHANGED_LABEL: Record<string, string> = { checkin: 'Check-in zapisany', log: 'RPE zapisane', plan: 'Plan zmieniony', bolt: 'Wysłano na Bolta' }

/** Model mimo instrukcji potrafi pogrubić markdownem – w dymku ma być czysty tekst. */
const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)_(.+?)_(?=\s|$|[.,])/g, '$1$2')

interface Line {
  role: 'user' | 'assistant' | 'tool' | 'day'
  text: string
  ok?: boolean
}

/** Historia (bloki) → linie: wiadomości, wyniki narzędzi i separatory dni. */
function toLines(messages: ChatMessage[], today: string): Line[] {
  const out: Line[] = []
  let lastDay = ''
  for (const m of messages) {
    const day = m.at?.slice(0, 10) ?? ''
    if (day && day !== lastDay) {
      out.push({ role: 'day', text: day === today ? 'Dziś' : day === addDays(today, -1) ? 'Wczoraj' : fmtDayMonth(day) })
      lastDay = day
    }
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

/**
 * Trener w mobilnym v2 (docs/24 § 4): jeden ciągły wątek z 7 dni, podpowiedzi zależne od stanu dnia,
 * początek wiadomości z karty (`prefill`), narzędzia wykonywane lokalnie z wynikiem w rozmowie.
 */
export function CoachSheet({ prefill, onClose }: { prefill?: string; onClose: () => void }) {
  const toast = useToast()
  const today = todayISO()
  const d = useIosDay(today)
  const phase = useDayPhase(d, today)
  const { context, deps } = useCoach(d, today)
  const tomorrow = d.view.window.find((x) => x.date === addDays(today, 1)) ?? null
  const chips = useMemo(() => coachChips({ phase, lastWeightKg: d.checkin?.weight_kg ?? d.lastWeight?.kg ?? null, rideName: d.day?.bike?.name ?? null, tomorrowRide: tomorrow?.bike?.name ?? null }), [phase, d.checkin?.weight_kg, d.lastWeight?.kg, d.day?.bike?.name, tomorrow?.bike?.name])

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState(prefill ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadThread(today).then((m) => {
      setMessages(m)
      setLoaded(true)
    })
  }, [today])

  useEffect(() => {
    if (!loaded) return
    bottom.current?.scrollIntoView({ block: 'end' })
    const el = input.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [loaded])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy])

  const send = useCallback(
    async (text: string) => {
      const t = text.trim()
      if (!t || busy) return
      setError(null)
      setDraft('')
      const at = new Date().toISOString()
      let history: ChatMessage[] = [...messages, { role: 'user', content: t, at }]
      setMessages(history)
      setBusy('Trener czyta…')
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const reply = await askCoach(history, context())
          history = [...history, { role: 'assistant', content: reply.content, at: new Date().toISOString() }]
          setMessages(history)
          if (reply.stop_reason !== 'tool_use' || !reply.tools.length) break
          const results: ChatBlock[] = []
          for (const call of reply.tools) {
            setBusy(`Wykonuję: ${TOOL_LABEL[call.name] ?? call.name}…`)
            const r = await runCoachTool(call.name, call.input, deps)
            results.push({ type: 'tool_result', tool_use_id: call.id, content: r.text, ...(r.ok ? {} : { is_error: true }) })
            if (r.ok && r.changed) toast.notify(CHANGED_LABEL[r.changed] ?? 'Zapisano')
          }
          history = [...history, { role: 'user', content: results, at: new Date().toISOString() }]
          setMessages(history)
          setBusy('Trener odpowiada…')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Trener nie odpowiada')
      } finally {
        setBusy(null)
        await saveThread(history)
      }
    },
    [busy, messages, context, deps, toast],
  )

  const reset = async () => {
    await clearThread()
    setMessages([])
    setError(null)
  }

  const lines = toLines(messages, today)

  return (
    <Sheet title="Trener" onClose={onClose} action={lines.length ? <button className="m-nav-btn m-sub" onClick={() => void reset()} disabled={!!busy}>Wyczyść</button> : undefined}>
      <div className="flex flex-col" style={{ minHeight: '70dvh' }}>
        {!canChat && <p className="m-sub m-dim py-6 text-center">Czat wymaga konta – aplikacja działa lokalnie.</p>}
        {canChat && loaded && !lines.length && (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <img src={ART.coachWave} alt="" width={120} height={160} className="h-40 w-[120px] object-contain" />
            <p className="m-sub m-dim px-2">Widzę Twój plan, ostatnie jazdy i check-iny. Podaj dane zdaniem – zapiszę je. Możesz też zapytać o plan albo poprosić o przeniesienie jazdy.</p>
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2 py-2" aria-live="polite">
          {lines.map((l, i) => {
            if (l.role === 'day') return <div key={i} className="m-eyebrow self-center py-1">{l.text}</div>
            if (l.role === 'tool')
              return (
                <div key={i} className="m-foot flex items-start gap-1.5 self-center px-2 py-1" style={{ color: l.ok ? 'var(--green)' : 'var(--red)' }}>
                  {l.ok ? <IconCheck size={14} /> : <IconClose size={14} />}
                  <span>{l.text}</span>
                </div>
              )
            if (l.role === 'user')
              return (
                <div key={i} className="max-w-[82%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-[16px] leading-snug" style={{ background: 'var(--accent)', color: '#fff' }}>
                  {l.text}
                </div>
              )
            return (
              <div key={i} className="flex max-w-[88%] items-end gap-2 self-start">
                <img src="/m/art/coach-face.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" style={{ boxShadow: '0 0 0 1.5px var(--accent-soft)' }} />
                <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md px-3.5 py-2 text-[16px] leading-snug" style={{ background: 'var(--card)', color: 'var(--label)', boxShadow: 'var(--shadow)' }}>
                  {l.text}
                </div>
              </div>
            )
          })}
          {busy && (
            <div className="m-foot m-dim flex items-center gap-2 self-start px-2 py-1">
              <span className="m-typing" aria-hidden />
              {busy}
            </div>
          )}
          {error && <div className="m-foot self-start px-2 py-1" style={{ color: 'var(--red)' }}>{error}</div>}
          <div ref={bottom} />
        </div>
        {canChat && (
          <div className="sticky bottom-0 pt-2" style={{ background: 'var(--bg)' }}>
            <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4" style={{ scrollbarWidth: 'none' }}>
              {chips.map((c) => (
                <button
                  key={c.label}
                  className="m-press shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium"
                  style={{ background: 'var(--card)', color: 'var(--accent)', boxShadow: 'var(--shadow)' }}
                  disabled={!!busy}
                  onClick={() => {
                    if (c.send) void send(c.send)
                    else if (c.prefill) {
                      setDraft(c.prefill)
                      input.current?.focus()
                    }
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <form
              className="flex items-end gap-2 pb-1"
              onSubmit={(e) => {
                e.preventDefault()
                void send(draft)
              }}
            >
              <textarea
                ref={input}
                className="m-input flex-1"
                rows={1}
                placeholder="Napisz albo podyktuj…"
                aria-label="Wiadomość do trenera"
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
              <button type="submit" className="m-send" disabled={!!busy || !draft.trim()} aria-label="Wyślij">
                ↑
              </button>
            </form>
          </div>
        )}
      </div>
    </Sheet>
  )
}
