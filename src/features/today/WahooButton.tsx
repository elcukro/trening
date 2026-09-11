import { useEngine } from '@/app/useSettings'
import type { DayPlan } from '@/engine/plan'
import { isPushable } from '@/engine/wahoo'
import { pushItemFor, wahoo } from '@/sync/wahoo'
import { supabase } from '@/sync/supabase'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui'

/** „Wyślij na Wahoo” – jeden dzień na Bolta. */
export function WahooButton({ day }: { day: DayPlan }) {
  const engine = useEngine()
  const { run, busy } = useToast()
  if (!day.bike || !isPushable(day.bike.workout_id)) return null

  async function send() {
    await run(
      'Wysyłam trening na Wahoo…',
      async () => {
        if (!supabase) throw new Error('Aplikacja działa lokalnie – wysyłka wymaga konfiguracji Supabase.')
        const item = pushItemFor(day.date, engine.ctx, engine.weeks)
        if (!item) throw new Error('Tego dnia nie ma czego wysłać.')
        const res = await wahoo.push([item])
        const r = res.results[0]
        if (!r || r.status === 'error') throw new Error(r?.error === 'not_connected' ? 'Najpierw połącz Wahoo w Ustawieniach → Integracje.' : (r?.error ?? 'nieznany błąd'))
        return r.status
      },
      (status) => (status === 'updated' ? 'Zaktualizowano trening na Bolcie' : 'Wysłano na Bolta. Zsynchronizuj zegarek.'),
    )
  }

  return (
    <Button variant="secondary" onClick={send} disabled={busy} className="mt-3 w-full">
      ⌚ Wyślij na Wahoo
    </Button>
  )
}
