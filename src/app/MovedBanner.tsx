import { useState } from 'react'
import { db } from '@/db'
import { runSync } from '@/sync/sync'
import { loadProgram } from '@/data/program'

/** Stary adres aplikacji – od 25.09.2026 serwer przekierowuje go na własną domenę (vercel.json). */
const OLD_HOST = 'trening-inky.vercel.app'
export const NEW_ORIGIN = 'https://trening.felsztukier.pl'

/**
 * Pasek w aplikacji zainstalowanej ze starego adresu: service worker podaje ją z pamięci, więc przekierowanie serwera
 * jej nie dotyczy. Przed przejściem wysyłamy zaległe zmiany – dane lokalne nie przechodzą między domenami.
 */
export function MovedBanner() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (typeof location === 'undefined' || location.host !== OLD_HOST) return null

  async function go() {
    setBusy(true)
    try {
      await runSync({ programVersion: loadProgram().version })
      const pending = await db.outbox.count()
      if (pending > 0) {
        setMsg(`${pending} zmian czeka na wysłanie – połącz się z siecią i zaloguj, inaczej zostaną na tym adresie.`)
        return
      }
      location.href = `${NEW_ORIGIN}${location.pathname}${location.search}`
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="status" className="safe-top relative z-50 bg-sky-600 px-4 py-2 text-sm text-white shadow">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <span className="min-w-0 flex-1">
          Aplikacja ma nowy adres: <b>trening.felsztukier.pl</b>. Zaloguj się tam kodem i dodaj do ekranu początkowego.
          {msg && <span className="mt-0.5 block text-xs">{msg}</span>}
        </span>
        <button onClick={() => void go()} disabled={busy} className="min-h-11 shrink-0 rounded-xl bg-white px-3 font-semibold text-sky-700 disabled:opacity-60">
          {busy ? 'Wysyłam…' : 'Przejdź'}
        </button>
      </div>
    </div>
  )
}
