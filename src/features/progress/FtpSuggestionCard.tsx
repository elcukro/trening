import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type KeyValueRow, type StravaActivity } from '@/db'
import { saveTestResult } from '@/db/repo'
import type { Engine } from '@/app/useSettings'
import { effectiveFtp } from '@/engine/progress'
import { lthrFromRide, suggestFtp, type FtpSuggestion } from '@/engine/power'
import { loadStreams } from '@/sync/strava'
import { Actions, Button, Card, CardTitle } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { fmtDayMonth, todayISO } from '@/lib/dates'

const DISMISS_PREFIX = 'ftp_dismiss:'

/** Hook: propozycja nowego FTP z ostatnich jazd z miernikiem (po ostatnim teście), z odrzuceniami z `kv`. */
export function useFtpSuggestion(engine: Engine, acts: StravaActivity[]): FtpSuggestion | null {
  const dismissed = useLiveQuery(async () => (await db.kv.where('key').startsWith(DISMISS_PREFIX).toArray()) as KeyValueRow[], [], [] as KeyValueRow[])
  return useMemo(() => {
    const today = todayISO()
    const tests = engine.ctx.tests ?? []
    const eff = effectiveFtp(today, engine.ctx.settings.ftp_w_estimate, tests)
    const since = eff.source === 'test' ? (eff.test_date ?? null) : null
    const rides = acts.filter((a) => !a.deleted_at && a.is_ride)
    return suggestFtp(rides, eff.ftp, since, new Set(dismissed.map((d) => d.key.slice(DISMISS_PREFIX.length))))
  }, [engine, acts, dismissed])
}

/**
 * „Zaktualizować FTP do X W?” – jedno dotknięcie zapisuje wynik jak test (protokół FTP_TEST, data jazdy),
 * więc strefy obowiązują od następnego dnia (R11). LTHR dokładamy z tej samej jazdy, jeśli wysiłek był progowy.
 */
export function FtpSuggestionCard({ engine, acts }: { engine: Engine; acts: StravaActivity[] }) {
  const toast = useToast()
  const s = useFtpSuggestion(engine, acts)
  // LTHR z próbek tej jazdy – ładowane asynchronicznie, klucz = jazda (nowa propozycja → nowy odczyt)
  const [lthrFor, setLthrFor] = useState<{ ride_id: string; value: { lthr: number; effort_w: number } | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const rideId = s?.ride_id ?? null
  const currentFtp = s?.current_ftp ?? null

  useEffect(() => {
    if (!rideId || !currentFtp) return
    let alive = true
    loadStreams(rideId)
      .then((samples) => {
        if (alive) setLthrFor({ ride_id: rideId, value: samples ? lthrFromRide(samples, currentFtp) : null })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [rideId, currentFtp])

  if (!s) return null
  const lthr = lthrFor?.ride_id === s.ride_id ? lthrFor.value : null

  async function accept() {
    if (!s) return
    setBusy(true)
    try {
      await toast.run(
        'Zapisuję nowe FTP…',
        () =>
          saveTestResult({
            date: s.ride_date,
            protocol: 'FTP_TEST',
            lthr_bpm: lthr?.lthr ?? null,
            avg_power_w: s.effort_w,
            ftp_w: s.ftp,
            notes: `Automatycznie z jazdy „${s.ride_name ?? 'Jazda'}”: najlepsze ${s.basis === '20min' ? '20 min × 0,95' : '60 min'}${lthr ? `, LTHR z drugiej połowy wysiłku` : ''}.`,
          }),
        () => `FTP ${s.ftp} W zapisane – strefy od ${fmtDayMonth(s.ride_date)} + 1 dzień`,
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
      <CardTitle icon="⚡">Zaktualizować FTP do {s.ftp} W?</CardTitle>
      <p className="text-sm">
        Jazda „{s.ride_name ?? 'Jazda'}” z {fmtDayMonth(s.ride_date)}: najlepsze {s.basis === '20min' ? '20 min' : '60 min'} to <b>{s.effort_w} W</b>
        {s.basis === '20min' ? ` (× 0,95 = ${s.ftp} W)` : ''}, czyli {Math.round(((s.ftp - s.current_ftp) / s.current_ftp) * 100)} % więcej niż obecne {s.current_ftp} W.
        {lthr ? ` Tętno z drugiej połowy tego wysiłku: ${lthr.lthr} bpm – zapiszę je jako LTHR.` : ''}
      </p>
      <Actions className="mt-3">
        <Button onClick={accept} disabled={busy}>
          Zapisz jako wynik testu
        </Button>
        <Button variant="ghost" onClick={dismiss} disabled={busy}>
          Nie teraz
        </Button>
      </Actions>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Strefy mocy i tętna zmienią się od następnego dnia (R11). Propozycja pojawia się, gdy jazda przebija FTP o ≥ 3 %.</p>
    </Card>
  )
}
