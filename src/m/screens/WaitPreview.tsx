import { useAction, useToast } from '@/components/Toast'
import { confirmAction } from '@/native'
import { Btn, Card, Group, Row, Screen } from '../components/Chrome'
import { Waiting, type WaitVariant } from '../components/Waiting'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Katalog informacji zwrotnej `/m` (docs/27 § 6) – ukryta trasa `/m/czekanie` do zrzutów i porównań: warianty animacji
 * oczekiwania, pigułka potwierdzenia, błąd z radą, pasek „Cofnij”, arkusz potwierdzenia i przycisk w toku.
 */
export function WaitPreview() {
  const toast = useToast()
  const slow = useAction()
  const variants: { v: WaitVariant; label: string }[] = [
    { v: 'clip', label: 'C · Klip z fal.ai (wybrany)' },
    { v: 'wheel', label: 'A · Koło i wiatr' },
    { v: 'rider', label: 'B · Rowerzysta (szprychy w CSS)' },
  ]
  return (
    <Screen title="Komunikaty" back="/m/ja">
      <Group label="Stany">
        <Row title="Potwierdzenie" chevron={false} onClick={() => void toast.run('', () => wait(300), () => 'RPE 7 zapisane', undefined, { quiet: true })} />
        <Row title="Błąd sieci z „Ponów”" chevron={false} onClick={() => void toast.run('', () => wait(300).then(() => Promise.reject(new TypeError('Load failed'))), undefined, undefined, { quiet: true, errorTitle: 'Nie wysłano na Bolta' })} />
        <Row title="Zmiana z „Cofnij”" chevron={false} onClick={() => void toast.run('', () => wait(200), () => 'Przeniesione na śr 28.10', () => ({ label: 'Cofnij', onClick: () => toast.notify('Przywrócono plan', 'success') }), { quiet: true })} />
        <Row title="Długa akcja bez stanu na miejscu" chevron={false} onClick={() => void toast.run('Zmieniam plan…', () => wait(2500), () => 'Plan zmieniony')} />
        <Row title="Usuń posiłek…" chevron={false} onClick={() => void confirmAction({ title: 'Usunąć „Owsianka z bananem”?', message: 'Posiłek zniknie z bilansu dnia.', action: 'Usuń posiłek' }).then((ok) => ok && toast.notify('Usunięto: Owsianka z bananem', 'success', undefined, { label: 'Cofnij', onClick: () => {} }))} />
      </Group>
      <Card>
        <Btn soft busy={slow.pending && 'Wysyłam'} onClick={() => void slow.run(() => wait(3000), () => 'Wysłano 7 dni. Zsynchronizuj licznik.')} className="w-full">
          Przycisk w toku (3 s)
        </Btn>
      </Card>
      {variants.map(({ v, label }) => (
        <Card key={v}>
          <p className="m-eyebrow m-dim">{label}</p>
          <Waiting variant={v} label="Wysyłam na Bolta…" detail="Zwykle kilka sekund" />
        </Card>
      ))}
    </Screen>
  )
}
