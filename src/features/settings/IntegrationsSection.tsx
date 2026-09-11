import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/sync/auth'
import { strava, type StravaStatus } from '@/sync/strava'
import { runSync } from '@/sync/sync'
import { loadProgram } from '@/data/program'
import { Button, Card, CardTitle, Row } from '@/components/ui'

export function IntegrationsSection() {
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<StravaStatus | null>(null)
  const [busy, setBusy] = useState(false)
  // komunikat z powrotu OAuth (?strava=ok|error) – czytany raz przy montowaniu, potem URL czyszczony
  const [msg, setMsg] = useState<string | null>(() => {
    const r = params.get('strava')
    if (r === 'ok') return `Połączono ze Stravą. Webhook: ${params.get('webhook') ?? '—'}.`
    if (r === 'error') return `Błąd połączenia ze Stravą: ${params.get('reason') ?? 'nieznany'}.`
    return null
  })
  const loggedIn = !!auth.session

  useEffect(() => {
    if (!params.has('strava')) return
    const next = new URLSearchParams(params)
    next.delete('strava')
    next.delete('webhook')
    next.delete('reason')
    setParams(next, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (!loggedIn) return
    let active = true
    strava
      .status()
      .then((s) => active && setStatus(s))
      .catch((e) => active && setMsg(String(e instanceof Error ? e.message : e)))
    return () => {
      active = false
    }
  }, [loggedIn, msg])

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(true)
    setMsg(null)
    try {
      setMsg(await fn())
    } catch (e) {
      setMsg(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardTitle icon="🔗">Integracje</CardTitle>
      {!loggedIn ? (
        <p className="text-sm text-slate-500">Zaloguj się, żeby połączyć Stravę (tokeny są przechowywane tylko na serwerze).</p>
      ) : (
        <>
          <Row label="Strava">{status ? (status.connected ? `połączona (atleta ${status.athlete_id})` : 'niepołączona') : '…'}</Row>
          {status?.connected && <Row label="Zaimportowane jazdy">{status.activities}</Row>}
          {status?.connected && status.expires_at && <Row label="Token ważny do">{new Date(status.expires_at).toLocaleString('pl-PL')}</Row>}
          <div className="mt-2 flex flex-wrap gap-2">
            {status && !status.connected && (
              <Button
                disabled={busy}
                onClick={() =>
                  run('Strava', async () => {
                    const { url } = await strava.startUrl()
                    window.location.assign(url)
                    return 'Przekierowuję do Stravy…'
                  })
                }
              >
                Połącz ze Stravą
              </Button>
            )}
            {status?.connected && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    run('Import', async () => {
                      const r = await strava.sync(14)
                      await runSync({ programVersion: loadProgram().version })
                      return `Pobrano ${r.imported} jazd z ${r.scanned} aktywności (14 dni).`
                    })
                  }
                >
                  Pobierz ostatnie 14 dni
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => run('Webhook', async () => `Webhook: ${(await strava.subscribe()).detail}`)}>
                  Sprawdź webhook
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run('Rozłączanie', async () => {
                      await strava.disconnect()
                      return 'Strava rozłączona.'
                    })
                  }
                >
                  Rozłącz
                </Button>
              </>
            )}
          </div>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
          <p className="mt-2 text-xs text-slate-500">Nowe jazdy pojawiają się automatycznie (webhook) w ciągu kilku minut od wgrania na Stravę. Wahoo (Etap 4) – wkrótce.</p>
        </>
      )}
    </Card>
  )
}
