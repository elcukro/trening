import { useState } from 'react'
import { useEngine } from '@/app/useSettings'
import { useAuth } from '@/sync/auth'
import { supabase } from '@/sync/supabase'
import { uploadEmailSnapshots } from '@/sync/emailSnapshots'
import { todayISO } from '@/lib/dates'
import { useToast } from '@/components/Toast'
import { Actions, Button, Card, CardTitle, Checkbox } from '@/components/ui'

/** Maile treningowe (docs/19): poranna odprawa o 7:00 w dni z treningiem i podsumowanie zaraz po wgraniu jazdy. */
export function EmailSection() {
  const engine = useEngine()
  const auth = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const s = engine.ctx.settings
  if (!supabase || !auth.session) return null

  async function sample(kind: 'morning' | 'workout') {
    setBusy(true)
    try {
      await toast.run(
        'Wysyłam mail próbny…',
        async () => {
          await uploadEmailSnapshots(todayISO(), engine.ctx, engine.weeks)
          const { data, error } = await supabase!.functions.invoke('email-send', { body: { action: 'sample', kind } })
          if (error) throw new Error(kind === 'workout' ? 'Brak jazdy ze Stravy do podsumowania albo błąd wysyłki.' : 'Brak treningu w najbliższych dniach albo błąd wysyłki.')
          return (data as { to: string }).to
        },
        (to) => `Wysłane na ${to}`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardTitle icon="✉️">E-mail</CardTitle>
      <Checkbox label="Poranna odprawa o 7:00" hint="Tylko w dni z treningiem: kroki z watami i tętnem, jedzenie, uwagi dnia." checked={!!s.email_morning} onChange={(e) => void engine.settingsApi.update({ email_morning: e.target.checked })} />
      <Checkbox label="Podsumowanie po treningu" hint="Zaraz po wgraniu jazdy ze Stravy: liczby, strefy, dryf tętna, tydzień." checked={!!s.email_workout} onChange={(e) => void engine.settingsApi.update({ email_workout: e.target.checked })} />
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Na adres {auth.session.user.email}, z trening@felsztukier.pl. Pierwszy mail może trafić do spamu – oznacz „To nie spam”.</p>
      <Actions className="mt-3">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void sample('morning')}>
          Próbna odprawa
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void sample('workout')}>
          Próbne podsumowanie
        </Button>
      </Actions>
    </Card>
  )
}
