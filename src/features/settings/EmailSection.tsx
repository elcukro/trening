import { useState } from 'react'
import { useEngine } from '@/app/useSettings'
import { useAuth } from '@/sync/auth'
import { supabase } from '@/sync/supabase'
import { uploadEmailSnapshots } from '@/sync/emailSnapshots'
import { todayISO } from '@/lib/dates'
import { useToast } from '@/components/Toast'
import { Actions, Button, Card, CardTitle, Checkbox } from '@/components/ui'
import { UserError } from '@/i18n'
import { useT } from '@/i18n/react'

/** Maile treningowe (docs/19): poranna odprawa o 7:00 w dni z treningiem i podsumowanie zaraz po wgraniu jazdy. */
export function EmailSection() {
  const engine = useEngine()
  const auth = useAuth()
  const toast = useToast()
  const te = useT().settings.email
  const [busy, setBusy] = useState(false)
  const s = engine.ctx.settings
  if (!supabase || !auth.session) return null

  async function sample(kind: 'morning' | 'workout' | 'weekly') {
    setBusy(true)
    try {
      await toast.run(
        te.sending,
        async () => {
          await uploadEmailSnapshots(todayISO(), engine.ctx, engine.weeks)
          const { data, error } = await supabase!.functions.invoke('email-send', { body: { action: 'sample', kind } })
          if (error) throw new UserError(kind === 'workout' ? te.errorWorkout : kind === 'weekly' ? te.errorWeekly : te.errorMorning, { cause: error })
          return (data as { to: string }).to
        },
        (to) => te.sentTo(to),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardTitle icon="✉️">{te.title}</CardTitle>
      <Checkbox label={te.morning} hint={te.morningHint} checked={!!s.email_morning} onChange={(e) => void engine.settingsApi.update({ email_morning: e.target.checked })} />
      <Checkbox label={te.weekly} hint={te.weeklyHint} checked={!!s.email_weekly} onChange={(e) => void engine.settingsApi.update({ email_weekly: e.target.checked })} />
      <Checkbox label={te.workout} hint={te.workoutHint} checked={!!s.email_workout} onChange={(e) => void engine.settingsApi.update({ email_workout: e.target.checked })} />
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{te.address(auth.session.user.email ?? '')}</p>
      <Actions className="mt-3">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void sample('morning')}>
          {te.sampleMorning}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void sample('workout')}>
          {te.sampleWorkout}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void sample('weekly')}>
          {te.sampleWeekly}
        </Button>
      </Actions>
    </Card>
  )
}
