import { useRef, useState } from 'react'
import { useAuth } from '@/sync/auth'
import { useSettings } from '@/app/useSettings'
import { resetSyncCursors, runSync } from '@/sync/sync'
import { db, SYNC_TABLES } from '@/db'
import { Actions, Button, Card, CardTitle, Field, Input, Inset, Row, Textarea } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { OAuthButtons } from '@/components/OAuthButtons'
import { UserError } from '@/i18n'
import { intlLocale } from '@/i18n/core'
import { useT } from '@/i18n/react'

export function AccountSection() {
  const auth = useAuth()
  const { sync, program } = useSettings()
  const toast = useToast()
  const t = useT()
  const ta = t.settings.account
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  // `undefined` = komunikat z adresu powrotu (logowanie Google/Strava, link z maila)
  const [ownMsg, setMsg] = useState<string | null | undefined>(undefined)
  const msg = ownMsg === undefined ? auth.urlError : ownMsg

  async function send() {
    setMsg(null)
    await toast.run(ta.sendingCode, async () => {
      const { error } = await auth.signIn(email)
      if (error) throw new Error(error)
      setSent(true)
      setMsg(ta.mailSentHint)
      return ta.mailSent
    })
  }

  async function useCode() {
    setMsg(null)
    await toast.run(ta.checkingCode, async () => {
      const { error } = await auth.signInWithCode(email, code)
      if (error) throw new Error(error)
      setCode('')
      return ta.signedInToast
    })
  }

  async function useLink() {
    setMsg(null)
    await toast.run(ta.signingInLink, async () => {
      const { error } = await auth.signInWithLink(link)
      if (error) throw new Error(error)
      setLink('')
      return ta.signedInToast
    })
  }

  return (
    <Card>
      <CardTitle icon="☁️">{ta.title}</CardTitle>
      {!auth.configured ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{ta.notConfigured(t.common.appName)}</p>
      ) : auth.session ? (
        <>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
            <Row label={ta.signedIn}>{auth.session.user.email}</Row>
            <Row label={ta.stateLabel}>{ta.state[sync.state] ?? sync.state}</Row>
            {sync.last_sync && <Row label={ta.lastSync}>{new Date(sync.last_sync).toLocaleString(intlLocale())}</Row>}
            <Row label={ta.queued}>{ta.queuedValue(sync.pending)}</Row>
          </div>
          {sync.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{sync.error}</p>}
          <Actions className="mt-3">
            <Button variant="secondary" disabled={toast.busy} onClick={() => toast.run(ta.syncing, () => runSync({ programVersion: program.version }), () => ta.synced)}>
              {ta.syncNow}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                toast.run(
                  ta.signingOut,
                  async () => {
                    await auth.signOut()
                    await resetSyncCursors()
                  },
                  () => ta.signedOut,
                )
              }
            >
              {ta.signOut}
            </Button>
          </Actions>
        </>
      ) : (
        <>
          <div className="mb-3">
            <OAuthButtons auth={auth} returnPath={window.location.pathname} onError={setMsg} />
          </div>
          <Field label={ta.email}>
            <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ta.emailPlaceholder} />
          </Field>
          <Button onClick={send} disabled={!email.includes('@')} className="mt-3 w-full">
            {ta.sendLink}
          </Button>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
          <Inset tone={sent ? 'info' : 'default'} className="mt-3 py-3">
            <Field label={ta.code}>
              <Input className="text-center text-2xl tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="········" />
            </Field>
            <Button onClick={useCode} disabled={code.replace(/\D/g, '').length < 6 || !email.includes('@')} className="mt-3 w-full">
              {ta.signInWithCode}
            </Button>
            {!sent && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{ta.codeHint}</p>}
          </Inset>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{ta.pasteLinkSummary}</summary>
            <Textarea className="text-xs" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://kgllegvlnmchdvkkbitt.supabase.co/auth/v1/verify?token=…" aria-label={ta.linkLabel} />
            <Button variant="secondary" onClick={useLink} disabled={!link.includes('token')} className="mt-3 w-full">
              {ta.signInWithLink}
            </Button>
          </details>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{ta.foot}</p>
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
  const { program } = useSettings()
  const toast = useToast()
  const tt = useT()
  const tb = tt.settings.backup
  const [msg, setMsg] = useState<string | null>(null)

  async function exportJson() {
    const backup: Backup = { app: 'trening', program_version: program.version, exported_at: new Date().toISOString(), settings: (await db.settings.get('user'))?.value ?? {}, tables: {} }
    for (const t of SYNC_TABLES) backup.tables[t] = await db.table(t).toArray()
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' })
    const name = tb.fileName(backup.exported_at.slice(0, 10))
    const file = new File([blob], name, { type: 'application/json' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: tb.shareTitle(tt.common.appName) })
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
      tb.loading,
      async () => {
        const n = await doImport(file)
        setMsg(tb.importedDetail(n))
        return tb.imported(n)
      },
    )
  }

  async function doImport(file: File): Promise<number> {
    {
      const parsed = JSON.parse(await file.text()) as Backup
      if (parsed.app !== 'trening' || !parsed.tables) throw new UserError(tb.notBackup(tt.common.appName))
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
      <CardTitle icon="💾">{tb.title}</CardTitle>
      <Actions>
        <Button variant="secondary" onClick={() => toast.run(tb.preparing, exportJson, () => tb.ready)} className="flex-1">
          {tb.export}
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()} className="flex-1">
          {tb.import}
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </Actions>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{tb.foot}</p>
    </Card>
  )
}
