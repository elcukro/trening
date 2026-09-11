import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/sync/auth'
import { useEngine } from '@/app/useSettings'
import { strava, type StravaStatus } from '@/sync/strava'
import { autoPushEnabled, lastAutoPush, pushItemsFrom, setAutoPush, wahoo, type WahooStatus } from '@/sync/wahoo'
import { runSync } from '@/sync/sync'
import { loadProgram } from '@/data/program'
import { todayISO, fmtDayMonth } from '@/lib/dates'
import { Button, Card, CardTitle, Row } from '@/components/ui'
import { useToast } from '@/components/Toast'

function useOAuthResult(key: 'strava' | 'wahoo'): string | null {
  const [params, setParams] = useSearchParams()
  const [msg] = useState<string | null>(() => {
    const r = params.get(key)
    if (r === 'ok') return key === 'strava' ? `Połączono ze Stravą. Webhook: ${params.get('webhook') ?? '—'}.` : 'Połączono z Wahoo.'
    if (r === 'error') return `Błąd połączenia: ${params.get('reason') ?? 'nieznany'}.`
    return null
  })
  useEffect(() => {
    if (!params.has(key)) return
    const next = new URLSearchParams(params)
    for (const k of [key, 'webhook', 'reason']) next.delete(k)
    setParams(next, { replace: true })
  }, [params, setParams, key])
  return msg
}

function useRunner() {
  const toast = useToast()
  const [msg, setMsg] = useState<string | null>(null)
  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      const result = await toast.run(`${label}…`, fn, (text) => text)
      setMsg(result)
    },
    [toast],
  )
  return { busy: toast.busy, msg, setMsg, run }
}

export function IntegrationsSection() {
  const auth = useAuth()
  if (!auth.session) {
    return (
      <Card>
        <CardTitle icon="🔗">Integracje</CardTitle>
        <p className="text-sm text-slate-500">Zaloguj się, żeby połączyć Stravę i Wahoo (tokeny są przechowywane tylko na serwerze).</p>
      </Card>
    )
  }
  return (
    <>
      <StravaCard />
      <WahooCard />
    </>
  )
}

function StravaCard() {
  const initial = useOAuthResult('strava')
  const { busy, msg, setMsg, run } = useRunner()
  const [status, setStatus] = useState<StravaStatus | null>(null)
  useEffect(() => {
    if (initial) setMsg(initial)
  }, [initial, setMsg])
  useEffect(() => {
    let active = true
    strava
      .status()
      .then((s) => active && setStatus(s))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [msg])

  return (
    <Card>
      <CardTitle icon="🟠">Strava</CardTitle>
      <Row label="Stan">{status ? (status.connected ? `połączona (atleta ${status.athlete_id})` : 'niepołączona') : '…'}</Row>
      {status?.connected && <Row label="Zaimportowane jazdy">{status.activities}</Row>}
      <div className="mt-2 flex flex-wrap gap-2">
        {status && !status.connected && (
          <Button
            disabled={busy}
            onClick={() =>
              run('Łączę ze Stravą', async () => {
                window.location.assign((await strava.startUrl()).url)
                return 'Przekierowuję do Stravy'
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
                run('Pobieram jazdy ze Stravy', async () => {
                  const r = await strava.sync(14)
                  await runSync({ programVersion: loadProgram().version })
                  return `Pobrano ${r.imported} jazd z ${r.scanned} aktywności (14 dni).`
                })
              }
            >
              Pobierz ostatnie 14 dni
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => run('Sprawdzam webhook', async () => `Webhook: ${(await strava.subscribe()).detail}`)}>
              Sprawdź webhook
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run('Rozłączam Stravę', async () => {
                  await strava.disconnect()
                  return 'Strava rozłączona'
                })
              }
            >
              Rozłącz
            </Button>
          </>
        )}
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      <p className="mt-2 text-xs text-slate-500">Nowe jazdy pojawiają się automatycznie w ciągu kilku minut od wgrania na Stravę.</p>
    </Card>
  )
}

function WahooCard() {
  const initial = useOAuthResult('wahoo')
  const engine = useEngine()
  const { busy, msg, setMsg, run } = useRunner()
  const [status, setStatus] = useState<WahooStatus | null>(null)
  const [auto, setAuto] = useState(true)
  const [last, setLast] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  useEffect(() => {
    if (initial) setMsg(initial)
  }, [initial, setMsg])
  useEffect(() => {
    let active = true
    wahoo
      .status()
      .then((s) => active && setStatus(s))
      .catch(() => undefined)
    void autoPushEnabled().then((v) => active && setAuto(v))
    void lastAutoPush().then((v) => active && setLast(v))
    return () => {
      active = false
    }
  }, [msg])

  const today = todayISO()
  const sent = status?.pushes?.filter((p) => p.status !== 'error') ?? []
  const failed = status?.pushes?.filter((p) => p.status === 'error') ?? []

  return (
    <Card>
      <CardTitle icon="⌚">Wahoo ELEMNT Bolt</CardTitle>
      <Row label="Stan">{status ? (status.connected ? 'połączone' : 'niepołączone') : '…'}</Row>
      {status?.connected && (status.missing_scopes?.length ?? 0) > 0 && (
        <p className="mt-1 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Brakuje uprawnień: {status!.missing_scopes!.join(', ')}. Kliknij „Rozłącz”, a potem „Połącz z Wahoo”, żeby je nadać.
        </p>
      )}
      {status?.connected && <Row label="Wysłane treningi">{sent.length > 0 ? sent.map((p) => fmtDayMonth(p.date)).join(', ') : 'brak'}</Row>}
      {failed.length > 0 && <p className="text-xs text-red-600">Błędy: {failed.map((p) => `${fmtDayMonth(p.date)} – ${p.error}`).join('; ')}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {status && (!status.connected || (status.missing_scopes?.length ?? 0) > 0) && (
          <Button
            disabled={busy}
            onClick={() =>
              run('Łączę z Wahoo', async () => {
                window.location.assign((await wahoo.startUrl()).url)
                return 'Przekierowuję do Wahoo'
              })
            }
          >
            {status?.connected ? 'Połącz ponownie' : 'Połącz z Wahoo'}
          </Button>
        )}
        {status?.connected && (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run('Wysyłam 7 dni na Bolta', async () => {
                  const items = pushItemsFrom(today, 7, engine.ctx, engine.weeks)
                  if (items.length === 0) return 'Na najbliższy tydzień nie ma treningów do wysłania.'
                  const r = await wahoo.push(items)
                  const err = r.results.filter((x) => x.status === 'error')
                  if (err.length) throw new Error(`Wysłano ${r.pushed} z ${items.length}. ${err.map((x) => `${x.date}: ${x.error}`).join('; ')}`)
                  const unlinked = r.results.filter((x) => x.plan_linked === false)
                  if (unlinked.length) throw new Error(`Wysłano ${r.pushed}, ale ${unlinked.length} bez podpiętego planu (${unlinked.map((x) => x.date).join(', ')}).`)
                  return `Wysłano ${r.pushed} treningów na Bolta`
                })
              }
            >
              Wyślij 7 dni
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run('Wysyłam od zera', async () => {
                  const items = pushItemsFrom(today, 7, engine.ctx, engine.weeks)
                  if (items.length === 0) return 'Na najbliższy tydzień nie ma treningów do wysłania.'
                  const r = await wahoo.push(items, 'replace')
                  const err = r.results.filter((x) => x.status === 'error')
                  if (err.length) throw new Error(`Wysłano ${r.pushed} z ${items.length}. ${err.map((x) => `${x.date}: ${x.error}`).join('; ')}`)
                  const unlinked = r.results.filter((x) => x.plan_linked === false)
                  if (unlinked.length) throw new Error(`Utworzono ${r.pushed}, ale ${unlinked.length} bez podpiętego planu (${unlinked.map((x) => x.date).join(', ')}).`)
                  return `Utworzono od nowa ${r.pushed} treningów, plany podpięte`
                })
              }
            >
              Wyślij od zera
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run('Sprawdzam format planu', async () => {
                  const items = pushItemsFrom(today, 7, engine.ctx, engine.weeks)
                  if (items.length === 0) throw new Error('Brak treningu do sprawdzenia.')
                  const r = await wahoo.diagnose(items.slice(0, 1))
                  setReport(JSON.stringify(r, null, 1))
                  return 'Raport gotowy – poniżej'
                })
              }
            >
              Diagnostyka
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run('Rozłączam Wahoo', async () => {
                  await wahoo.disconnect()
                  return 'Wahoo rozłączone'
                })
              }
            >
              Rozłącz
            </Button>
          </>
        )}
      </div>
      {status?.connected && (
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={auto}
            onChange={async (e) => {
              setAuto(e.target.checked)
              await setAutoPush(e.target.checked)
            }}
          />
          Wysyłaj automatycznie raz dziennie {last && <span className="text-xs text-slate-500">(ostatnio {fmtDayMonth(last)})</span>}
        </label>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      {report && (
        <div className="mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Raport diagnostyczny</span>
            <button className="min-h-9 text-xs underline" onClick={() => navigator.clipboard?.writeText(report)}>
              kopiuj
            </button>
          </div>
          <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] leading-tight text-slate-100">{report}</pre>
        </div>
      )}
      {status && !status.connected && <p className="mt-2 text-xs text-slate-500">W portalu Wahoo dodaj adres zwrotny: <code className="break-all">{status.redirect_uri}</code></p>}
      <p className="mt-2 text-xs text-slate-500">Treningi trafiają do „Planned Workouts” na Bolcie po synchronizacji zegarka (Wi-Fi lub aplikacja ELEMNT). „Wyślij od zera” kasuje treningi z Wahoo i tworzy je na nowo – użyj, gdy aplikacja ELEMNT pokazuje nieaktualne dane treningu.</p>
    </Card>
  )
}
