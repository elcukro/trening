import { useRef, useState } from 'react'
import { useAuth } from '@/sync/auth'
import { useSyncRunner } from '@/sync/useSync'
import { resetSyncCursors, runSync } from '@/sync/sync'
import { db, SYNC_TABLES } from '@/db'
import { loadProgram } from '@/data/program'
import { Button, Card, CardTitle, Row } from '@/components/ui'

const STATE_LABEL: Record<string, string> = { idle: 'Zsynchronizowano', syncing: 'Synchronizuję…', error: 'Błąd', offline: 'Offline', unauthenticated: 'Niezalogowany', disabled: 'Wyłączona (brak konfiguracji)' }

export function AccountSection() {
  const auth = useAuth()
  const sync = useSyncRunner()
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState<string | null>(auth.urlError)
  const inputCls = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900'

  async function send() {
    setMsg(null)
    const { error } = await auth.signIn(email)
    setSent(!error)
    setMsg(error ?? 'Link wysłany. Na iPhonie z ekranu początkowego: przytrzymaj link w mailu → Kopiuj → wklej poniżej. W przeglądarce wystarczy go kliknąć.')
  }

  async function useLink() {
    setMsg(null)
    const { error } = await auth.signInWithLink(link)
    setMsg(error)
    if (!error) setLink('')
  }

  return (
    <Card>
      <CardTitle icon="☁️">Konto i synchronizacja</CardTitle>
      {!auth.configured ? (
        <p className="text-sm text-slate-500">Brak konfiguracji Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Aplikacja działa tylko lokalnie – dane są w tej przeglądarce. Instrukcja: docs/09-supabase.md.</p>
      ) : auth.session ? (
        <>
          <Row label="Zalogowany">{auth.session.user.email}</Row>
          <Row label="Stan">{STATE_LABEL[sync.state] ?? sync.state}</Row>
          {sync.last_sync && <Row label="Ostatnia synchronizacja">{new Date(sync.last_sync).toLocaleString('pl-PL')}</Row>}
          <Row label="W kolejce">{sync.pending} zmian</Row>
          {sync.error && <p className="mt-1 text-xs text-red-600">{sync.error}</p>}
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => runSync({ programVersion: loadProgram().version })}>
              Synchronizuj teraz
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await auth.signOut()
                await resetSyncCursors()
              }}
            >
              Wyloguj
            </Button>
          </div>
        </>
      ) : (
        <>
          <label className="block">
            <span className="text-xs text-slate-500">E-mail (magic link)</span>
            <input className={inputCls} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="twoj@adres.pl" />
          </label>
          <Button onClick={send} disabled={!email.includes('@')} className="mt-2 w-full">
            Wyślij link logowania
          </Button>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
          <details open={sent} className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Mam link z maila – wklej go tutaj</summary>
            <textarea className={`${inputCls} min-h-20 text-xs`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://kgllegvlnmchdvkkbitt.supabase.co/auth/v1/verify?token=…" />
            <Button variant="secondary" onClick={useLink} disabled={!link.includes('token')} className="mt-2 w-full">
              Zaloguj wklejonym linkiem
            </Button>
          </details>
          <p className="mt-2 text-xs text-slate-500">Każdy link działa tylko raz i wyłącznie w tej przeglądarce/aplikacji, w której go otworzysz. Bez logowania wszystko działa lokalnie.</p>
        </>
      )}
    </Card>
  )
}

interface Backup {
  app: 'trening'
  program_version: string
  exported_at: string
  settings: unknown
  tables: Record<string, unknown[]>
}

export function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function exportJson() {
    const backup: Backup = { app: 'trening', program_version: loadProgram().version, exported_at: new Date().toISOString(), settings: (await db.settings.get('user'))?.value ?? {}, tables: {} }
    for (const t of SYNC_TABLES) backup.tables[t] = await db.table(t).toArray()
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' })
    const name = `trening-kopia-${backup.exported_at.slice(0, 10)}.json`
    const file = new File([blob], name, { type: 'application/json' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Kopia Trening' })
        return
      } catch {
        /* anulowano */
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  async function importJson(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Backup
      if (parsed.app !== 'trening' || !parsed.tables) throw new Error('To nie jest kopia aplikacji Trening.')
      let n = 0
      await db.transaction('rw', [db.settings, db.outbox, ...SYNC_TABLES.map((t) => db.table(t))], async () => {
        if (parsed.settings && typeof parsed.settings === 'object') await db.settings.put({ key: 'user', value: parsed.settings as never, updated_at: new Date().toISOString() })
        for (const t of SYNC_TABLES) {
          for (const row of (parsed.tables[t] ?? []) as { id: string; updated_at: string }[]) {
            const local = (await db.table(t).get(row.id)) as { updated_at: string } | undefined
            if (local && local.updated_at >= row.updated_at) continue
            await db.table(t).put(row)
            await db.outbox.add({ table: t, row_id: row.id, ts: row.updated_at })
            n++
          }
        }
      })
      setMsg(`Zaimportowano ${n} rekordów (nowsze lokalne zostały zachowane).`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Błąd importu.')
    }
  }

  return (
    <Card>
      <CardTitle icon="💾">Kopia zapasowa</CardTitle>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={exportJson} className="flex-1">
          Eksport JSON
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()} className="flex-1">
          Import JSON
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      <p className="mt-2 text-xs text-slate-500">Kopia zawiera ustawienia, check-iny, logi jazd i siłowni oraz wyniki testów. Import scala po dacie zmiany.</p>
    </Card>
  )
}
