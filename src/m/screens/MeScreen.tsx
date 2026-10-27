import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { useRides } from '@/app/useRides'
import { useAuth } from '@/sync/auth'
import { helpUrl } from '@/lib/help'
import { useEngine } from '@/app/useSettings'
import { buildCalendar } from '@/engine/calendar'
import { addDays } from '@/engine/dates'
import { getLocation } from '@/sync/weather'
import { strava, type StravaStatus } from '@/sync/strava'
import { wahoo, type WahooStatus } from '@/sync/wahoo'
import { pushStatus, subscribePush, unsubscribePush, type PushStatus } from '@/sync/push'
import { resetSyncCursors, runSync } from '@/sync/sync'
import { useToast } from '@/components/Toast'
import { NO_ACCOUNT, useIosDay, useOpenFull, useSnapshot, useSyncStatus, useUiMode } from '@/day/useIos'
import { formLabel } from '@/day/dayState'
import { fmtDayMonth, fmtShort, todayISO } from '@/lib/dates'
import { num } from '@/lib/format'
import { Group, Row, Screen } from '../components/Chrome'
import { LanguageSheet, LocationSheet, NumbersSheet, Switch, langChoiceLabel } from '../components/SettingsSheets'
import { FitUploadSheet } from '../components/FitUploadSheet'
import { canUploadFit } from '@/sync/fitUpload'
import { useSharedFit } from '../useSharedFit'
import { ART } from '../art'
import { IS_IOS_APP } from '@/native'
import { confirmAction } from '@/native'
import { health } from '@/native'
import { HEALTH_BACKFILL_DAYS, setHealthEnabled, syncHealth, useHealthEnabled } from '@/day/useHealth'
import { healthLine } from '@/day/health'
import { useOnboardingRow } from '@/day/useOnboarding'
import { STEPS, firstIncomplete, stepNumber, type Step } from '@/engine/onboarding'
import type { OnboardingRow } from '@/db'
import { goalSummary } from '../onboarding/labels'
import { WaitArt } from '../components/Waiting'
import { t as tr } from '@/i18n'
import type { LangChoice } from '@/i18n/core'
import { useT } from '@/i18n/react'

/** Domena pełnej aplikacji w przeglądarce – aplikacja iOS odsyła tam po połączenia (identyfikator, nie tłumaczymy). */
const WEB_DOMAIN = 'trening.felsztukier.pl'

/** Stan onboardingu jedną linią: cel po skończeniu, krok przy przerwanym, zachęta przy braku. */
function onboardingSub(row: OnboardingRow | null | undefined): string | undefined {
  const o = tr().m.me.onboarding
  if (row === undefined) return undefined
  if (row && !row.deleted_at && row.status === 'done' && row.data) return goalSummary(row.data.goal) || o.doneFallback
  if (row && !row.deleted_at && row.draft) {
    const at = firstIncomplete(row.draft)
    return at === 'summary' ? o.summaryLeft : o.continueStep(stepNumber(at as Step), STEPS.length)
  }
  return o.prompt
}

/** Stopka pod Kontem wg stanu synchronizacji. */
function syncFooter(state: string): string {
  const f = tr().m.me.syncFooter
  // aplikacja iOS nie odsyła do „pełnej aplikacji” (docs/26 § 3 pkt 9)
  if (state === 'idle') return IS_IOS_APP ? f.idleApp(WEB_DOMAIN) : f.idleWeb
  return state in f.states ? f.states[state as keyof typeof f.states] : ''
}
/** Pomoc to statyczna strona poza routerem – zapisujemy ekran powrotu, bo w WKWebView `document.referrer` bywa pusty. */
function openHelp() {
  try {
    sessionStorage.setItem('trening:pomoc-wroc', window.location.pathname)
  } catch {
    /* brak pamięci sesji – „Wróć” prowadzi na start */
  }
  window.location.assign(helpUrl())
}
/** Aplikacja iOS nie ma ustawień pełnej aplikacji – „Zaloguj” wraca do ekranu logowania `/m` (cofa „bez konta”). */
function backToLogin() {
  try {
    sessionStorage.removeItem(NO_ACCOUNT)
  } catch {
    /* brak pamięci sesji */
  }
  window.location.replace('/m')
}
const linkLabel = (x: StravaStatus | WahooStatus | 'error' | null) => {
  const l = tr().m.me.link
  return x === null ? '…' : x === 'error' ? l.noData : x.connected ? l.connected : l.notConnected
}

/** Ja (docs/24 § 4): trzy liczby „jak idzie”, ostatnie jazdy, test FTP, potem ustawienia codzienne; reszta w pełnej aplikacji. */
export function MeScreen() {
  const t = useT()
  const tm = t.m.me
  const navigate = useNavigate()
  const toast = useToast()
  const ui = useUiMode()
  const openFull = useOpenFull()
  const auth = useAuth()
  const engine = useEngine()
  const sync = useSyncStatus()
  const snap = useSnapshot()
  const today = todayISO()
  const d = useIosDay(today)
  const form = formLabel(snap.form?.tsb ?? null)
  const toGoal = snap.goal.ftp - snap.ftp.w
  const s = engine.ctx.settings
  const [sheet, setSheet] = useState<'numbers' | 'location' | 'language' | 'fit' | null>(null)
  const langChoice: LangChoice = s.language === 'pl' || s.language === 'en' ? s.language : 'system'
  // plik .fit przysłany z innej aplikacji (iOS „Udostępnij”) – od razu do arkusza wgrywania
  const [sharedFit, takeSharedFit] = useSharedFit()
  const onboarding = useOnboardingRow()
  const loc = useLiveQuery(getLocation, [], undefined)
  const [sv, setSv] = useState<StravaStatus | 'error' | null>(null)
  const [wh, setWh] = useState<WahooStatus | 'error' | null>(null)
  const [push, setPush] = useState<PushStatus | null>(null)
  // Apple Health – tylko w aplikacji iOS z HealthKitem (docs/27 § 2)
  const [healthAvail, setHealthAvail] = useState(false)
  const healthOn = useHealthEnabled()
  useEffect(() => {
    void health.available().then(setHealthAvail)
  }, [])
  const [diag, setDiag] = useState('')

  const allRides = useRides(addDays(today, -28), today)
  const rides = useMemo(() => allRides.toReversed().slice(0, 6), [allRides])

  // test FTP: ostatni z wyników, następny z kalendarza programu (znacznik `test`)
  const lastTest = useMemo(() => (engine.ctx.tests ?? []).filter((x) => x.ftp_w || x.lthr_bpm).toSorted((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null, [engine.ctx.tests])
  const nextTest = useMemo(() => buildCalendar(engine.ctx).find((x) => x.date > today && x.flags.includes('test')) ?? null, [engine.ctx, today])

  useEffect(() => {
    let alive = true
    if (auth.session) {
      void strava.status().then((x) => alive && setSv(x)).catch(() => alive && setSv('error'))
      void wahoo.status().then((x) => alive && setWh(x)).catch(() => alive && setWh('error'))
    }
    void pushStatus().then((x) => alive && setPush(x)).catch(() => undefined)
    // pomiar okna (useViewport) tylko w buildzie deweloperskim – w aplikacji to szum (docs/27 § 3.1)
    const read = () => setDiag(document.documentElement.dataset.mViewport ?? '')
    if (import.meta.env.DEV) read()
    const id = import.meta.env.DEV ? window.setInterval(read, 1000) : 0
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [auth.session])

  async function toggleHealth(on: boolean) {
    if (!on) {
      await setHealthEnabled(false)
      return
    }
    // okno uprawnień i 28 dni wstecz – błąd mówi, co się stało, zamiast cichego „nic”
    const day = await toast.run(
      tm.health.connecting,
      async () => {
        await health.authorize()
        await setHealthEnabled(true)
        return syncHealth(today, HEALTH_BACKFILL_DAYS)
      },
      () => '',
      undefined,
      { quiet: true, errorTitle: tm.health.failed },
    )
    if (day === null) return
    const line = healthLine(day)
    toast.notify(line ? t.m.checkin.fromHealthLine(line) : tm.health.noData, line ? 'success' : 'info', line ? undefined : tm.health.noDataHint(t.common.appName))
  }

  async function togglePush() {
    const on = !!push?.subscribed
    await toast.run(on ? tm.push.turningOff : tm.push.turningOn, async () => {
      if (on) await unsubscribePush()
      else await subscribePush('iPhone')
      setPush(await pushStatus())
    }, () => (on ? tm.push.off : tm.push.on))
  }

  return (
    <Screen title={t.m.chrome.tabs.me} subtitle={auth.session?.user.email ?? tm.noAccount}>
      <div className="grid grid-cols-3 gap-3">
        <Tile art={ART.test} value={`${snap.ftp.w}`} unit="W" label={toGoal > 0 ? tm.tiles.toGoal(toGoal) : tm.tiles.goalReached} sub={snap.ftp.wPerKg != null ? `${num(snap.ftp.wPerKg, 2)} W/kg` : snap.ftp.source === 'test' ? tm.tiles.fromTest : tm.tiles.estimate} color="var(--red)" onClick={() => setSheet('numbers')} />
        <Tile art={ART.scale} value={snap.weight.kg != null ? num(snap.weight.kg) : '—'} unit="kg" label={snap.weight.perWeek != null ? tm.tiles.perWeek(`${snap.weight.perWeek > 0 ? '+' : ''}${num(snap.weight.perWeek, 2)}`) : tm.tiles.noTrend} sub={snap.weight.date ? tm.tiles.weightSub(fmtDayMonth(snap.weight.date), num(s.body_weight_target_kg, 0)) : tm.tiles.weightGoal(num(s.body_weight_target_kg, 0))} color="var(--accent)" />
        <Tile art={ART.heart} value={form?.text ?? '—'} label={snap.form ? `CTL ${Math.round(snap.form.ctl)}` : tm.tiles.noLoad} sub={snap.form ? `TSB ${Math.round(snap.form.tsb)}` : tm.tiles.fromRides} color={form?.tone === 'warn' ? 'var(--orange)' : 'var(--green)'} small />
      </div>

      {snap.ftp.suggestion && (
        <div className="m-card flex items-center gap-3 p-3" style={{ background: 'rgb(47 179 83 / 0.12)' }}>
          <img src={ART.test} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="m-sub min-w-0 flex-1">
            {tm.suggestion.lead} <b>{snap.ftp.suggestion.ftp} W</b> ({snap.ftp.suggestion.basis === '20min' ? tm.suggestion.basis20 : tm.suggestion.basis60} {snap.ftp.suggestion.effort_w} W, {fmtDayMonth(snap.ftp.suggestion.ride_date)}). {IS_IOS_APP ? tm.suggestion.saveInThresholds : tm.suggestion.saveInFull}
          </span>
        </div>
      )}

      <Group label={tm.test.group}>
        <Row icon={<img src={ART.test} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={lastTest ? tm.test.last(fmtDayMonth(lastTest.date)) : tm.test.none} sub={lastTest ? [lastTest.ftp_w ? `FTP ${lastTest.ftp_w} W` : null, lastTest.lthr_bpm ? `LTHR ${lastTest.lthr_bpm} bpm` : null].filter(Boolean).join(' · ') : tm.test.enterHint} />
        <Row icon={<img src={ART.ride_key} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={nextTest ? tm.test.next(fmtShort(nextTest.date)) : tm.test.noneInPlan} sub={nextTest ? tm.test.nextSub(nextTest.bike?.name ?? tm.test.fallbackName) : undefined} to={nextTest ? `/m/dzien/${nextTest.date}` : undefined} />
      </Group>

      <Group label={tm.rides.group}>
        {rides.map((a) => {
          const load = d.loadOf(a)
          return <Row key={a.key} to={`/m/podsumowanie/${a.date}`} icon={<img src={ART.heart} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={a.name} sub={`${fmtShort(a.date)} · ${Math.round(a.moving_time_s / 60)} min · ${num(a.distance_m / 1000, 0)} km${a.device_watts && a.np_w ? ` · ${Math.round(a.np_w)} W` : a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ''}`} value={load ? `${Math.round(load.tss)} TSS` : undefined} />
        })}
        {rides.length === 0 && <Row title={tm.rides.none} sub={tm.rides.noneSub} />}
        {canUploadFit && auth.session && <Row icon={<img src={ART.bolt} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={tm.rides.fitUpload} sub={tm.rides.fitUploadSub} onClick={() => setSheet('fit')} />}
      </Group>

      <Group label={tm.goal.group}>
        <Row icon={<img src="/m/art/ob-goal.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={onboarding?.status === 'done' && !onboarding.deleted_at ? tm.goal.change : tm.goal.complete} sub={onboardingSub(onboarding)} to="/m/start" />
      </Group>

      <Group label={tm.settings.group}>
        <Row icon={<img src={ART.bolt} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={t.m.numbers.title} sub={`${s.ftp_w_estimate} W · ${s.lthr_bpm ? `${s.lthr_bpm} bpm` : tm.settings.noLthr} · ${s.power_meter ? tm.settings.withMeter : tm.settings.noMeter}`} onClick={() => setSheet('numbers')} />
        <Row icon={<img src="/m/art/sun.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={t.m.location.title} sub={loc ? loc.name : loc === null ? tm.settings.setPlace : undefined} onClick={() => setSheet('location')} />
        <Row icon={<img src="/m/art/coach-wave.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={t.common.language.title} value={langChoiceLabel(langChoice)} onClick={() => setSheet('language')} />
        {healthAvail && (
          <div className="m-row">
            <img src={ART.heart} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="min-w-0 flex-1">
              <span className="block">Apple Health</span>
              <span className="m-foot m-dim block">{healthOn ? tm.health.on : tm.health.off}</span>
            </span>
            <Switch on={healthOn} label="Apple Health" onChange={(v) => void toggleHealth(v)} />
          </div>
        )}
        {/* Web Push nie działa w WKWebView – w aplikacji iOS powiadomienia przyjdą z APNs (docs/26, etap 3) */}
        {!IS_IOS_APP && <div className="m-row">
          <img src="/m/art/night.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
          <span className="min-w-0 flex-1">
            <span className="block">{tm.push.title}</span>
            <span className="m-foot m-dim block">{push?.supported === false ? tm.push.addToHome : tm.push.sub}</span>
          </span>
          <Switch on={!!push?.subscribed} label={tm.push.title} disabled={push?.supported === false} onChange={() => void togglePush()} />
        </div>}
      </Group>

      {auth.session && (
        <Group label={tm.email.group}>
          <div className="m-row">
            <span className="flex-1">{tm.email.morning}</span>
            <Switch on={!!s.email_morning} label={tm.email.morningAria} onChange={(v) => void engine.settingsApi.update({ email_morning: v })} />
          </div>
          <div className="m-row">
            <span className="flex-1">{tm.email.workout}</span>
            <Switch on={!!s.email_workout} label={tm.email.workoutAria} onChange={(v) => void engine.settingsApi.update({ email_workout: v })} />
          </div>
          <div className="m-row">
            <span className="flex-1">{tm.email.weekly}</span>
            <Switch on={!!s.email_weekly} label={tm.email.weeklyAria} onChange={(v) => void engine.settingsApi.update({ email_weekly: v })} />
          </div>
        </Group>
      )}

      <Group label={tm.connections.group}>
        {/* łączenie z aplikacji iOS przez ASWebAuthenticationSession to etap 1 (docs/26 § 2) – do tego czasu na stronie */}
        <Row title="Strava" sub={sv !== null && sv !== 'error' && sv.connected ? tm.connections.stravaOn : IS_IOS_APP ? tm.connections.connectOnWeb(WEB_DOMAIN) : tm.connections.connectInFull} value={linkLabel(sv)} onClick={IS_IOS_APP ? undefined : () => openFull('/wiecej/ustawienia')} />
        <Row title="Wahoo" sub={wh !== null && wh !== 'error' && wh.connected ? tm.connections.wahooOn : IS_IOS_APP ? tm.connections.connectOnWeb(WEB_DOMAIN) : tm.connections.connectInFull} value={linkLabel(wh)} onClick={IS_IOS_APP ? undefined : () => openFull('/wiecej/ustawienia')} />
      </Group>

      {/* katalog komunikatów (docs/27 § 6) – tylko w buildzie deweloperskim albo podglądowym, do zrzutów z symulatora */}
      {(import.meta.env.DEV || import.meta.env.VITE_FEEDBACK_PREVIEW) && (
        <Group label={tm.preview.group}>
          <Row title={tm.preview.messages} to="/m/czekanie" />
        </Group>
      )}
      <Group label={tm.account.group}>
        {!auth.configured ? (
          <Row title={tm.account.local} sub={tm.account.localSub(IS_IOS_APP)} />
        ) : auth.session ? (
          <Row title={tm.account.signedIn} sub={`${auth.session.user.email ?? ''}${sync.last_sync ? tm.account.lastSync(fmtDayMonth(sync.last_sync.slice(0, 10))) : ''}${sync.pending > 0 ? tm.account.pending(sync.pending) : ''}`} />
        ) : (
          <Row title={auth.loading ? tm.account.checking : tm.account.notSignedIn} sub={auth.loading ? undefined : tm.account.notSignedInSub} onClick={IS_IOS_APP ? backToLogin : () => openFull('/wiecej/ustawienia')} />
        )}
        {/* synchronizacja trwa kilka sekund – animacja w wierszu zamiast komunikatu (docs/27 § 6) */}
        {auth.session && (
          <Row
            title={sync.state === 'syncing' ? tm.syncFooter.states.syncing : tm.account.syncNow}
            value={sync.state === 'syncing' ? <WaitArt size={52} /> : undefined}
            chevron={false}
            onClick={sync.state === 'syncing' ? undefined : () => void toast.run(tm.syncFooter.states.syncing, () => runSync({ programVersion: engine.ctx.program.version }), () => tm.account.synced, undefined, { quiet: true, errorTitle: tm.account.syncFailed })}
          />
        )}
        {auth.session && (
          <Row
            title={<span style={{ color: 'var(--red)' }}>{tm.account.signOut}</span>}
            chevron={false}
            onClick={async () => {
              // 26.10.2026 przypadkowe dotknięcie po przewinięciu wylogowało konto – akcja nieodwracalna pyta najpierw
              if (!(await confirmAction({ title: tm.account.signOutTitle, message: tm.account.signOutMessage, action: tm.account.signOutAction }))) return
              void toast.run(
                tm.account.signingOut,
                async () => {
                  await auth.signOut()
                  await resetSyncCursors()
                },
                () => tm.account.signedOut,
                undefined,
                { quiet: true, errorTitle: tm.account.signOutFailed },
              )
            }}
          />
        )}
      </Group>
      <p className="m-foot m-dim px-1">{sync.error ?? syncFooter(sync.state)}</p>

      <Group label={tm.more.group}>
        <Row title={tm.more.help} sub={tm.more.helpSub} onClick={openHelp} />
        {!IS_IOS_APP && <Row title={tm.more.openFull} sub={tm.more.openFullSub} onClick={() => openFull('/')} />}
        {!IS_IOS_APP && <Row title={tm.more.oldLook} sub={tm.more.oldLookSub} onClick={() => void ui.set('ios').then(() => navigate('/i'))} />}
      </Group>
      <p className="m-foot m-dim m-num px-1">
        {tm.versionLine(t.common.appName, engine.ctx.program.version, snap.goal.ftp)}
        {diag ? ` · okno ${diag}` : ''}
      </p>

      {sheet === 'numbers' && <NumbersSheet onClose={() => setSheet(null)} />}
      {sheet === 'location' && <LocationSheet onClose={() => setSheet(null)} />}
      {sheet === 'language' && <LanguageSheet onClose={() => setSheet(null)} />}
      {(sheet === 'fit' || sharedFit) && (
        <FitUploadSheet
          initialFile={sharedFit}
          onFileTaken={() => {
            setSheet('fit')
            takeSharedFit()
          }}
          onClose={() => setSheet(null)} onOpenRide={(date) => navigate(`/m/podsumowanie/${date}`)}
        />
      )}
    </Screen>
  )
}

function Tile({ art, value, unit, label, sub, color, small, onClick }: { art: string; value: string; unit?: string; label: string; sub: string; color: string; small?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <img src={art} alt="" width={36} height={36} className="h-9 w-9 object-contain" />
      {/* `small` (forma słownie): rozmiar od szerokości kafelka, żeby „Przeciążony” mieścił się w jednej linii także na 375 pt */}
      <div className={`m-num mt-2 leading-tight font-bold ${small ? 'text-[length:min(17px,15.5cqi)]' : 'text-[24px]'}`} style={{ color }}>
        {value}
        {unit && <span className="m-foot m-dim ml-1 font-semibold">{unit}</span>}
      </div>
      <div className="m-foot mt-1 leading-tight">{label}</div>
      <div className="m-foot m-dim leading-tight">{sub}</div>
    </>
  )
  if (onClick)
    return (
      <button className="m-card m-press flex flex-col p-3 text-left [container-type:inline-size]" onClick={onClick}>
        {body}
      </button>
    )
  return <div className="m-card flex flex-col p-3 [container-type:inline-size]">{body}</div>
}
