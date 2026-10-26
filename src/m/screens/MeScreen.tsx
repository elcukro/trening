import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, type StravaActivity } from '@/db'
import { useAuth } from '@/sync/auth'
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
import { LocationSheet, NumbersSheet, Switch } from '../components/SettingsSheets'
import { ART } from '../art'
import { IS_IOS_APP } from '@/native'
import { confirmAction } from '@/native'
import { health } from '@/native'
import { HEALTH_BACKFILL_DAYS, setHealthEnabled, syncHealth, useHealthEnabled } from '@/day/useHealth'
import { healthLine } from '@/day/health'

const SYNC_FOOTER: Record<string, string> = {
  // aplikacja iOS nie odsyła do „pełnej aplikacji” (docs/26 § 3 pkt 9)
  idle: IS_IOS_APP ? 'Konto i połączenia są wspólne z trening.felsztukier.pl.' : 'Konto i połączenia są wspólne z pełną aplikacją.',
  syncing: 'Synchronizuję…',
  offline: 'Brak sieci – zapisy czekają w kolejce.',
  unauthenticated: 'Bez logowania aplikacja działa offline: plan i zapisy zostają na telefonie.',
  disabled: 'Aplikacja działa lokalnie – bez Supabase nie ma synchronizacji.',
  error: 'Ostatnia synchronizacja się nie udała.',
}
/** Pomoc to statyczna strona poza routerem – zapisujemy ekran powrotu, bo w WKWebView `document.referrer` bywa pusty. */
function openHelp() {
  try {
    sessionStorage.setItem('trening:pomoc-wroc', window.location.pathname)
  } catch {
    /* brak pamięci sesji – „Wróć” prowadzi na start */
  }
  window.location.assign('/pomoc.html')
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
const linkLabel = (x: StravaStatus | WahooStatus | 'error' | null) => (x === null ? '…' : x === 'error' ? 'brak danych' : x.connected ? 'połączone' : 'brak')

/** Ja (docs/24 § 4): trzy liczby „jak idzie”, ostatnie jazdy, test FTP, potem ustawienia codzienne; reszta w pełnej aplikacji. */
export function MeScreen() {
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
  const [sheet, setSheet] = useState<'numbers' | 'location' | null>(null)
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

  const rides = useLiveQuery(async () => (await db.strava_activities.where('date').between(addDays(today, -28), today, true, true).toArray()).filter((a) => !a.deleted_at && a.is_ride).toSorted((a, b) => (a.start_at < b.start_at ? 1 : -1)).slice(0, 6), [today], [] as StravaActivity[])

  // test FTP: ostatni z wyników, następny z kalendarza programu (znacznik `test`)
  const lastTest = useMemo(() => (engine.ctx.tests ?? []).filter((t) => t.ftp_w || t.lthr_bpm).toSorted((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null, [engine.ctx.tests])
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
    await health.authorize()
    await setHealthEnabled(true)
    const day = await syncHealth(today, HEALTH_BACKFILL_DAYS)
    const line = healthLine(day)
    toast.notify(line ? `Ze Zdrowia: ${line}` : 'Zdrowie nie oddało dziś danych', line ? 'success' : 'info', line ? undefined : 'Sprawdź uprawnienia: Ustawienia → Zdrowie → Dostęp do danych i urządzenia → Trening. Dane pojawią się same, gdy waga albo zegarek je zapiszą.')
  }

  async function togglePush() {
    const on = !!push?.subscribed
    await toast.run(on ? 'Wyłączam powiadomienia…' : 'Włączam powiadomienia…', async () => {
      if (on) await unsubscribePush()
      else await subscribePush('iPhone')
      setPush(await pushStatus())
    }, () => (on ? 'Powiadomienia wyłączone' : 'Powiadomienia włączone'))
  }

  return (
    <Screen title="Ja" subtitle={auth.session?.user.email ?? 'bez konta'}>
      <div className="grid grid-cols-3 gap-3">
        <Tile art={ART.test} value={`${snap.ftp.w}`} unit="W" label={toGoal > 0 ? `do celu ${toGoal} W` : 'cel osiągnięty'} sub={snap.ftp.wPerKg != null ? `${num(snap.ftp.wPerKg, 2)} W/kg` : snap.ftp.source === 'test' ? 'z testu' : 'szacunek'} color="var(--red)" onClick={() => setSheet('numbers')} />
        <Tile art={ART.scale} value={snap.weight.kg != null ? num(snap.weight.kg) : '—'} unit="kg" label={snap.weight.perWeek != null ? `${snap.weight.perWeek > 0 ? '+' : ''}${num(snap.weight.perWeek, 2)} kg/tydz.` : 'bez trendu'} sub={snap.weight.date ? `${fmtDayMonth(snap.weight.date)} · cel ${num(s.body_weight_target_kg, 0)}` : `cel ${num(s.body_weight_target_kg, 0)} kg`} color="var(--accent)" />
        <Tile art={ART.heart} value={form?.text ?? '—'} label={snap.form ? `CTL ${Math.round(snap.form.ctl)}` : 'bez obciążeń'} sub={snap.form ? `TSB ${Math.round(snap.form.tsb)}` : 'z jazd'} color={form?.tone === 'warn' ? 'var(--orange)' : 'var(--green)'} small />
      </div>

      {snap.ftp.suggestion && (
        <div className="m-card flex items-center gap-3 p-3" style={{ background: 'rgb(47 179 83 / 0.12)' }}>
          <img src={ART.test} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="m-sub min-w-0 flex-1">
            FTP może być wyższe: <b>{snap.ftp.suggestion.ftp} W</b> ({snap.ftp.suggestion.basis === '20min' ? 'najlepsze 20 min' : 'pełna godzina'} {snap.ftp.suggestion.effort_w} W, {fmtDayMonth(snap.ftp.suggestion.ride_date)}). {IS_IOS_APP ? 'Zmianę zapiszesz w Progach.' : 'Zmianę zapisz w pełnej aplikacji.'}
          </span>
        </div>
      )}

      <Group label="Test FTP">
        <Row icon={<img src={ART.test} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={lastTest ? `Ostatni: ${fmtDayMonth(lastTest.date)}` : 'Jeszcze bez testu'} sub={lastTest ? [lastTest.ftp_w ? `FTP ${lastTest.ftp_w} W` : null, lastTest.lthr_bpm ? `LTHR ${lastTest.lthr_bpm} bpm` : null].filter(Boolean).join(' · ') : 'Wynik wpiszesz na ekranie dnia testu'} />
        <Row icon={<img src={ART.ride_key} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={nextTest ? `Następny: ${fmtShort(nextTest.date)}` : 'Brak testu w planie'} sub={nextTest ? `${nextTest.bike?.name ?? 'Test'} · ostatnie 2–3 dni przed nim lekko` : undefined} to={nextTest ? `/m/dzien/${nextTest.date}` : undefined} />
      </Group>

      <Group label="Ostatnie jazdy">
        {rides.map((a) => {
          const load = d.loadOf(a)
          return <Row key={a.id} to={`/m/podsumowanie/${a.date}`} icon={<img src={ART.heart} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title={a.name ?? 'Jazda'} sub={`${fmtShort(a.date)} · ${Math.round(a.moving_time_s / 60)} min · ${num((a.distance_m ?? 0) / 1000, 0)} km${a.device_watts && a.np_w ? ` · ${Math.round(a.np_w)} W` : a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ''}`} value={load ? `${Math.round(load.tss)} TSS` : undefined} />
        })}
        {rides.length === 0 && <Row title="Brak jazd z ostatnich 4 tygodni" sub="Jazdy pojawią się po synchronizacji ze Stravą" />}
      </Group>

      <Group label="Ustawienia">
        <Row icon={<img src={ART.bolt} alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title="Progi i miernik" sub={`${s.ftp_w_estimate} W${s.lthr_bpm ? ` · ${s.lthr_bpm} bpm` : ' · brak LTHR'} · ${s.power_meter ? 'z miernikiem mocy' : 'bez miernika'}`} onClick={() => setSheet('numbers')} />
        <Row icon={<img src="/m/art/sun.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />} title="Pogoda" sub={loc ? loc.name : loc === null ? 'Ustaw miejscowość prognozy' : undefined} onClick={() => setSheet('location')} />
        {healthAvail && (
          <div className="m-row">
            <img src={ART.heart} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="min-w-0 flex-1">
              <span className="block">Apple Health</span>
              <span className="m-foot m-dim block">{healthOn ? 'waga, tętno, HRV i sen trafiają do check-inu' : 'waga, tętno, HRV i sen bez wpisywania'}</span>
            </span>
            <Switch on={healthOn} label="Apple Health" onChange={(v) => void toggleHealth(v)} />
          </div>
        )}
        {/* Web Push nie działa w WKWebView – w aplikacji iOS powiadomienia przyjdą z APNs (docs/26, etap 3) */}
        {!IS_IOS_APP && <div className="m-row">
          <img src="/m/art/night.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
          <span className="min-w-0 flex-1">
            <span className="block">Powiadomienia</span>
            <span className="m-foot m-dim block">{push?.supported === false ? 'dodaj aplikację do ekranu początkowego' : 'rano o planie, wieczorem podsumowanie'}</span>
          </span>
          <Switch on={!!push?.subscribed} label="Powiadomienia" disabled={push?.supported === false} onChange={() => void togglePush()} />
        </div>}
      </Group>

      {auth.session && (
        <Group label="E-mail">
          <div className="m-row">
            <span className="flex-1">Poranna odprawa</span>
            <Switch on={!!s.email_morning} label="Poranna odprawa mailem" onChange={(v) => void engine.settingsApi.update({ email_morning: v })} />
          </div>
          <div className="m-row">
            <span className="flex-1">Podsumowanie po treningu</span>
            <Switch on={!!s.email_workout} label="Podsumowanie po treningu mailem" onChange={(v) => void engine.settingsApi.update({ email_workout: v })} />
          </div>
          <div className="m-row">
            <span className="flex-1">List trenera w niedzielę</span>
            <Switch on={!!s.email_weekly} label="List trenera w niedzielę mailem" onChange={(v) => void engine.settingsApi.update({ email_weekly: v })} />
          </div>
        </Group>
      )}

      <Group label="Połączenia">
        {/* łączenie z aplikacji iOS przez ASWebAuthenticationSession to etap 1 (docs/26 § 2) – do tego czasu na stronie */}
        <Row title="Strava" sub={sv !== null && sv !== 'error' && sv.connected ? 'jazdy wpadają same' : IS_IOS_APP ? 'łączenie na trening.felsztukier.pl' : 'łączenie w pełnej aplikacji'} value={linkLabel(sv)} onClick={IS_IOS_APP ? undefined : () => openFull('/wiecej/ustawienia')} />
        <Row title="Wahoo" sub={wh !== null && wh !== 'error' && wh.connected ? 'plany lecą na Bolta' : IS_IOS_APP ? 'łączenie na trening.felsztukier.pl' : 'łączenie w pełnej aplikacji'} value={linkLabel(wh)} onClick={IS_IOS_APP ? undefined : () => openFull('/wiecej/ustawienia')} />
      </Group>

      <Group label="Konto">
        {!auth.configured ? (
          <Row title="Tryb lokalny" sub={`Bez konfiguracji Supabase dane zostają ${IS_IOS_APP ? 'na tym telefonie' : 'w tej przeglądarce'}`} />
        ) : auth.session ? (
          <Row title="Zalogowany" sub={`${auth.session.user.email ?? ''}${sync.last_sync ? ` · synchronizacja ${fmtDayMonth(sync.last_sync.slice(0, 10))}` : ''}${sync.pending > 0 ? ` · czeka ${sync.pending}` : ''}`} />
        ) : (
          <Row title={auth.loading ? 'Sprawdzam konto…' : 'Nie jesteś zalogowany'} sub={auth.loading ? undefined : 'Jazdy, check-iny i zmiany planu nie pobierają się z konta'} onClick={IS_IOS_APP ? backToLogin : () => openFull('/wiecej/ustawienia')} />
        )}
        {auth.session && <Row title={sync.state === 'syncing' ? 'Synchronizuję…' : 'Synchronizuj teraz'} onClick={sync.state === 'syncing' ? undefined : () => void toast.run('Synchronizuję…', () => runSync({ programVersion: engine.ctx.program.version }), () => 'Zsynchronizowano')} />}
        {auth.session && (
          <Row
            title={<span style={{ color: 'var(--red)' }}>Wyloguj</span>}
            chevron={false}
            onClick={async () => {
              // 26.10.2026 przypadkowe dotknięcie po przewinięciu wylogowało konto – akcja nieodwracalna pyta najpierw
              if (!(await confirmAction({ title: 'Wylogować się?', message: 'Dane na tym telefonie zostają.', action: 'Wyloguj' }))) return
              void toast.run(
                'Wylogowuję…',
                async () => {
                  await auth.signOut()
                  await resetSyncCursors()
                },
                () => 'Wylogowano',
              )
            }}
          />
        )}
      </Group>
      <p className="m-foot m-dim px-1">{sync.error ?? SYNC_FOOTER[sync.state]}</p>

      <Group label="Więcej">
        <Row title="Jak korzystać z aplikacji" sub="Instrukcja, działa też bez sieci" onClick={openHelp} />
        {!IS_IOS_APP && <Row title="Otwórz pełną aplikację" sub="Kalendarz, wykresy, biblioteka, sprzęt, kopia, integracje" onClick={() => openFull('/')} />}
        {!IS_IOS_APP && <Row title="Wróć do poprzedniego wyglądu" sub="Uproszczony interfejs (/i) zostaje jako zapas" onClick={() => void ui.set('ios').then(() => navigate('/i'))} />}
      </Group>
      <p className="m-foot m-dim m-num px-1">
        Program {engine.ctx.program.version} · cel FTP {snap.goal.ftp} W{diag ? ` · okno ${diag}` : ''}
      </p>

      {sheet === 'numbers' && <NumbersSheet onClose={() => setSheet(null)} />}
      {sheet === 'location' && <LocationSheet onClose={() => setSheet(null)} />}
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
