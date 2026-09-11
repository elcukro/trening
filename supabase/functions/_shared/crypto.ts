/** Szyfrowanie tokenów (AES-GCM) i podpisywanie stanu OAuth (HMAC) kluczem wyprowadzonym z service role key. */
import { env } from './env.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()

async function keyMaterial(purpose: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', enc.encode(`${purpose}:${env('SUPABASE_SERVICE_ROLE_KEY')}`))
}

async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await keyMaterial('token-enc'), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), enc.encode(plain))
  return `${b64(iv)}.${b64(ct)}`
}

export async function decrypt(packed: string): Promise<string> {
  const [ivB, ctB] = packed.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB!) }, await aesKey(), unb64(ctB!))
  return dec.decode(pt)
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await keyMaterial('hmac'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function sign(payload: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload))
  return `${b64(enc.encode(payload))}.${b64(sig)}`
}

export async function verify(token: string): Promise<string | null> {
  const [p, s] = token.split('.')
  if (!p || !s) return null
  const payload = dec.decode(unb64(p))
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(), unb64(s), enc.encode(payload))
  return ok ? payload : null
}

function hex(buf: ArrayBuffer, bytes: number): string {
  return Array.from(new Uint8Array(buf).slice(0, bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Deterministyczny sekret weryfikacji webhooka Stravy (nie wymaga osobnego sekretu). */
export async function webhookVerifyToken(): Promise<string> {
  return hex(await keyMaterial('strava-webhook-verify'), 16)
}

/**
 * Sekret w ścieżce webhooka. Strava nie podpisuje zdarzeń, a adres funkcji jest publiczny,
 * więc bez tego każdy mógłby wysłać zdarzenie „delete” albo „authorized:false”.
 * Znają go tylko Strava (z zarejestrowanego callback_url) i ta funkcja.
 */
export async function webhookPathSecret(): Promise<string> {
  return hex(await keyMaterial('strava-webhook-path'), 24)
}

/** Porównanie w stałym czasie. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
