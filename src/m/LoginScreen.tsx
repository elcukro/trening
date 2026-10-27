import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AuthState } from '@/sync/auth'
import { OAuthButtons } from '@/components/OAuthButtons'
import { friendlyError } from '@/lib/errors'
import { IS_IOS_APP, haptic } from '@/native'
import { useT } from '@/i18n/react'
import { Btn } from './components/Chrome'
import './login.css'

const CODE_LEN = 6

/**
 * Logowanie w `/m` i aplikacji iOS (docs/27 § 7): ilustracja 3D z trenerem na całą szerokość (fal.ai, styl grafik `/m`),
 * Google i Strava jednym dotknięciem (docs/28), kod z maila jako zapas – sześć pól jak systemowy kod jednorazowy,
 * z podpowiedzią z Poczty (`one-time-code`) i logowaniem po ostatniej cyfrze. Błędy i czekanie na miejscu, bez
 * komunikatów (docs/27 § 6). Link z maila tylko w przeglądarce – aplikacja go nie otworzy do czasu Universal Links.
 * `/i` zostaje przy swoim ekranie (`src/ios/screens/LoginScreen.tsx`).
 */
export function LoginScreen({ auth, onSkip }: { auth: AuthState; onSkip: () => void }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [link, setLink] = useState('')
  // `?kod` w buildzie deweloperskim otwiera krok z kodem – do podglądu bez wysyłania maila
  const [step, setStep] = useState<'email' | 'code' | 'link'>(() => (import.meta.env.DEV && new URLSearchParams(window.location.search).has('kod') ? 'code' : 'email'))
  const [busy, setBusy] = useState<string | null>(null)
  // `undefined` = komunikat z adresu powrotu (błąd logowania Stravą przychodzi po wymianie biletu, już po pierwszym rysunku)
  const [ownError, setError] = useState<string | null | undefined>(undefined)
  const error = ownError === undefined ? auth.urlError : ownError
  const codeInput = useRef<HTMLInputElement>(null)
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim())

  async function attempt(label: string, fn: () => Promise<{ error: string | null }>, onOk?: () => void) {
    setError(null)
    setBusy(label)
    try {
      const { error: e } = await fn()
      if (e) throw new Error(e)
      haptic.success()
      onOk?.()
    } catch (e) {
      haptic.error()
      setError(friendlyError(e).message)
    } finally {
      setBusy(null)
    }
  }

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault()
    if (!validEmail || busy) return
    void attempt(t.login.sendingCode, () => auth.signIn(email.trim()), () => {
      setCode('')
      setStep('code')
    })
  }
  const submitCode = (value = code) => {
    if (value.length < CODE_LEN || busy) return
    void attempt(t.login.signingIn, () => auth.signInWithCode(email.trim(), value), undefined)
  }
  const submitLink = (e?: FormEvent) => {
    e?.preventDefault()
    if (!link.trim() || busy) return
    void attempt(t.login.signingIn, () => auth.signInWithLink(link.trim()))
  }

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus()
  }, [step])

  return (
    <div className="m-login">
      <div className="m-login-hero">
        <img src="/m/art/login-hero.webp" alt="" width={1200} height={780} />
        <button type="button" className="m-login-skip" onClick={onSkip}>
          {t.login.skip}
        </button>
      </div>

      <div className="m-login-body">
        <h1 className="m-login-title">{t.common.appName}</h1>
        <p className="m-login-lead">{t.login.lead}</p>

        {step === 'email' && (
          <>
            <div className="m-login-oauth">
              <OAuthButtons auth={auth} returnPath={window.location.pathname} onError={setError} large />
            </div>
            <p className="m-login-or">
              <span>{t.login.orCode}</span>
            </p>
            <form onSubmit={sendCode} className="flex flex-col gap-3">
              <input
                className="m-login-field"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="send"
                placeholder={t.login.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label={t.login.emailLabel}
              />
              <Btn type="submit" disabled={!validEmail} busy={busy ?? false} className="w-full">
                {t.login.sendCode}
              </Btn>
            </form>
          </>
        )}

        {step === 'code' && (
          <div className="flex flex-col gap-3">
            <p className="m-sub">
              {t.login.codeSentBefore} <b>{email.trim()}</b>
              {t.login.codeSentAfter}{' '}
              <button type="button" className="m-hit font-semibold" style={{ color: 'var(--accent)' }} onClick={() => setStep('email')}>
                {t.common.change}
              </button>
            </p>
            {/* jedno pole (podpowiedź kodu z Poczty, wklejanie) pod sześcioma kafelkami */}
            <label className="m-login-code">
              <input
                ref={codeInput}
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="go"
                maxLength={CODE_LEN}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, CODE_LEN)
                  setCode(v)
                  if (v.length === CODE_LEN) submitCode(v)
                }}
                aria-label={t.login.codeLabel}
              />
              {Array.from({ length: CODE_LEN }, (_, i) => (
                <span key={i} className="m-login-digit" data-active={i === Math.min(code.length, CODE_LEN - 1) || undefined} aria-hidden>
                  {code[i] ?? ''}
                </span>
              ))}
            </label>
            <Btn onClick={() => submitCode()} disabled={code.length < CODE_LEN} busy={busy ?? false} className="w-full">
              {t.login.signIn}
            </Btn>
            <button type="button" className="m-login-link" disabled={!!busy} onClick={() => sendCode()}>
              {t.login.resend}
            </button>
          </div>
        )}

        {step === 'link' && (
          <form onSubmit={submitLink} className="flex flex-col gap-3">
            <input className="m-login-field" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} aria-label={t.login.linkLabel} enterKeyHint="go" />
            <p className="m-foot m-dim px-1">{t.login.linkHint}</p>
            <Btn type="submit" disabled={!link.trim()} busy={busy ?? false} className="w-full">
              {t.login.signInWithLink}
            </Btn>
          </form>
        )}

        {error && (
          <p className="m-login-error" role="alert">
            {error}
          </p>
        )}

        {!IS_IOS_APP && step !== 'code' && (
          <button type="button" className="m-login-link" onClick={() => setStep(step === 'link' ? 'email' : 'link')}>
            {step === 'link' ? t.login.backToCode : t.login.haveLink}
          </button>
        )}

        <p className="m-login-foot">{t.login.noAccountNote}</p>
      </div>
    </div>
  )
}
