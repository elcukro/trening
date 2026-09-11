import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/sync/auth'
import { pushStatus, sendTestPush, subscribePush, unsubscribePush, type PushStatus } from '@/sync/push'
import { useToast } from '@/components/Toast'
import { Button, Card, CardTitle, Row } from '@/components/ui'

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
        <p className="text-sm text-slate-500">Ta przeglądarka nie obsługuje powiadomień.</p>
      </Card>
    )
  }

  const iosNeedsInstall = !status.standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <Card>
      <CardTitle icon="🔔">Powiadomienia</CardTitle>
      <Row label="To urządzenie">{status.subscribed ? 'zapisane' : 'niezapisane'}</Row>
      {status.devices > 0 && <Row label="Urządzeń łącznie">{status.devices}</Row>}
      <Row label="Zgoda">{status.permission === 'granted' ? 'udzielona' : status.permission === 'denied' ? 'odmówiona' : 'niepytana'}</Row>

      {iosNeedsInstall && (
        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu początkowego. Otwórz stronę w Safari, wybierz Udostępnij, potem „Do ekranu początkowego”, i włącz powiadomienia z ikony.
        </p>
      )}
      {status.permission === 'denied' && (
        <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
          Zgoda została odmówiona. Włącz ją w ustawieniach systemu dla tej aplikacji, inaczej przeglądarka nie zapyta ponownie.
        </p>
      )}
      {!auth.session && <p className="mt-2 text-xs text-slate-500">Zaloguj się w sekcji Konto, żeby zapisać urządzenie.</p>}

      <div className="mt-2 flex flex-wrap gap-2">
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
                  return 'Wysłane – sprawdź ekran blokady'
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
      </div>

      {status.log.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-700">
          {status.log.map((l, i) => (
            <li key={i} className="flex justify-between py-1">
              <span>
                {KIND_PL[l.kind] ?? l.kind} · {l.date}
              </span>
              <span className={l.failed > 0 ? 'text-red-600' : 'text-slate-500'}>
                {l.ok} dostarczonych{l.failed > 0 ? `, ${l.failed} błędów` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">Rano plan dnia, wieczorem przypomnienie o odhaczeniu treningu. Godziny ustawia harmonogram na serwerze (7:00 i 20:00 czasu warszawskiego).</p>
    </Card>
  )
}
