import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEngine } from '@/app/useSettings'
import { geocode, getLocation, setLocation, type WeatherLocation } from '@/sync/weather'
import { strava, type StravaStatus } from '@/sync/strava'
import { wahoo, type WahooStatus } from '@/sync/wahoo'
import { pushStatus, subscribePush, unsubscribePush, type PushStatus } from '@/sync/push'
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme'
import { useToast } from '@/components/Toast'
import { num } from '@/lib/format'
import { useAuth } from '@/sync/auth'
import { resetSyncCursors, runSync } from '@/sync/sync'
import { fmtDayMonth } from '@/lib/dates'
import { helpUrl } from '@/lib/help'
import { useOpenFull, useSyncStatus, useUiMode } from '@/day/useIos'
import { Btn, List, Row, RowIcon, Screen, Section, Seg, Sheet } from '../components/Chrome'
import { IconBolt, IconCheck, IconChevron, IconFlag, IconGear, IconHeart, IconSun, IconWatch } from '../components/Icons'
import { useT } from '@/i18n/react'
import type { Messages } from '@/i18n'

/** Moje liczby: FTP i LTHR – jedyne ustawienia, które zmienia się często (po każdym teście). */
function NumbersSheet({ onClose }: { onClose: () => void }) {
  const engine = useEngine()
  // ten sam błąd co w /m (18.10.2026): przed odpowiedzią Dexie `useSettings` daje domyślne ustawienia programu
  if (!engine.settingsApi.loaded) return null
  return <NumbersSheetLoaded onClose={onClose} />
}

function NumbersSheetLoaded({ onClose }: { onClose: () => void }) {
  const engine = useEngine()
  const settings = engine.ctx.settings
  const settingsApi = engine.settingsApi
  const [ftp, setFtp] = useState(String(settings.ftp_w_estimate))
  const [lthr, setLthr] = useState(settings.lthr_bpm != null ? String(settings.lthr_bpm) : '')
  const [power, setPower] = useState(settings.power_meter)
  const [busy, setBusy] = useState(false)
  const t = useT()
  const tx = t.ios.more.numbers

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
    <Sheet title={tx.title} onClose={onClose} done={{ label: t.common.save, onClick: save, disabled: busy }}>
      <Section header={tx.thresholds} footer={tx.thresholdsFooter}>
        <List>
          <Row
            title="FTP"
            accessory={
              <span className="flex items-center gap-1">
                <input className="ios-input ios-num w-20 text-right" inputMode="numeric" value={ftp} onChange={(e) => setFtp(e.target.value)} aria-label={tx.ftpLabel} />
                <span className="ios-body ios-dim shrink-0">W</span>
              </span>
            }
          />
          <Row
            title={tx.lthr}
            accessory={
              <span className="flex items-center gap-1">
                <input className="ios-input ios-num w-20 text-right" inputMode="numeric" placeholder="—" value={lthr} onChange={(e) => setLthr(e.target.value)} aria-label={tx.lthr} />
                <span className="ios-body ios-dim shrink-0">bpm</span>
              </span>
            }
          />
        </List>
      </Section>
      <Section header={tx.gear} footer={tx.gearFooter}>
        <List>
          <Row
            title={tx.powerMeter}
            accessory={
              <button role="switch" aria-checked={power} aria-label={tx.powerMeter} onClick={() => setPower((v) => !v)} className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors" style={{ background: power ? 'var(--green)' : 'var(--fill-2)' }}>
                <span className="absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-all" style={{ left: power ? 22 : 2 }} />
              </button>
            }
          />
        </List>
      </Section>
    </Sheet>
  )
}

/** Miejscowość prognozy dla odprawy – bez niej odprawa liczy ubiór i jedzenie bez pogody. */
function LocationSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<WeatherLocation[]>([])
  const tx = useT().ios.more.location

  async function search() {
    if (!query.trim()) return
    const r = await toast.run(tx.searching, () => geocode(query), (list) => (list.length ? tx.found(list.length) : tx.notFound))
    setFound(r ?? [])
  }

  return (
    <Sheet title={tx.title} onClose={onClose}>
      <Section header={tx.header} footer={tx.footer}>
        <List>
          <Row
            title={
              <input
                className="ios-input w-full"
                placeholder={tx.placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void search()}
                aria-label={tx.header}
              />
            }
            accessory={
              <Btn small kind="tinted" onClick={() => void search()} disabled={!query.trim()}>
                {tx.search}
              </Btn>
            }
          />
          {found.map((f) => (
            <Row
              key={`${f.lat},${f.lon}`}
              title={f.name}
              onClick={() => {
                void setLocation(f).then(onClose)
              }}
              accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
            />
          ))}
        </List>
      </Section>
    </Sheet>
  )
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors" style={{ background: on ? 'var(--green)' : 'var(--fill-2)' }}>
      <span className="absolute top-0.5 h-7 w-7 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
    </button>
  )
}

function linkLabel(t: Messages, x: StravaStatus | WahooStatus | 'error' | null): string {
  const l = t.ios.more.link
  return x === null ? l.loading : x === 'error' ? l.error : x.connected ? l.connected : l.disconnected
}

export function MoreScreen() {
  const engine = useEngine()
  const toast = useToast()
  const openFull = useOpenFull()
  const navigate = useNavigate()
  const ui = useUiMode()
  const auth = useAuth()
  const sync = useSyncStatus()
  const t = useT()
  const tx = t.ios.more
  const [theme, setTheme] = useState<ThemePref>(getThemePref())
  const [sheet, setSheet] = useState<'numbers' | 'location' | null>(null)
  const loc = useLiveQuery(getLocation, [], undefined)
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
    await toast.run(on ? tx.pushOff : tx.pushOn, async () => {
      if (on) await unsubscribePush()
      else await subscribePush('iPhone')
      setPush(await pushStatus())
    }, () => (on ? tx.pushOffDone : tx.pushOnDone))
  }

  return (
    <Screen title={tx.title} subtitle={tx.program(engine.ctx.program.version)}>
      <Section header={tx.account} footer={sync.error ?? (tx.syncFooter as Record<string, string>)[sync.state]}>
        <List>
          {!auth.configured ? (
            <Row icon={<RowIcon color="var(--label-3)"><IconGear size={18} /></RowIcon>} title={tx.localMode} subtitle={tx.localModeSub} />
          ) : auth.session ? (
            <Row
              icon={<RowIcon color="var(--green)"><IconCheck size={18} /></RowIcon>}
              title={tx.signedIn}
              subtitle={auth.session.user.email ?? undefined}
              value={sync.last_sync ? fmtDayMonth(sync.last_sync.slice(0, 10)) : '—'}
            />
          ) : (
            <Row
              icon={<RowIcon color="var(--red)"><IconGear size={18} /></RowIcon>}
              title={auth.loading ? tx.checkingAccount : tx.notSignedIn}
              subtitle={auth.loading ? undefined : tx.notSignedInSub}
              onClick={() => openFull('/wiecej/ustawienia')}
              accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
            />
          )}
          {sync.pending > 0 && <Row title={tx.pending} value={`${sync.pending}`} />}
          {auth.session && (
            <Row
              icon={<RowIcon color="var(--blue)"><IconBolt size={18} /></RowIcon>}
              title={sync.state === 'syncing' ? tx.syncing : tx.syncNow}
              onClick={sync.state === 'syncing' ? undefined : () => void toast.run(tx.syncing, () => runSync({ programVersion: engine.ctx.program.version }), () => tx.synced)}
              accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
            />
          )}
          {auth.session && (
            <Row
              danger
              title={tx.signOut}
              onClick={() =>
                void toast.run(
                  tx.signingOut,
                  async () => {
                    await auth.signOut()
                    await resetSyncCursors()
                  },
                  () => tx.signedOut,
                )
              }
            />
          )}
        </List>
      </Section>

      <Section header={tx.numbers.title}>
        <List>
          <Row
            icon={<RowIcon color="var(--yellow)"><IconBolt size={18} /></RowIcon>}
            title={tx.numbers.thresholds}
            subtitle={`${s.ftp_w_estimate} W · ${s.lthr_bpm ? `${s.lthr_bpm} bpm` : tx.numbers.noLthr} · ${s.power_meter ? tx.numbers.withMeter : tx.numbers.withoutMeter}`}
            onClick={() => setSheet('numbers')}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
          <Row icon={<RowIcon color="var(--indigo)"><IconHeart size={18} /></RowIcon>} title={tx.numbers.targetWeight} value={`${num(s.body_weight_target_kg, 1)} kg`} />
          <Row
            icon={<RowIcon color="var(--orange)"><IconSun size={18} /></RowIcon>}
            title={tx.location.title}
            subtitle={loc ? loc.name : loc === null ? tx.location.set : undefined}
            onClick={() => setSheet('location')}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
        </List>
      </Section>

      {auth.session && (
        <Section header={tx.email.header} footer={tx.email.footer}>
          <List>
            <Row title={tx.email.morning} accessory={<Switch on={!!s.email_morning} label={tx.email.morningLabel} onChange={(v) => void engine.settingsApi.update({ email_morning: v })} />} />
            <Row title={tx.email.workout} accessory={<Switch on={!!s.email_workout} label={tx.email.workoutLabel} onChange={(v) => void engine.settingsApi.update({ email_workout: v })} />} />
            <Row title={tx.email.weekly} accessory={<Switch on={!!s.email_weekly} label={tx.email.weeklyLabel} onChange={(v) => void engine.settingsApi.update({ email_weekly: v })} />} />
          </List>
        </Section>
      )}

      <Section header={tx.connections} footer={tx.connectionsFooter}>
        <List>
          <Row
            icon={<RowIcon color="#FC4C02"><IconHeart size={18} /></RowIcon>}
            title="Strava"
            value={linkLabel(t, sv)}
            subtitle={sv !== null && sv !== 'error' && sv.connected ? tx.stravaOn : undefined}
            onClick={() => openFull('/wiecej/ustawienia')}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
          <Row
            icon={<RowIcon color="var(--teal)"><IconWatch size={18} /></RowIcon>}
            title="Wahoo"
            value={linkLabel(t, wh)}
            subtitle={wh !== null && wh !== 'error' && wh.connected ? tx.wahooOn : undefined}
            onClick={() => openFull('/wiecej/ustawienia')}
            accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>}
          />
          <Row
            icon={<RowIcon color="var(--red)"><IconSun size={18} /></RowIcon>}
            title={tx.notifications}
            subtitle={push?.supported === false ? tx.notificationsUnsupported : tx.notificationsSub}
            accessory={
              <button
                role="switch"
                aria-checked={!!push?.subscribed}
                aria-label={tx.notifications}
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

      <Section header={tx.appearance}>
        <List>
          <div className="ios-row">
            <span className="ios-body flex-1">{tx.theme}</span>
            <span className="w-44">
              <Seg
                label={tx.theme}
                value={theme}
                onChange={(v) => {
                  setTheme(v)
                  setThemePref(v)
                }}
                options={[
                  { value: 'system', label: tx.themeSystem },
                  { value: 'light', label: tx.themeLight },
                  { value: 'dark', label: tx.themeDark },
                ]}
              />
            </span>
          </div>
        </List>
      </Section>

      <Section header={tx.help} footer={tx.helpFooter}>
        <List>
          <Row icon={<RowIcon color="var(--teal, #30b0c7)"><IconFlag size={18} /></RowIcon>} title={tx.helpRow} onClick={() => window.location.assign(helpUrl())} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />
        </List>
      </Section>

      <Section header={tx.fullApp} footer={tx.fullAppFooter(engine.ctx.program.features.includes('trip'))}>
        <List>
          <Row icon={<RowIcon color="var(--label-3)"><IconGear size={18} /></RowIcon>} title={tx.openFull} onClick={() => openFull('/')} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />
        </List>
      </Section>

      <Section header={tx.newLook} footer={tx.newLookFooter}>
        <List>
          <Row icon={<RowIcon color="var(--blue)"><IconFlag size={18} /></RowIcon>} title={tx.tryNewLook} onClick={() => void ui.set('m').then(() => navigate('/m'))} accessory={<span className="ios-dim-3"><IconChevron size={18} /></span>} />
        </List>
      </Section>

      <Section footer={ui.mode === 'ios' ? tx.defaultIos : ui.mode === 'm' ? tx.defaultM : tx.defaultOther}>
        <div className="px-4">
          <Btn kind="gray" className="w-full" onClick={() => void ui.set(ui.mode === 'ios' ? 'classic' : 'ios')}>
            {ui.mode === 'ios' ? tx.stopDefault : tx.makeDefault}
          </Btn>
        </div>
      </Section>

      {sheet === 'numbers' && <NumbersSheet onClose={() => setSheet(null)} />}
      {sheet === 'location' && <LocationSheet onClose={() => setSheet(null)} />}
    </Screen>
  )
}
