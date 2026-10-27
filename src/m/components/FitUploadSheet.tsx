import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type FitRide } from '@/db'
import { useEngine } from '@/app/useSettings'
import { runSync } from '@/sync/sync'
import { deleteFit, uploadFit, type FitUploadResult } from '@/sync/fitUpload'
import { useToast } from '@/components/Toast'
import { friendlyError } from '@/lib/errors'
import { fmtShort } from '@/lib/dates'
import { num } from '@/lib/format'
import { confirmAction, haptic, IS_IOS_APP } from '@/native'
import { Btn, Group, Row, Sheet } from './Chrome'
import { Waiting } from './Waiting'

/**
 * Jazda z pliku FIT (docs/33 § 7a) – dla jazd, które nie przechodzą przez Wahoo (MyWhoosh wysyła tylko na Stravę,
 * a danych Stravy nie wolno dawać trenerowi AI). Kopia z pliku zastępuje w aplikacji jazdę ze Stravy i dostaje notatkę.
 */
export function FitUploadSheet({ onClose, onOpenRide, initialFile, onFileTaken }: { onClose: () => void; onOpenRide: (date: string) => void; initialFile?: File | null; onFileTaken?: () => void }) {
  const engine = useEngine()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<FitUploadResult | null>(null)
  const recent = useLiveQuery(async () => (await db.fit_rides.orderBy('date').reverse().limit(10).toArray()).filter((r) => !r.deleted_at), [], [] as FitRide[])

  // plik z arkusza „Udostępnij” (aplikacja iOS) wgrywa się od razu
  useEffect(() => {
    if (!initialFile) return
    onFileTaken?.()
    void upload(initialFile)
  }, [initialFile])

  async function upload(file: File) {
    setBusy(true)
    setDone(null)
    abort.current = new AbortController()
    try {
      const r = await uploadFit(file, abort.current.signal)
      haptic.success()
      setDone(r)
      // jazda w Dexie przychodzi synchronizacją; notatka trenera – kolejną (powstaje w tle po kilkunastu sekundach)
      await runSync({ programVersion: engine.ctx.program.version }).catch(() => undefined)
    } catch (e) {
      if (abort.current?.signal.aborted) return
      toast.notify('Nie wgrano jazdy', 'error', friendlyError(e).message)
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  async function remove(r: FitRide) {
    const ok = await confirmAction({ title: 'Usunąć wgraną jazdę?', message: `${r.name ?? 'Jazda'} z ${fmtShort(r.date)} zniknie z planu i analiz. Plik możesz wgrać ponownie.`, action: 'Usuń' })
    if (!ok) return
    await toast.run('', () => deleteFit(r.id).then(() => runSync({ programVersion: engine.ctx.program.version })), () => 'Usunięto jazdę', undefined, { quiet: true, errorTitle: 'Nie usunięto jazdy' })
  }

  return (
    <Sheet title="Wgraj jazdę (FIT)" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* bez `accept`: iOS nie zna typu .fit i wyszarzałby plik w Plikach – typ sprawdzamy po nagłówku */}
        <input ref={input} type="file" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void upload(f)
          }} aria-label="Plik FIT" />
        {busy ? (
          <Waiting label="Wgrywam jazdę…" detail="Liczę moc, tętno i strefy z pliku" onCancel={() => abort.current?.abort()} />
        ) : done ? (
          <div className="m-list p-4" role="status">
            <p className="m-title">{done.duplicate ? 'Ta jazda już jest' : 'Jazda wgrana'}</p>
            <p className="m-foot mt-1">
              {done.name} · {fmtShort(done.date)} · {Math.round(done.moving_time_s / 60)} min
            </p>
            <p className="m-foot m-dim mt-2">
              {done.replaces_strava ? 'Zastępuje tę samą jazdę ze Stravy. ' : ''}
              {done.duplicate ? 'Ten plik był już wgrany – nic się nie zdublowało.' : 'Notatka trenera pojawi się za chwilę.'}
            </p>
            <div className="mt-3 flex gap-2">
              <Btn onClick={() => onOpenRide(done.date)} className="flex-1">
                Zobacz jazdę
              </Btn>
              <Btn soft onClick={() => input.current?.click()} className="flex-1">
                Następny plik
              </Btn>
            </div>
          </div>
        ) : (
          <>
            <div className="m-list p-4">
              <p className="m-foot">Dla jazd spoza Wahoo, np. z MyWhoosh. Trener AI nie może czytać danych ze Stravy, a z pliku – tak.</p>
              <p className="m-foot m-dim mt-2">MyWhoosh: mywhoosh.com → Profil → Aktywności → pobierz plik .fit. {IS_IOS_APP ? 'Potem w Plikach albo Safari: Udostępnij → Trening – albo wybierz plik tutaj.' : 'Na iPhonie trafi do aplikacji Pliki.'}</p>
            </div>
            <Btn onClick={() => input.current?.click()} className="w-full">
              Wybierz plik .fit
            </Btn>
          </>
        )}
        {recent.length > 0 && (
          <Group label="Wgrane">
            {recent.map((r) => (
              <Row key={r.id} title={r.name ?? 'Jazda'} sub={`${fmtShort(r.date)} · ${Math.round(r.moving_time_s / 60)} min · ${num(r.distance_m / 1000, 0)} km${r.note ? ' · z notatką' : ''}`} value="Usuń" onClick={() => void remove(r)} />
            ))}
          </Group>
        )}
      </div>
    </Sheet>
  )
}
