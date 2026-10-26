import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/sync/auth'
import { pushStatus, sendTestPush, subscribePush, unsubscribePush, type PushStatus } from '@/sync/push'
import { useToast } from '@/components/Toast'
import { Actions, Button, Card, CardTitle, Inset, Row } from '@/components/ui'
import { UserError } from '@/i18n'
import { useT } from '@/i18n/react'
import { fmtDayMonth } from '@/lib/dates'

export function PushSection() {
  const auth = useAuth()
  const toast = useToast()
  const tp = useT().settings.push
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    pushStatus()
      .then(setStatus)
      .catch(() => undefined)
  }, [])
  useEffect(refresh, [refresh, auth.session])

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(true)
    try {
      await toast.run(`${label}…`, fn, (t) => t)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null
  if (!status.supported) {
    return (
      <Card>
        <CardTitle icon="🔔">{tp.title}</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">{tp.unsupported}</p>
      </Card>
    )
  }

  const iosNeedsInstall = !status.standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <Card>
      <CardTitle icon="🔔">{tp.title}</CardTitle>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
        <Row label={tp.thisDevice}>{status.subscribed ? tp.subscribed : tp.notSubscribed}</Row>
        {status.devices > 0 && <Row label={tp.devices}>{status.devices}</Row>}
        <Row label={tp.permission}>{status.permission === 'granted' ? tp.granted : status.permission === 'denied' ? tp.denied : tp.notAsked}</Row>
      </div>

      {iosNeedsInstall && (
        <Inset tone="warn" className="mt-2 text-xs">
          {tp.iosInstall}
        </Inset>
      )}
      {status.permission === 'denied' && (
        <Inset tone="error" className="mt-2 text-xs">
          {tp.deniedHint}
        </Inset>
      )}
      {!auth.session && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tp.signInHint}</p>}

      <Actions className="mt-3">
        {!status.subscribed ? (
          <Button
            disabled={busy || iosNeedsInstall || !auth.session || status.permission === 'denied'}
            onClick={() =>
              run(tp.enabling, async () => {
                await subscribePush()
                return tp.enabled
              })
            }
          >
            {tp.enable}
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(tp.sendingTest, async () => {
                  const r = await sendTestPush()
                  if (!r.ok) throw r.detail.length ? new Error(r.detail.join('; ')) : new UserError(tp.notDelivered)
                  return tp.sentTest(r.sent, r.expired)
                })
              }
            >
              {tp.sendTest}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(tp.disabling, async () => {
                  await unsubscribePush()
                  return tp.disabled
                })
              }
            >
              {tp.disable}
            </Button>
          </>
        )}
      </Actions>

      {status.log.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-700/80">
          {status.log.map((l, i) => (
            <li key={i} className="flex justify-between gap-2 py-1 tabular-nums">
              <span className="min-w-0 truncate">
                {tp.kind[l.kind] ?? l.kind} · {/^\d{4}-\d{2}-\d{2}$/.test(l.date) ? fmtDayMonth(l.date) : l.date}
              </span>
              <span className={`shrink-0 ${l.failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {tp.delivered(l.ok, l.failed)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{tp.foot}</p>
    </Card>
  )
}
