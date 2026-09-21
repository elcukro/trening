import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/sync/auth'
import { pushStatus, sendTestPush, subscribePush, unsubscribePush, type PushStatus } from '@/sync/push'
import { useToast } from '@/components/Toast'
import { Actions, Button, Card, CardTitle, Inset, Row } from '@/components/ui'

const KIND_PL: Record<string, string> = { morning: 'plan dnia', evening: 'przypomnienie', event: 'wydarzenie' }

export function PushSection() {
  const auth = useAuth()
  const toast = useToast()
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
        <CardTitle icon="🔔">Powiadomienia</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">Ta przeglądarka nie obsługuje powiadomień.</p>
      </Card>
    )
  }

  const iosNeedsInstall = !status.standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <Card>
      <CardTitle icon="🔔">Powiadomienia</CardTitle>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
        <Row label="To urządzenie">{status.subscribed ? 'zapisane' : 'niezapisane'}</Row>
        {status.devices > 0 && <Row label="Urządzeń łącznie">{status.devices}</Row>}
        <Row label="Zgoda">{status.permission === 'granted' ? 'udzielona' : status.permission === 'denied' ? 'odmówiona' : 'niepytana'}</Row>
      </div>

      {iosNeedsInstall && (
        <Inset tone="warn" className="mt-2 text-xs">
          Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu początkowego. Otwórz stronę w Safari, wybierz Udostępnij, potem „Do ekranu początkowego”, i włącz powiadomienia z ikony.
        </Inset>
      )}
      {status.permission === 'denied' && (
        <Inset tone="error" className="mt-2 text-xs">
          Zgoda została odmówiona. Włącz ją w ustawieniach systemu dla tej aplikacji, inaczej przeglądarka nie zapyta ponownie.
        </Inset>
      )}
      {!auth.session && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Zaloguj się w sekcji Konto, żeby zapisać urządzenie.</p>}

      <Actions className="mt-3">
        {!status.subscribed ? (
          <Button
            disabled={busy || iosNeedsInstall || !auth.session || status.permission === 'denied'}
            onClick={() =>
              run('Włączam powiadomienia', async () => {
                await subscribePush()
                return 'Powiadomienia włączone'
              })
            }
          >
            Włącz powiadomienia
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run('Wysyłam powiadomienie próbne', async () => {
                  const r = await sendTestPush()
                  if (!r.ok) throw new Error(r.detail.join('; ') || 'nie udało się dostarczyć')
                  const extra = r.expired > 0 ? ` (wykreślono ${r.expired} wygasłe urządzenie)` : ''
                  return `Wysłane na ${r.sent} urządz. – sprawdź ekran blokady${extra}`
                })
              }
            >
              Wyślij próbne
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run('Wyłączam powiadomienia', async () => {
                  await unsubscribePush()
                  return 'Powiadomienia wyłączone na tym urządzeniu'
                })
              }
            >
              Wyłącz
            </Button>
          </>
        )}
      </Actions>

      {status.log.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-700/80">
          {status.log.map((l, i) => (
            <li key={i} className="flex justify-between gap-2 py-1 tabular-nums">
              <span className="min-w-0 truncate">
                {KIND_PL[l.kind] ?? l.kind} · {l.date}
              </span>
              <span className={`shrink-0 ${l.failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {l.ok} dostarczonych{l.failed > 0 ? `, ${l.failed} błędów` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Rano plan dnia, wieczorem przypomnienie o odhaczeniu treningu. Godziny ustawia harmonogram na serwerze (7:00 i 20:00 czasu warszawskiego).</p>
    </Card>
  )
}
