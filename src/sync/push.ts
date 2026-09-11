import { supabase } from './supabase'

/**
 * Powiadomienia Web Push. Na iOS działają wyłącznie w aplikacji dodanej do ekranu początkowego
 * (iOS 16.4+), a zgodę trzeba odebrać w reakcji na dotknięcie przycisku.
 */

export interface PushStatus {
  supported: boolean
  /** aplikacja uruchomiona z ekranu początkowego (wymagane na iOS) */
  standalone: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
  /** liczba urządzeń zapisanych na serwerze */
  devices: number
  log: { kind: string; date: string; ok: number; failed: number; sent_at: string }[]
}

function b64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function bytesToB64url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  let bin = ''
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Brak konfiguracji Supabase.')
  const { data, error } = await supabase.functions.invoke('push-send', { body: { action, ...extra } })
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) detail = ((await ctx.json()) as { error?: string }).error ?? detail
    } catch {
      /* ignoruj */
    }
    if (detail === 'no_subscriptions') throw new Error('To urządzenie nie jest zapisane do powiadomień.')
    if (detail === 'unauthorized') throw new Error('Zaloguj się w Ustawieniach → Konto.')
    throw new Error(detail)
  }
  return data as T
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.ready
  return reg
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await registration()
  return reg.pushManager.getSubscription()
}

export async function pushStatus(): Promise<PushStatus> {
  const supported = pushSupported()
  const base: PushStatus = {
    supported,
    standalone: isStandalone(),
    permission: supported ? Notification.permission : 'unsupported',
    subscribed: false,
    devices: 0,
    log: [],
  }
  if (!supported) return base
  base.subscribed = !!(await currentSubscription())
  try {
    const server = await call<{ subscriptions: number; log: PushStatus['log'] }>('status')
    base.devices = server.subscriptions
    base.log = server.log
  } catch {
    /* brak sesji – zostaje stan lokalny */
  }
  return base
}

/** Zapisuje to urządzenie do powiadomień. Musi być wywołane z gestu użytkownika. */
export async function subscribePush(label?: string): Promise<void> {
  if (!pushSupported()) throw new Error('Ta przeglądarka nie obsługuje powiadomień.')
  if (!isStandalone() && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
    throw new Error('Na iPhonie dodaj aplikację do ekranu początkowego, a potem włącz powiadomienia z jej poziomu.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Nie wyraziłeś zgody na powiadomienia.')

  const { public_key } = await call<{ public_key: string }>('public_key')
  const reg = await registration()
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(public_key) }))
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const endpoint = json.endpoint ?? sub.endpoint
  if (!supabase) throw new Error('Brak konfiguracji Supabase.')
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) throw new Error('Zaloguj się w Ustawieniach → Konto.')
  const id = bytesToB64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))).slice(0, 32)
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      id,
      user_id: userId,
      endpoint,
      p256dh: json.keys?.p256dh ?? bytesToB64url(sub.getKey('p256dh')),
      auth: json.keys?.auth ?? bytesToB64url(sub.getKey('auth')),
      label: label ?? navigator.platform ?? 'urządzenie',
      deleted_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
}

export async function unsubscribePush(): Promise<void> {
  const sub = await currentSubscription()
  if (sub) {
    const id = bytesToB64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint))).slice(0, 32)
    await supabase?.from('push_subscriptions').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
    await sub.unsubscribe()
  }
}

export async function sendTestPush(): Promise<{ ok: boolean; failed: number; detail: string[] }> {
  return call('test', { title: 'Trening', text: 'Powiadomienia działają. Tak będzie wyglądał plan dnia.' })
}
