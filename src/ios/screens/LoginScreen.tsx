import { useState } from 'react'
import { OTP_LENGTH, type AuthState } from '@/sync/auth'
import { useToast } from '@/components/Toast'
import { OAuthButtons } from '@/components/OAuthButtons'
import { Btn, List, Row, Section } from '../components/Chrome'
import { IconBike, IconChevron } from '../components/Icons'
import { useT } from '@/i18n/react'

/**
 * Ekran logowania: bez konta aplikacja nie ma skąd wziąć jazd, check-inów ani zmian planu,
 * więc zamiast po cichu pokazywać pusty tydzień – prosi o zalogowanie.
 * Google i Strava jednym dotknięciem (docs/28), kod z maila jako zapas – PWA na telefonie ma osobną pamięć niż
 * przeglądarka, więc link z maila może nie trafić tam, gdzie trzeba.
 */
export function LoginScreen({ auth, onSkip }: { auth: AuthState; onSkip: () => void }) {
  const toast = useToast()
  const t = useT()
  const tx = t.ios.login
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [link, setLink] = useState('')
  const [sent, setSent] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  // `undefined` = komunikat z adresu powrotu (błąd logowania Stravą przychodzi po wymianie biletu, już po pierwszym rysunku)
  const [ownMsg, setMsg] = useState<string | null | undefined>(undefined)
  const msg = ownMsg === undefined ? auth.urlError : ownMsg

  async function send() {
    setMsg(null)
    await toast.run(tx.sendingCode, async () => {
      const { error } = await auth.signIn(email)
      if (error) throw new Error(error)
      setSent(true)
      setMsg(tx.checkInbox)
      return tx.mailSent
    })
  }

  async function useCode() {
    setMsg(null)
    await toast.run(tx.checkingCode, async () => {
      const { error } = await auth.signInWithCode(email, code)
      if (error) throw new Error(error)
      return tx.signedIn
    })
  }

  async function useLink() {
    setMsg(null)
    await toast.run(tx.signingInLink, async () => {
      const { error } = await auth.signInWithLink(link)
      if (error) throw new Error(error)
      return tx.signedIn
    })
  }

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <header className="px-4 pt-10 pb-2">
        <span className="ios-icon-tile mb-4 h-12 w-12 rounded-2xl" style={{ background: 'var(--blue)' }}>
          <IconBike size={28} />
        </span>
        <h1 className="ios-large-title">{t.common.appName}</h1>
        <p className="ios-subhead ios-dim mt-1">{tx.subtitle}</p>
      </header>

      <div className="mt-6">
        <div className="px-4 pb-2">
          <OAuthButtons auth={auth} returnPath={window.location.pathname} onError={setMsg} />
        </div>
        <Section header={tx.email} footer={sent ? undefined : tx.emailFooter}>
          <List>
            <div className="ios-row">
              <input
                className="ios-input ios-input-block"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={tx.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label={tx.emailLabel}
              />
            </div>
          </List>
        </Section>

        {sent && !linkMode && (
          <Section header={tx.code} footer={tx.codeFooter}>
            <List>
              <div className="ios-row">
                <input
                  className="ios-input ios-input-block ios-num text-center tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={'0'.repeat(OTP_LENGTH)}
                  maxLength={OTP_LENGTH}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  aria-label={tx.code}
                />
              </div>
            </List>
          </Section>
        )}

        {linkMode && (
          <Section header={tx.link} footer={tx.linkFooter}>
            <List>
              <div className="ios-row">
                <input className="ios-input ios-input-block" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} aria-label={tx.link} />
              </div>
            </List>
          </Section>
        )}

        {msg && (
          <Section>
            <List>
              <Row wrap title={msg} />
            </List>
          </Section>
        )}

        <div className="space-y-3 px-4">
          {linkMode ? (
            <Btn className="w-full" disabled={!link.trim() || toast.busy} onClick={() => void useLink()}>
              {tx.signInLink}
            </Btn>
          ) : sent ? (
            <>
              <Btn className="w-full" disabled={code.length !== OTP_LENGTH || toast.busy} onClick={() => void useCode()}>
                {tx.signIn}
              </Btn>
              <Btn kind="gray" className="w-full" disabled={toast.busy} onClick={() => void send()}>
                {tx.resend}
              </Btn>
            </>
          ) : (
            <Btn className="w-full" disabled={!email.includes('@') || toast.busy} onClick={() => void send()}>
              {tx.sendCode}
            </Btn>
          )}
          <Btn kind="plain" className="w-full" onClick={() => setLinkMode((v) => !v)}>
            {linkMode ? tx.backToCode : tx.haveLink}
          </Btn>
        </div>
      </div>

      <div className="mt-auto px-4 pt-8 pb-6">
        <button className="ios-row w-full justify-center rounded-2xl" style={{ color: 'var(--label-2)' }} onClick={onSkip}>
          <span className="ios-subhead">{tx.skip}</span>
          <IconChevron size={16} />
        </button>
      </div>
    </div>
  )
}
