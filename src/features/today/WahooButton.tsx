import { useState } from 'react'
import { useEngine } from '@/app/useSettings'
import type { DayPlan } from '@/engine/plan'
import { isPushable } from '@/engine/wahoo'
import { pushItemFor, wahoo } from '@/sync/wahoo'
import { supabase } from '@/sync/supabase'
import { Button } from '@/components/ui'

/** „Wyślij na Wahoo” – jeden dzień na Bolta. */
export function WahooButton({ day }: { day: DayPlan }) {
  const engine = useEngine()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  if (!supabase || !day.bike || !isPushable(day.bike.workout_id)) return null

  async function send() {
    setState('busy')
    setMsg(null)
    try {
      const item = pushItemFor(day.date, engine.ctx, engine.weeks)
      if (!item) throw new Error('Tego dnia nie ma czego wysłać.')
      const res = await wahoo.push([item])
      const r = res.results[0]
      if (r?.status === 'error') throw new Error(r.error ?? 'nieznany błąd')
      setState('done')
      setMsg(r?.status === 'updated' ? 'Zaktualizowano trening na Bolcie.' : 'Wysłano na Bolta. Zsynchronizuj zegarek.')
    } catch (e) {
      setState('error')
      const detail = e instanceof Error ? e.message : String(e)
      setMsg(detail === 'not_connected' ? 'Najpierw połącz Wahoo w Ustawieniach → Integracje.' : detail)
    }
  }

  return (
    <div className="mt-3">
      <Button variant="secondary" onClick={send} disabled={state === 'busy'} className="w-full">
        {state === 'busy' ? 'Wysyłam…' : state === 'done' ? '✓ Na Bolcie' : '⌚ Wyślij na Wahoo'}
      </Button>
      {msg && <p className={`mt-1 text-xs ${state === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{msg}</p>}
    </div>
  )
}
