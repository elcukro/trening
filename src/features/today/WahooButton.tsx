import { useState } from 'react'
import { useEngine } from '@/app/useSettings'
import type { DayPlan } from '@/engine/plan'
import { isPushable } from '@/engine/wahoo'
import { pushItemForDay, wahoo } from '@/sync/wahoo'
import { supabase } from '@/sync/supabase'
import { t as tNow, UserError } from '@/i18n'
import { useT } from '@/i18n/react'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui'
import { boltLabel, useBoltState } from './WahooStatus'

/** „Wyślij na Wahoo” – jeden dzień na Bolta. */
export function WahooButton({ day }: { day: DayPlan }) {
  const engine = useEngine()
  const { run } = useToast()
  const [busy, setBusy] = useState(false)
  const bolt = useBoltState(day)
  const t = useT()
  if (!day.bike || !isPushable(day.bike.workout_id)) return null
  const label = boltLabel(bolt)

  async function send() {
    setBusy(true)
    try {
      await run(
      t.classic.bolt.sending,
      async () => {
        const w = tNow().classic.bolt
        if (!supabase) throw new UserError(w.noServer)
        const item = pushItemForDay(day, engine.ctx)
        if (!item) throw new UserError(w.nothing)
        const res = await wahoo.push([item])
        const r = res.results[0]
        if (!r || r.status === 'error') throw new UserError(r?.error === 'not_connected' ? w.notConnected : w.failed(r?.error ?? w.unknown))
        if (r.plan_linked === false) throw new UserError(w.notLinked)
        return r.status
      },
        (status) => (status === 'updated' ? tNow().classic.bolt.updated : tNow().classic.bolt.sent),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <Button variant={bolt.kind === 'ok' ? 'ghost' : 'secondary'} onClick={send} disabled={busy} className="w-full">
        ⌚ {bolt.kind === 'ok' ? t.classic.bolt.sendAgain : bolt.kind === 'stale' ? t.classic.bolt.update : t.classic.bolt.send}
      </Button>
      {label && (
        <p className={`mt-1 text-center text-xs ${label.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : label.tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`} data-testid="bolt-state">
          {label.text}
        </p>
      )}
    </div>
  )
}
