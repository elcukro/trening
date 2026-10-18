import { useNavigate } from 'react-router'
import { useAuth } from '@/sync/auth'
import { useEngine } from '@/app/useSettings'
import { useOpenFull, useUiMode } from '@/day/useIos'
import { Group, Row, Screen } from '../components/Chrome'

/** Ja – szkielet (krok 1 w docs/24): konto, program i przełączniki wyglądu. Cel, masa, forma i ustawienia – krok 6. */
export function MeScreen() {
  const navigate = useNavigate()
  const ui = useUiMode()
  const openFull = useOpenFull()
  const auth = useAuth()
  const engine = useEngine()

  return (
    <Screen title="Ja" subtitle={auth.session?.user.email ?? 'bez konta'}>
      <Group label="Program">
        <Row title={engine.ctx.program.goal.label} sub={`Wersja ${engine.ctx.program.version}`} />
      </Group>
      <Group label="Wygląd">
        <Row title="Wróć do poprzedniego wyglądu" sub="Uproszczony interfejs (/i) zostaje jako zapas" onClick={() => void ui.set('ios').then(() => navigate('/i'))} />
        <Row title="Otwórz pełną aplikację" sub="Kalendarz, wykresy, biblioteka, ustawienia" onClick={() => openFull('/')} />
      </Group>
      <p className="m-foot m-dim px-1">Nowy wygląd w budowie (docs/24). Cel 30 km/h, masa, forma i ustawienia pojawią się tu w kroku 6.</p>
    </Screen>
  )
}
