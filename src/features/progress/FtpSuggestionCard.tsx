import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type KeyValueRow } from '@/db'
import type { RideRow } from '@/app/useRides'
import { saveTestResult } from '@/db/repo'
import type { Engine } from '@/app/useSettings'
import { effectiveFtp } from '@/engine/progress'
import { lthrFromRide, suggestFtp, type FtpSuggestion } from '@/engine/power'
import { loadRideStreams } from '@/sync/strava'
import { Actions, Button, Card, CardTitle } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { fmtDayMonth, todayISO } from '@/lib/dates'
import { useT } from '@/i18n/react'

const DISMISS_PREFIX = 'ftp_dismiss:'

/** Hook: propozycja nowego FTP z ostatnich jazd z miernikiem (po ostatnim teście), z odrzuceniami z `kv`. */
export function useFtpSuggestion(engine: Engine, acts: RideRow[]): FtpSuggestion | null {
  const dismissed = useLiveQuery(async () => (await db.kv.where('key').startsWith(DISMISS_PREFIX).toArray()) as KeyValueRow[], [], [] as KeyValueRow[])
  return useMemo(() => {
    const today = todayISO()
    const tests = engine.ctx.tests ?? []
    const eff = effectiveFtp(today, engine.ctx.settings.ftp_w_estimate, tests)
    const since = eff.source === 'test' ? (eff.test_date ?? null) : null
    // tylko Wahoo: zapisane FTP trafia do danych, które widzi AI, więc nie może pochodzić ze Stravy (docs/33)
    const rides = acts.filter((a) => a.source === 'wahoo')
    return suggestFtp(rides, eff.ftp, since, new Set(dismissed.map((d) => d.key.slice(DISMISS_PREFIX.length))))
  }, [engine, acts, dismissed])
}

/**
 * „Zaktualizować FTP do X W?” – jedno dotknięcie zapisuje wynik jak test (protokół FTP_TEST, data jazdy),
 * więc strefy obowiązują od następnego dnia (R11). LTHR dokładamy z tej samej jazdy, jeśli wysiłek był progowy.
 */
export function FtpSuggestionCard({ engine, acts }: { engine: Engine; acts: RideRow[] }) {
  const toast = useToast()
  const tp = useT().progress
  const tf = tp.ftpSuggestion
  const s = useFtpSuggestion(engine, acts)
  // LTHR z próbek tej jazdy – ładowane asynchronicznie, klucz = jazda (nowa propozycja → nowy odczyt)
  const [lthrFor, setLthrFor] = useState<{ ride_id: string; value: { lthr: number; effort_w: number } | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const rideId = s?.ride_id ?? null
  const ride = rideId ? acts.find((a) => a.key === rideId) : undefined
  const currentFtp = s?.current_ftp ?? null

  useEffect(() => {
    if (!rideId || !ride || !currentFtp) return
    let alive = true
    loadRideStreams(ride)
      .then((samples) => {
        if (alive) setLthrFor({ ride_id: rideId, value: samples ? lthrFromRide(samples, currentFtp) : null })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [rideId, ride, currentFtp])

  if (!s) return null
  const lthr = lthrFor?.ride_id === s.ride_id ? lthrFor.value : null

  async function accept() {
    if (!s) return
    setBusy(true)
    try {
      await toast.run(
        tf.saving,
        () =>
          saveTestResult({
            date: s.ride_date,
            protocol: 'FTP_TEST',
            lthr_bpm: lthr?.lthr ?? null,
            avg_power_w: s.effort_w,
            ftp_w: s.ftp,
            notes: tf.notes(s.ride_name ?? tp.rideFallback, s.basis === '20min', !!lthr),
          }),
        () => tf.saved(s.ftp, fmtDayMonth(s.ride_date)),
      )
    } finally {
      setBusy(false)
    }
  }

  async function dismiss() {
    if (!s) return
    await db.kv.put({ key: `${DISMISS_PREFIX}${s.ride_id}`, value: s.ftp, updated_at: new Date().toISOString() })
  }

  return (
    <Card tone="accent">
      <CardTitle icon="⚡">{tf.title(s.ftp)}</CardTitle>
      <p className="text-sm">
        {tf.bodyA(s.ride_name ?? tp.rideFallback, fmtDayMonth(s.ride_date), tf.basis(s.basis === '20min'))} <b>{s.effort_w} W</b>
        {tf.bodyB(s.basis === '20min' ? s.ftp : null, Math.round(((s.ftp - s.current_ftp) / s.current_ftp) * 100), s.current_ftp)}
        {lthr ? tf.lthr(lthr.lthr) : ''}
      </p>
      <Actions className="mt-3">
        <Button onClick={accept} disabled={busy}>
          {tf.accept}
        </Button>
        <Button variant="ghost" onClick={dismiss} disabled={busy}>
          {tf.notNow}
        </Button>
      </Actions>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tf.foot}</p>
    </Card>
  )
}
