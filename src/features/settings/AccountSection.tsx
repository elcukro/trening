import { useRef, useState } from 'react'
import { useAuth } from '@/sync/auth'
import { useSyncRunner } from '@/sync/useSync'
import { resetSyncCursors, runSync } from '@/sync/sync'
import { db, SYNC_TABLES } from '@/db'
import { loadProgram } from '@/data/program'
import { Actions, Button, Card, CardTitle, Field, Input, Inset, Row, Textarea } from '@/components/ui'
import { useToast } from '@/components/Toast'

const STATE_LABEL: Record<string, string> = { idle: 'Zsynchronizowano', syncing: 'Synchronizuję…', error: 'Błąd', offline: 'Offline', unauthenticated: 'Niezalogowany', disabled: 'Wyłączona (brak konfiguracji)' }

export function AccountSection() {
  const auth = useAuth()
  const sync = useSyncRunner()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState<string | null>(auth.urlError)

  async function send() {
    setMsg(null)
    await toast.run('Wysyłam kod na maila…', async () => {
      const { error } = await auth.signIn(email)
      if (error) throw new Error(error)
      setSent(true)
      setMsg('Mail wysłany. Wpisz kod z maila poniżej (albo kliknij link, jeśli otwierasz go w tej samej przeglądarce).')
      return 'Mail wysłany'
    })
  }

  async function useCode() {
    setMsg(null)
    await toast.run('Sprawdzam kod…', async () => {
      const { error } = await auth.signInWithCode(email, code)
      if (error) throw new Error(error)
      setCode('')
      return 'Zalogowano'
    })
  }

  async function useLink() {
    setMsg(null)
    await toast.run('Loguję linkiem…', async () => {
      const { error } = await auth.signInWithLink(link)
      if (error) throw new Error(error)
      setLink('')
      return 'Zalogowano'
    })
  }

  return (
    <Card>
      <CardTitle icon="☁️">Konto i synchronizacja</CardTitle>
      {!auth.configured ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Brak konfiguracji Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Aplikacja działa tylko lokalnie – dane są w tej przeglądarce. Instrukcja: docs/09-supabase.md.</p>
      ) : auth.session ? (
        <>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
            <Row label="Zalogowany">{auth.session.user.email}</Row>
            <Row label="Stan">{STATE_LABEL[sync.state] ?? sync.state}</Row>
            {sync.last_sync && <Row label="Ostatnia synchronizacja">{new Date(sync.last_sync).toLocaleString('pl-PL')}</Row>}
            <Row label="W kolejce">{sync.pending} zmian</Row>
          </div>
          {sync.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{sync.error}</p>}
          <Actions className="mt-3">
            <Button variant="secondary" disabled={toast.busy} onClick={() => toast.run('Synchronizuję…', () => runSync({ programVersion: loadProgram().version }), () => 'Zsynchronizowano')}>
              Synchronizuj teraz
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                toast.run(
                  'Wylogowuję…',
                  async () => {
                    await auth.signOut()
                    await resetSyncCursors()
                  },
                  () => 'Wylogowano',
                )
              }
            >
              Wyloguj
            </Button>
          </Actions>
        </>
      ) : (
        <>
          <Field label="E-mail (magic link)">
            <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="twoj@adres.pl" />
          </Field>
          <Button onClick={send} disabled={!email.includes('@')} className="mt-3 w-full">
            Wyślij link logowania
          </Button>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
          <Inset tone={sent ? 'info' : 'default'} className="mt-3 py-3">
            <Field label="Kod z maila (8 cyfr)">
              <Input className="text-center text-2xl tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="········" />
            </Field>
            <Button onClick={useCode} disabled={code.replace(/\D/g, '').length < 6 || !email.includes('@')} className="mt-3 w-full">
              Zaloguj kodem
            </Button>
            {!sent && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Najpierw wyślij mail przyciskiem wyżej, potem przepisz kod z maila. E-mail musi być wpisany.</p>}
          </Inset>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Mam link z maila – wklej go tutaj</summary>
            <Textarea className="text-xs" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://kgllegvlnmchdvkkbitt.supabase.co/auth/v1/verify?token=…" aria-label="Link z maila" />
            <Button variant="secondary" onClick={useLink} disabled={!link.includes('token')} className="mt-3 w-full">
              Zaloguj wklejonym linkiem
            </Button>
          </details>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Kod i link działają raz, przez godzinę. Nie otwieraj podglądu linku w Gmailu – to go zużywa. Bez logowania wszystko działa lokalnie.</p>
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
  const toast = useToast()
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
    await toast.run(
      'Wczytuję kopię…',
      async () => {
        const n = await doImport(file)
        setMsg(`Zaimportowano ${n} rekordów (nowsze lokalne zostały zachowane).`)
        return `Zaimportowano ${n} rekordów`
      },
    )
  }

  async function doImport(file: File): Promise<number> {
    {
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
      return n
    }
  }

  return (
    <Card>
      <CardTitle icon="💾">Kopia zapasowa</CardTitle>
      <Actions>
        <Button variant="secondary" onClick={() => toast.run('Przygotowuję kopię…', exportJson, () => 'Kopia gotowa')} className="flex-1">
          Eksport JSON
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()} className="flex-1">
          Import JSON
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </Actions>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Kopia zawiera ustawienia, check-iny, logi jazd i siłowni oraz wyniki testów. Import scala po dacie zmiany.</p>
    </Card>
  )
}
