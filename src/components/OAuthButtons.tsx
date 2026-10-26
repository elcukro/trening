import { useEffect, useState } from 'react'
import type { AuthState } from '@/sync/auth'
import { loginProviders, type LoginProviders } from '@/sync/oauth'

/**
 * „Zaloguj się przez Google” i „Zaloguj się przez Stravę” (docs/28) – wspólne dla `/i`, `/m` i pełnej aplikacji.
 * Wygląd wg wytycznych marek: Google – białe tło, szara ramka, kolorowe „G”; Strava – pomarańcz #FC5200 z logo.
 * Przycisk pojawia się dopiero, gdy dostawca działa (Google włączony w Supabase, funkcja `strava-login` wdrożona).
 */
export function OAuthButtons({ auth, returnPath, onError, large }: { auth: AuthState; returnPath: string; onError: (msg: string | null) => void; /** rozmiar przycisków `/m` (50 pt, 17 pt tekstu) */ large?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState<LoginProviders | null>(null)

  useEffect(() => {
    let alive = true
    void loginProviders().then((p) => alive && setReady(p))
    return () => {
      alive = false
    }
  }, [])

  if (!ready || (!ready.google && !ready.strava)) return null

  // bez `toast.run`: logowanie w systemowym oknie może trwać dłużej niż jego limit 60 s (wpisywanie hasła, 2FA);
  // sukces widać po zmianie ekranu, błąd trafia do komunikatu pod przyciskami
  async function go(fn: AuthState['signInWithGoogle']) {
    onError(null)
    setBusy(true)
    try {
      const r = await fn(returnPath)
      if (r.error) onError(r.error)
      if (!r.redirecting) setBusy(false)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const size = large ? 'min-h-[50px] rounded-[14px] text-[17px]' : 'min-h-11 rounded-xl text-[15px]'
  return (
    <div className="space-y-3">
      {ready.google && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void go(auth.signInWithGoogle)}
          className={`flex w-full items-center justify-center gap-3 border border-[#747775] bg-white px-4 py-2.5 font-medium text-[#1f1f1f] active:bg-[#f2f2f2] disabled:opacity-50 ${size}`}
        >
          <GoogleG />
          Zaloguj się przez Google
        </button>
      )}
      {ready.strava && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void go(auth.signInWithStrava)}
          className={`flex w-full items-center justify-center gap-3 bg-[#FC5200] px-4 py-2.5 font-semibold text-white active:bg-[#e04a00] disabled:opacity-50 ${size}`}
        >
          <StravaMark />
          Zaloguj się przez Stravę
        </button>
      )}
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function StravaMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  )
}
