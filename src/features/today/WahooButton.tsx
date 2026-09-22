import { useState } from 'react'
import { useEngine } from '@/app/useSettings'
import type { DayPlan } from '@/engine/plan'
import { isPushable } from '@/engine/wahoo'
import { pushItemForDay, wahoo } from '@/sync/wahoo'
import { supabase } from '@/sync/supabase'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui'
import { boltLabel, useBoltState } from './WahooStatus'

/** „Wyślij na Wahoo” – jeden dzień na Bolta. */
export function WahooButton({ day }: { day: DayPlan }) {
  const engine = useEngine()
  const { run } = useToast()
  const [busy, setBusy] = useState(false)
  const bolt = useBoltState(day)
  if (!day.bike || !isPushable(day.bike.workout_id)) return null
  const label = boltLabel(bolt)

  async function send() {
    setBusy(true)
    try {
      await run(
      'Wysyłam trening na Wahoo…',
      async () => {
        if (!supabase) throw new Error('Aplikacja działa lokalnie – wysyłka wymaga konfiguracji Supabase.')
        const item = pushItemForDay(day, engine.ctx)
        if (!item) throw new Error('Tego dnia nie ma czego wysłać.')
        const res = await wahoo.push([item])
        const r = res.results[0]
        if (!r || r.status === 'error') throw new Error(r?.error === 'not_connected' ? 'Najpierw połącz Wahoo w Ustawieniach → Integracje.' : (r?.error ?? 'nieznany błąd'))
        if (r.plan_linked === false) throw new Error('Trening utworzony, ale Wahoo nie podpięło do niego planu.')
        return r.status
      },
        (status) => (status === 'updated' ? 'Zaktualizowano trening na Bolcie' : 'Wysłano na Bolta. Zsynchronizuj zegarek.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <Button variant={bolt.kind === 'ok' ? 'ghost' : 'secondary'} onClick={send} disabled={busy} className="w-full">
        ⌚ {bolt.kind === 'ok' ? 'Wyślij ponownie na Wahoo' : bolt.kind === 'stale' ? 'Zaktualizuj na Wahoo' : 'Wyślij na Wahoo'}
      </Button>
      {label && (
        <p className={`mt-1 text-center text-xs ${label.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : label.tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`} data-testid="bolt-state">
          {label.text}
        </p>
      )}
    </div>
  )
}
