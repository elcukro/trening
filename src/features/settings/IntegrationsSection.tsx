import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/sync/auth'
import { useEngine } from '@/app/useSettings'
import { strava, type StravaStatus } from '@/sync/strava'
import { autoPushEnabled, lastAttempt, lastAutoPush, pushPayloadFor, setAutoPush, wahoo, type PushAttempt, type WahooStatus } from '@/sync/wahoo'
import { runSync } from '@/sync/sync'
import { todayISO, fmtDayMonth } from '@/lib/dates'
import { Actions, Button, Card, CardTitle, Checkbox, Inset, Row } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { UserError } from '@/i18n'
import { intlLocale } from '@/i18n/core'
import { useT } from '@/i18n/react'

function useOAuthResult(key: 'strava' | 'wahoo'): string | null {
  const [params, setParams] = useSearchParams()
  const ti = useT().settings.integrations
  const [msg] = useState<string | null>(() => {
    const r = params.get(key)
    if (r === 'ok') return key === 'strava' ? ti.strava.connected(params.get('webhook') ?? '—') : ti.wahoo.connected
    if (r === 'error') return ti.connectError(params.get('reason'))
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
  // zajętość liczona lokalnie: akcja w jednej karcie nie może blokować przycisków w innej
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      setBusy(true)
      try {
        setMsg(await toast.run(`${label}…`, fn, (text) => text))
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )
  return { busy, msg, setMsg, run }
}

export function IntegrationsSection() {
  const auth = useAuth()
  const ti = useT().settings.integrations
  if (!auth.session) {
    return (
      <Card>
        <CardTitle icon="🔗">{ti.title}</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">{ti.signInHint}</p>
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
  const engine = useEngine()
  const t = useT()
  const ti = t.settings.integrations
  const ts = ti.strava
  const canWrite = !!status?.scope?.includes('activity:write')
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
      <Row label={ti.stateLabel}>{status ? (status.connected ? ts.state(status.athlete_id ?? '—') : ts.notConnected) : '…'}</Row>
      {status?.connected && <Row label={ts.imported}>{status.activities}</Row>}
      <Actions className="mt-3">
        {status && !status.connected && (
          <Button
            disabled={busy}
            onClick={() =>
              run(ts.connecting, async () => {
                window.location.assign((await strava.startUrl()).url)
                return ts.redirecting
              })
            }
          >
            {ts.connect}
          </Button>
        )}
        {status?.connected && (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(ts.fetching, async () => {
                  const r = await strava.sync(30)
                  await runSync({ programVersion: engine.ctx.program.version })
                  return ts.fetched(r.imported, r.scanned)
                })
              }
            >
              {ts.fetch30}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => run(ts.checkingWebhook, async () => ts.webhook((await strava.subscribe()).detail))}>
              {ts.checkWebhook}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(ts.disconnecting, async () => {
                  await strava.disconnect()
                  return ts.disconnected
                })
              }
            >
              {ts.disconnect}
            </Button>
          </>
        )}
      </Actions>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{ts.foot}</p>
      {status?.connected && (
        <div className="mt-3">
          <Checkbox
            label={ts.write}
            hint={ts.writeHint(t.common.appName)}
            checked={!!engine.ctx.settings.strava_write}
            onChange={(e) => void engine.settingsApi.update({ strava_write: e.target.checked })}
          />
          {engine.ctx.settings.strava_write && !canWrite && (
            <Inset className="mt-2">
              <p className="text-sm">{ts.noWriteScope}</p>
              <Button
                className="mt-2"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(ts.connecting, async () => {
                    window.location.assign((await strava.startUrl()).url)
                    return ts.redirecting
                  })
                }
              >
                {ts.reconnect}
              </Button>
            </Inset>
          )}
        </div>
      )}
    </Card>
  )
}

function WahooCard() {
  const initial = useOAuthResult('wahoo')
  const engine = useEngine()
  const ti = useT().settings.integrations
  const tw = ti.wahoo
  const { busy, msg, setMsg, run } = useRunner()
  const [status, setStatus] = useState<WahooStatus | null>(null)
  const [auto, setAuto] = useState(true)
  const [last, setLast] = useState<string | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const [attempt, setAttempt] = useState<PushAttempt | null>(null)
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
    void lastAttempt().then((v) => active && setAttempt(v))
    void lastAutoPush().then((v) => active && setLast(v))
    return () => {
      active = false
    }
  }, [msg])

  const today = todayISO()
  const pushes = status?.pushes ?? []
  const sent = pushes.filter((p) => p.status !== 'error')
  const failed = pushes.filter((p) => p.status === 'error')
  const lastPush = pushes.map((p) => p.updated_at).toSorted().at(-1)

  return (
    <Card>
      <CardTitle icon="⌚">{tw.title}</CardTitle>
      <Row label={ti.stateLabel}>{status ? tw.state(status.connected) : '…'}</Row>
      {status?.connected && (status.missing_scopes?.length ?? 0) > 0 && (
        <Inset tone="warn" className="mt-2 text-xs">
          {tw.missingScopes(status!.missing_scopes!.join(', '))}
        </Inset>
      )}
      {status?.connected && <Row label={tw.sent}>{sent.length > 0 ? sent.map((p) => fmtDayMonth(p.date)).join(', ') : tw.none}</Row>}
      {status?.connected && lastPush && <Row label={tw.lastPush}>{new Date(lastPush).toLocaleString(intlLocale(), { timeZone: 'Europe/Warsaw' })}</Row>}
      {attempt && (
        <Row label={tw.lastAttempt}>{tw.attempt(new Date(attempt.at).toLocaleTimeString(intlLocale(), { timeZone: 'Europe/Warsaw' }), attempt.items, attempt.outcome)}</Row>
      )}
      {failed.length > 0 && <p className="text-xs text-red-600 dark:text-red-400">{tw.errors(failed.map((p) => `${fmtDayMonth(p.date)} – ${p.error}`).join('; '))}</p>}
      <Actions className="mt-3">
        {status && (!status.connected || (status.missing_scopes?.length ?? 0) > 0) && (
          <Button
            disabled={busy}
            onClick={() =>
              run(tw.connecting, async () => {
                window.location.assign((await wahoo.startUrl()).url)
                return tw.redirecting
              })
            }
          >
            {status?.connected ? tw.reconnect : tw.connect}
          </Button>
        )}
        {status?.connected && (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(tw.sending7, async () => {
                  const { items, remove } = await pushPayloadFor(today, 7, engine.ctx, engine.weeks)
                  if (items.length === 0) return tw.nothingToSend
                  const r = await wahoo.push(items, 'update', remove)
                  const err = r.results.filter((x) => x.status === 'error')
                  if (r.rate_limited) throw new UserError(tw.rateLimited(r.pushed, items.length))
                  if (err.length) throw new UserError(tw.partial(r.pushed, items.length, err.map((x) => `${fmtDayMonth(x.date)}: ${x.error}`).join('; ')))
                  const unlinked = r.results.filter((x) => x.plan_linked === false)
                  if (unlinked.length) throw new UserError(tw.unlinked(r.pushed, unlinked.map((x) => fmtDayMonth(x.date)).join(', ')))
                  return tw.sentToBolt(r.pushed, r.removed?.length ?? 0)
                })
              }
            >
              {tw.send7}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(tw.resending, async () => {
                  const { items, remove } = await pushPayloadFor(today, 7, engine.ctx, engine.weeks)
                  if (items.length === 0) return tw.nothingToSend
                  const r = await wahoo.push(items, 'replace', remove)
                  const err = r.results.filter((x) => x.status === 'error')
                  if (r.rate_limited) throw new UserError(tw.rateLimitedCreated(r.pushed, items.length))
                  if (err.length) throw new UserError(tw.partial(r.pushed, items.length, err.map((x) => `${fmtDayMonth(x.date)}: ${x.error}`).join('; ')))
                  const unlinked = r.results.filter((x) => x.plan_linked === false)
                  if (unlinked.length) throw new UserError(tw.unlinkedCreated(r.pushed, unlinked.map((x) => fmtDayMonth(x.date)).join(', ')))
                  return tw.resent(r.pushed)
                })
              }
            >
              {tw.resend}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(tw.fetchingDone, async () => {
                  const r = await wahoo.completed(14)
                  await runSync({ programVersion: engine.ctx.program.version })
                  return r.completed ? tw.fetchedDone(r.completed, r.dates.map((d) => fmtDayMonth(d)).join(', ')) : tw.noneDone(r.scanned)
                })
              }
            >
              {tw.fetchDone}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(tw.removingDuplicates, async () => {
                  const r = await wahoo.cleanup()
                  return r.removed.length ? tw.removedDuplicates(r.removed.length, r.scanned) : tw.noDuplicates(r.scanned)
                })
              }
            >
              {tw.removeDuplicates}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(tw.checkingFormat, async () => {
                  const { items } = await pushPayloadFor(today, 7, engine.ctx, engine.weeks)
                  if (items.length === 0) throw new UserError(tw.nothingToCheck)
                  const r = await wahoo.diagnose(items.slice(0, 1))
                  setReport(JSON.stringify(r, null, 1))
                  return tw.reportReady
                })
              }
            >
              {tw.diagnostics}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(tw.disconnecting, async () => {
                  await wahoo.disconnect()
                  return tw.disconnected
                })
              }
            >
              {tw.disconnect}
            </Button>
          </>
        )}
      </Actions>
      {status?.connected && (
        <Checkbox
          label={
            <>
              {tw.auto} {last && <span className="text-xs text-slate-500 dark:text-slate-400">{tw.autoLast(fmtDayMonth(last))}</span>}
            </>
          }
          checked={auto}
          onChange={async (e) => {
            setAuto(e.target.checked)
            await setAutoPush(e.target.checked)
          }}
          className="mt-1"
        />
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      {report && (
        <div className="mt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{tw.report}</span>
            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(report)}>
              {tw.copy}
            </Button>
          </div>
          <pre className="mt-1 max-h-72 overflow-auto rounded-xl bg-slate-900 p-2 text-xs leading-4 text-slate-100">{report}</pre>
        </div>
      )}
      {status && !status.connected && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{tw.redirectHint} <code className="break-all">{status.redirect_uri}</code></p>}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{tw.foot}</p>
    </Card>
  )
}
