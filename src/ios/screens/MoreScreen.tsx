import { useEffect, useState } from 'react'
import { useEngine } from '@/app/useSettings'
import { strava, type StravaStatus } from '@/sync/strava'
import { wahoo, type WahooStatus } from '@/sync/wahoo'
import { pushStatus, subscribePush, unsubscribePush, type PushStatus } from '@/sync/push'
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme'
import { useToast } from '@/components/Toast'
import { num } from '@/lib/format'
import { useOpenFull, useUiMode } from '../useIos'
import { Btn, List, Row, RowIcon, Screen, Section, Seg, Sheet } from '../components/Chrome'
import { IconBolt, IconChevron, IconGear, IconHeart, IconSun, IconWatch } from '../components/Icons'

/** Moje liczby: FTP i LTHR – jedyne ustawienia, które zmienia się często (po każdym teście). */
function NumbersSheet({ onClose }: { onClose: () => void }) {
  const engine = useEngine()
  const settings = engine.ctx.settings
  const settingsApi = engine.settingsApi
  const [ftp, setFtp] = useState(String(settings.ftp_w_estimate))
  const [lthr, setLthr] = useState(settings.lthr_bpm != null ? String(settings.lthr_bpm) : '')
  const [power, setPower] = useState(settings.power_meter)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const f = Number(ftp)
      const l = Number(lthr)
      await settingsApi.update({
        ftp_w_estimate: Number.isFinite(f) && f > 0 ? Math.round(f) : settings.ftp_w_estimate,
        lthr_bpm: lthr.trim() && Number.isFinite(l) && l > 0 ? Math.round(l) : null,
        power_meter: power,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Moje liczby" onClose={onClose} done={{ label: 'Zapisz', onClick: save, disabled: busy }}>
      <Section header="Progi" footer="Po teście progowym wpisz tu nowe wartości – strefy mocy i tętna przeliczą się same, a plany na Bolta pojadą z nowymi watami.">
        <List>
          <Row
            title="FTP"
            accessory={
              <span className="flex items-center gap-1">
                <input className="ios-input ios-num w-20 text-right" inputMode="numeric" value={ftp} onChange={(e) => setFtp(e.target.value)} aria-label="FTP w watach" />
                <span className="ios-body ios-dim shrink-0">W</span>
              </span>
            }
          />
          <Row
            title="Tętno progowe"
            accessory={
              <span className="flex items-center gap-1">
                <input className="ios-input ios-num w-20 text-right" inputMode="numeric" placeholder="—" value={lthr} onChange={(e) => setLthr(e.target.value)} aria-label="Tętno progowe" />
                <span className="ios-body ios-dim shrink-0">bpm</span>
              </span>
            }
          />
        </List>
      </Section>
      <Section header="Sprzęt" footer="Z miernikiem plany na Bolcie mają cele w watach, a aplikacja liczy TSS z mocy zamiast z tętna.">
        <List>
          <Row
            title="Mam miernik mocy"
            accessory={
              <button role="switch" aria-checked={power} aria-label="Mam miernik mocy" onClick={() => setPower((v) => !v)} className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors" style={{ background: power ? 'var(--green)' : 'var(--fill-2)' }}>
                <span className="absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-all" style={{ left: power ? 22 : 2 }} />
              </button>
            }
          />
        </List>
      </Section>
    </Sheet>
  )
}

function linkLabel(x: StravaStatus | WahooStatus | 'error' | null): string {
  return x === null ? '…' : x === 'error' ? 'brak danych' : x.connected ? 'połączone' : 'brak'
}

export function MoreScreen() {
  const engine = useEngine()
  const toast = useToast()
  const openFull = useOpenFull()
  const ui = useUiMode()
  const [theme, setTheme] = useState<ThemePref>(getThemePref())
  const [sheet, setSheet] = useState<'numbers' | null>(null)
  const [sv, setSv] = useState<StravaStatus | 'error' | null>(null)
  const [wh, setWh] = useState<WahooStatus | 'error' | null>(null)
  const [push, setPush] = useState<PushStatus | null>(null)

  useEffect(() => {
    let alive = true
    void strava
      .status()
      .then((x) => alive && setSv(x))
      .catch(() => alive && setSv('error'))
    void wahoo
      .status()
      .then((x) => alive && setWh(x))
      .catch(() => alive && setWh('error'))
    void pushStatus()
      .then((x) => alive && setPush(x))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])



  const s = engine.ctx.settings

  async function togglePush() {
    const on = !!push?.subscribed
    await toast.run(on ? 'Wyłączam powiadomienia…' : 'Włączam powiadomienia…', async () => {
      if (on) await unsubscribePush()
      else await subscribePush('iPhone')
      setPush(await pushStatus())
    }, () => (on ? 'Powiadomienia wyłączone' : 'Powiadomienia włączone'))
  }

  return (
    <Screen title="Więcej" subtitle={`Program ${engine.ctx.program.version}`}>
      <Section header="Moje liczby">
        <List>
          <Row
            icon={<RowIcon color="var(--yellow)"><IconBolt size={18} /></RowIcon>}
            title="Progi"
            subtitle={`${s.ftp_w_estimate} W${s.lthr_bpm ? ` · ${s.lthr_bpm} bpm` : ' · brak LTHR'} · ${s.power_meter ? 'z miernikiem mocy' : 'bez miernika'}`}
            onClick={() => setSheet('numbers')}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
          <Row icon={<RowIcon color="var(--indigo)"><IconHeart size={18} /></RowIcon>} title="Waga docelowa" value={`${num(s.body_weight_target_kg, 1)} kg`} />
        </List>
      </Section>

      <Section header="Połączenia" footer="Logowanie, ponowne łączenie i pobieranie historii są w pełnej aplikacji.">
        <List>
          <Row
            icon={<RowIcon color="#FC4C02"><IconHeart size={18} /></RowIcon>}
            title="Strava"
            value={linkLabel(sv)}
            subtitle={sv !== null && sv !== 'error' && sv.connected ? 'jazdy wpadają same' : undefined}
            onClick={() => openFull('/wiecej/ustawienia')}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
          <Row
            icon={<RowIcon color="var(--teal)"><IconWatch size={18} /></RowIcon>}
            title="Wahoo"
            value={linkLabel(wh)}
            subtitle={wh !== null && wh !== 'error' && wh.connected ? 'plany lecą na Bolta' : undefined}
            onClick={() => openFull('/wiecej/ustawienia')}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
          <Row
            icon={<RowIcon color="var(--red)"><IconSun size={18} /></RowIcon>}
            title="Powiadomienia"
            subtitle={push?.supported === false ? 'dodaj aplikację do ekranu początkowego' : 'rano o planie, wieczorem podsumowanie'}
            accessory={
              <button
                role="switch"
                aria-checked={!!push?.subscribed}
                aria-label="Powiadomienia"
                disabled={push?.supported === false}
                onClick={() => void togglePush()}
                className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-40"
                style={{ background: push?.subscribed ? 'var(--green)' : 'var(--fill-2)' }}
              >
                <span className="absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-all" style={{ left: push?.subscribed ? 22 : 2 }} />
              </button>
            }
          />
        </List>
      </Section>

      <Section header="Wygląd">
        <List>
          <div className="ios-row">
            <span className="ios-body flex-1">Motyw</span>
            <span className="w-44">
              <Seg
                label="Motyw"
                value={theme}
                onChange={(v) => {
                  setTheme(v)
                  setThemePref(v)
                }}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Jasny' },
                  { value: 'dark', label: 'Ciemny' },
                ]}
              />
            </span>
          </div>
        </List>
      </Section>

      <Section header="Pełna aplikacja" footer="Kalendarz z przenoszeniem treningów, krzywa mocy, wykres formy, biblioteka ćwiczeń, sprzęt, wyjazd, kopia danych.">
        <List>
          <Row icon={<RowIcon color="var(--label-3)"><IconGear size={18} /></RowIcon>} title="Otwórz pełną aplikację" onClick={() => openFull('/')} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />
        </List>
      </Section>

      <Section footer={ui.mode === 'ios' ? 'Ten widok otwiera się domyślnie. Możesz to wyłączyć – wtedy start trafia do pełnej aplikacji.' : 'Włącz, żeby ten widok otwierał się domyślnie po uruchomieniu.'}>
        <div className="px-4">
          <Btn kind="gray" className="w-full" onClick={() => void ui.set(ui.mode === 'ios' ? 'classic' : 'ios')}>
            {ui.mode === 'ios' ? 'Nie otwieraj domyślnie' : 'Otwieraj ten widok domyślnie'}
          </Btn>
        </div>
      </Section>

      {sheet === 'numbers' && <NumbersSheet onClose={() => setSheet(null)} />}
    </Screen>
  )
}
