import { useState } from 'react'
import type { AuthState } from '@/sync/auth'
import { useToast } from '@/components/Toast'
import { Btn, List, Row, Section } from '../components/Chrome'
import { IconBike, IconChevron } from '../components/Icons'

/**
 * Ekran logowania: bez konta aplikacja nie ma skąd wziąć jazd, check-inów ani zmian planu,
 * więc zamiast po cichu pokazywać pusty tydzień – prosi o zalogowanie.
 * Logowanie kodem z maila, bo PWA na telefonie ma osobną pamięć niż przeglądarka i link może nie trafić tam, gdzie trzeba.
 */
export function LoginScreen({ auth, onSkip }: { auth: AuthState; onSkip: () => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [link, setLink] = useState('')
  const [sent, setSent] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [msg, setMsg] = useState<string | null>(auth.urlError)

  async function send() {
    setMsg(null)
    await toast.run('Wysyłam kod na maila…', async () => {
      const { error } = await auth.signIn(email)
      if (error) throw new Error(error)
      setSent(true)
      setMsg('Sprawdź skrzynkę i wpisz kod z maila.')
      return 'Mail wysłany'
    })
  }

  async function useCode() {
    setMsg(null)
    await toast.run('Sprawdzam kod…', async () => {
      const { error } = await auth.signInWithCode(email, code)
      if (error) throw new Error(error)
      return 'Zalogowano'
    })
  }

  async function useLink() {
    setMsg(null)
    await toast.run('Loguję linkiem…', async () => {
      const { error } = await auth.signInWithLink(link)
      if (error) throw new Error(error)
      return 'Zalogowano'
    })
  }

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <header className="px-4 pt-10 pb-2">
        <span className="ios-icon-tile mb-4 h-12 w-12 rounded-2xl" style={{ background: 'var(--blue)' }}>
          <IconBike size={28} />
        </span>
        <h1 className="ios-large-title">Trening</h1>
        <p className="ios-subhead ios-dim mt-1">Zaloguj się, żeby zobaczyć swoje jazdy, check-iny i zmiany planu. Bez konta widać tylko sam program.</p>
      </header>

      <div className="mt-6">
        <Section header="E-mail" footer={sent ? undefined : 'Wyślemy kod jednorazowy. Hasła nie ma.'}>
          <List>
            <div className="ios-row">
              <input
                className="ios-input ios-input-block"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="adres@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Adres e-mail"
              />
            </div>
          </List>
        </Section>

        {sent && !linkMode && (
          <Section header="Kod z maila" footer="Sześć cyfr. Kod jest jednorazowy i wygasa po godzinie.">
            <List>
              <div className="ios-row">
                <input
                  className="ios-input ios-input-block ios-num text-center tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="Kod z maila"
                />
              </div>
            </List>
          </Section>
        )}

        {linkMode && (
          <Section header="Link z maila" footer="Skopiuj cały adres z maila i wklej tutaj – zadziała też w aplikacji z ekranu początkowego.">
            <List>
              <div className="ios-row">
                <input className="ios-input ios-input-block" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link z maila" />
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
              Zaloguj linkiem
            </Btn>
          ) : sent ? (
            <>
              <Btn className="w-full" disabled={code.trim().length < 4 || toast.busy} onClick={() => void useCode()}>
                Zaloguj
              </Btn>
              <Btn kind="gray" className="w-full" disabled={toast.busy} onClick={() => void send()}>
                Wyślij kod ponownie
              </Btn>
            </>
          ) : (
            <Btn className="w-full" disabled={!email.includes('@') || toast.busy} onClick={() => void send()}>
              Wyślij kod na maila
            </Btn>
          )}
          <Btn kind="plain" className="w-full" onClick={() => setLinkMode((v) => !v)}>
            {linkMode ? 'Wróć do kodu' : 'Mam link z maila'}
          </Btn>
        </div>
      </div>

      <div className="mt-auto px-4 pt-8 pb-6">
        <button className="ios-row w-full justify-center rounded-2xl" style={{ color: 'var(--label-2)' }} onClick={onSkip}>
          <span className="ios-subhead">Zobacz tylko plan, bez konta</span>
          <IconChevron size={16} />
        </button>
      </div>
    </div>
  )
}
