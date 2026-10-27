import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { IS_IOS_APP, isNative } from './platform'

/** Wtyczka Swift `native/trening-files` – plik .fit z arkusza „Udostępnij” / „Otwórz w” (docs/33 § 7a). */
interface TreningFilesPlugin {
  addListener(event: 'fitFile', cb: (e: { name: string; data?: string; error?: string }) => void): Promise<PluginListenerHandle>
}

const plugin = registerPlugin<TreningFilesPlugin>('TreningFiles')

function fileFromBase64(name: string, b64: string): File {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type: 'application/octet-stream' })
}

/**
 * Pliki .fit wysłane do aplikacji iOS z innej aplikacji (Pliki, Safari, MyWhoosh). Zdarzenie z zimnego startu czeka
 * w wtyczce na pierwszego słuchacza. Błąd bez opisu = `null` (tekst dobiera ekran w języku zawodnika).
 * Zwraca funkcję odpinającą; w przeglądarce nic nie robi.
 */
export function onSharedFit(cb: (r: { file: File } | { name: string; error: string | null }) => void): () => void {
  if (!IS_IOS_APP || !isNative()) return () => undefined
  let handle: PluginListenerHandle | null = null
  let off = false
  void plugin
    .addListener('fitFile', (e) => cb(e.data ? { file: fileFromBase64(e.name, e.data) } : { name: e.name, error: e.error ?? null }))
    .then((h) => (off ? void h.remove() : (handle = h)))
    .catch(() => undefined)
  return () => {
    off = true
    void handle?.remove()
  }
}
