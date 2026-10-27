import { addDays, diffDays, type ISODate } from '@/engine/dates'
import { fmtShort } from '@/lib/dates'
import { minutes } from '@/lib/format'
import { t } from '@/i18n'

/**
 * Skrzynka pod dzwonkiem (Dziś i Plan w `/m`): co czeka na zawodnika i co nowego przyszło. Wpisy liczone na bieżąco
 * z danych w aplikacji, nie zapisywane – „Do zrobienia” znika sam, gdy rzecz jest załatwiona, „Nowe” po otwarciu
 * (identyfikatory w kv `inbox_seen`), „Wkrótce” – zapowiedzi (jutrzejsza jazda wieczorem, test za 2–3 dni, rozładowanie
 * od poniedziałku) znikają same, gdy minie ich termin.
 * Czysta funkcja – testy w `__tests__/inbox.test.ts`.
 */

export type InboxKind = 'todo' | 'new' | 'soon'

export interface InboxItem {
  id: string
  kind: InboxKind
  art: string
  title: string
  sub: string | null
  to: string
  /** stan dla `navigate(to, { state })` – np. otwarcie arkusza check-inu na Dziś */
  state?: Record<string, unknown>
}

export interface InboxRide {
  key: string
  date: ISODate
  name: string
  note: string | null
  note_source: 'ai' | 'rules' | null
}

export interface InboxInput {
  today: ISODate
  hour: number
  /** sesja wygasła (konto było, synchronizacja mówi „unauthenticated”) */
  sessionExpired: boolean
  syncError: string | null
  checkedIn: boolean
  weighDue: boolean
  bolt: { kind: string; error?: string }
  /** jazdy z ostatnich dni (dziś i dwa dni wstecz) */
  rides: InboxRide[]
  /** dni, których jazda ma już RPE albo log „pominięta” */
  ratedDates: ReadonlySet<ISODate>
  ftpSuggestion: { ftp: number; ride_id: string; ride_date: ISODate } | null
  /** `false` = brak miejscowości, `undefined` = jeszcze nie wiadomo */
  hasLocation: boolean | undefined
  tests: { id: string; date: ISODate; ftp_w?: number | null; lthr_bpm: number | null }[]
  seen: ReadonlySet<string>
  /** dni od jutra do +7 po nadpisaniach (przeniesienia, zamiany) */
  upcoming: InboxDay[]
  /** dzisiejszy tydzień jest już rozładowaniem – wtedy nie zapowiadamy następnego */
  todayDeload: boolean
  /** prognoza na godzinę jutrzejszej jazdy; `null` = brak (bez miejscowości, bez sieci) */
  tomorrowWeather: InboxWeather | null
  /** tekst programu o tygodniu rozładowania (`rules.deload_note`) */
  deloadNote: string | null
}

export interface InboxDay {
  date: ISODate
  weekday: string
  ride: { name: string; minutes: number } | null
  test: boolean
  deload: boolean
}

export interface InboxWeather {
  label: string
  temp_min_c: number
  temp_max_c: number
  precip_prob: number
  wind_kmh: number
  /** godzina startu z ustawień, np. „18:00” */
  start: string
}

export interface Inbox {
  todo: InboxItem[]
  fresh: InboxItem[]
  soon: InboxItem[]
  /** liczba na plakietce – tylko „Do zrobienia” */
  badge: number
  /** kropka, gdy nie ma nic do zrobienia, ale przyszło coś nowego albo nieotwarta zapowiedź */
  dot: boolean
}

export const RIDE_DAYS = 3
const TEST_DAYS = 7
const CHECKIN_FROM_HOUR = 5
/** zapowiedź jutrzejszej jazdy – wieczorem dzień wcześniej */
const TOMORROW_FROM_HOUR = 17
/** test zapowiadamy 2–3 dni wcześniej (dzień przed nim mówi już zapowiedź jutra) */
const TEST_AHEAD = [2, 3]
/** rozładowanie – w piątek, sobotę i niedzielę przed nim */
const DELOAD_AHEAD = 3
const WIND_NOTE_KMH = 25
const RAIN_NOTE_PCT = 20
const EXCERPT = 90

const ART = {
  coach: '/m/art/coach.png',
  bolt: '/m/art/bolt.png',
  heart: '/m/art/heart.png',
  test: '/m/art/test.png',
  scale: '/m/art/scale.png',
  sun: '/m/art/sun.png',
  cloud: '/m/art/cloud.png',
  wave: '/m/art/coach-wave.png',
  ride: '/m/art/ride-easy.png',
  rest: '/m/art/rest.png',
} as const

function excerpt(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= EXCERPT ? one : `${one.slice(0, EXCERPT).replace(/\s+\S*$/, '')}…`
}

export function buildInbox(inp: InboxInput): Inbox {
  const L = t().day.inbox
  const todo: InboxItem[] = []
  const fresh: InboxItem[] = []
  const since = addDays(inp.today, -(RIDE_DAYS - 1))
  const rides = inp.rides.filter((r) => r.date >= since && r.date <= inp.today).toSorted((a, b) => (a.date < b.date ? 1 : -1))

  if (inp.sessionExpired) todo.push({ id: 'session', kind: 'todo', art: ART.cloud, title: L.sessionTitle, sub: L.sessionSub, to: '/m/ja' })
  else if (inp.syncError) todo.push({ id: 'sync', kind: 'todo', art: ART.cloud, title: L.syncTitle, sub: inp.syncError, to: '/m/ja' })

  if (!inp.checkedIn && inp.hour >= CHECKIN_FROM_HOUR) {
    todo.push({ id: `checkin:${inp.today}`, kind: 'todo', art: inp.weighDue ? ART.scale : ART.wave, title: L.checkinTitle, sub: inp.weighDue ? L.checkinWeigh : L.checkinSub, to: '/m', state: { open: 'checkin' } })
  }

  if (inp.bolt.kind === 'stale' || inp.bolt.kind === 'error') {
    todo.push({ id: `bolt:${inp.today}`, kind: 'todo', art: ART.bolt, title: L.boltTitle, sub: inp.bolt.kind === 'error' ? (inp.bolt.error ?? null) : L.boltStale, to: '/m' })
  }

  // RPE jest na dzień (log jazdy), więc jedna prośba na dzień – z nazwą pierwszej jazdy
  const unrated = new Set<ISODate>()
  for (const r of rides) {
    if (inp.ratedDates.has(r.date) || unrated.has(r.date)) continue
    unrated.add(r.date)
    todo.push({ id: `rpe:${r.date}`, kind: 'todo', art: ART.heart, title: L.rpeTitle, sub: `${r.name} · ${fmtShort(r.date)}`, to: `/m/podsumowanie/${r.date}` })
  }

  if (inp.ftpSuggestion) {
    const s = inp.ftpSuggestion
    todo.push({ id: `ftp:${s.ride_id}:${s.ftp}`, kind: 'todo', art: ART.test, title: L.ftpTitle(s.ftp), sub: L.ftpSub(fmtShort(s.ride_date)), to: '/m/ja' })
  }

  if (inp.hasLocation === false) todo.push({ id: 'weather', kind: 'todo', art: ART.sun, title: L.weatherTitle, sub: L.weatherSub, to: '/m/ja' })

  for (const r of rides) {
    const id = `note:${r.key}`
    if (!r.note || inp.seen.has(id)) continue
    fresh.push({ id, kind: 'new', art: ART.coach, title: r.note_source === 'ai' ? L.noteTitle(r.name) : L.summaryTitle(r.name), sub: `${fmtShort(r.date)} · ${excerpt(r.note)}`, to: `/m/podsumowanie/${r.date}` })
  }

  const testSince = addDays(inp.today, -(TEST_DAYS - 1))
  for (const x of inp.tests.toSorted((a, b) => (a.date < b.date ? 1 : -1))) {
    const id = `test:${x.id}`
    if (x.date < testSince || x.date > inp.today || inp.seen.has(id) || (!x.ftp_w && !x.lthr_bpm)) continue
    const parts = [x.ftp_w ? `FTP ${x.ftp_w} W` : null, x.lthr_bpm ? `LTHR ${x.lthr_bpm} bpm` : null].filter(Boolean).join(' · ')
    fresh.push({ id, kind: 'new', art: ART.test, title: L.testTitle, sub: `${parts} · ${fmtShort(x.date)}`, to: '/m/ja' })
  }

  const soon = upcomingItems(inp)
  const unseenSoon = soon.some((i) => !inp.seen.has(i.id))
  return { todo, fresh, soon, badge: todo.length, dot: todo.length === 0 && (fresh.length > 0 || unseenSoon) }
}

function weatherLine(w: InboxWeather): string {
  const L = t().day.inbox
  const lo = Math.round(w.temp_min_c)
  const hi = Math.round(w.temp_max_c)
  const parts = [`${w.label}, ${lo === hi ? lo : `${lo}–${hi}`} °C`]
  if (w.precip_prob >= RAIN_NOTE_PCT) parts.push(L.rain(Math.round(w.precip_prob)))
  if (w.wind_kmh >= WIND_NOTE_KMH) parts.push(L.wind(Math.round(w.wind_kmh)))
  parts.push(L.start(w.start))
  return parts.join(' · ')
}

function upcomingItems(inp: InboxInput): InboxItem[] {
  const L = t().day.inbox
  const out: InboxItem[] = []
  const tomorrow = addDays(inp.today, 1)
  const t1 = inp.upcoming.find((d) => d.date === tomorrow)
  if (t1?.ride && inp.hour >= TOMORROW_FROM_HOUR) {
    out.push({ id: `tomorrow:${tomorrow}`, kind: 'soon', art: t1.test ? ART.test : ART.ride, title: L.tomorrowTitle(t1.ride.name), sub: [minutes(t1.ride.minutes), inp.tomorrowWeather ? weatherLine(inp.tomorrowWeather) : null].filter(Boolean).join(' · '), to: `/m/dzien/${tomorrow}` })
  }
  const test = inp.upcoming.find((d) => d.test && TEST_AHEAD.includes(diffDays(d.date, inp.today)))
  if (test) out.push({ id: `soon-test:${test.date}`, kind: 'soon', art: ART.test, title: L.testSoonTitle(fmtShort(test.date)), sub: L.testPrep, to: `/m/dzien/${test.date}` })
  const monday = inp.upcoming.find((d) => d.weekday === 'mon')
  if (monday?.deload && !inp.todayDeload && diffDays(monday.date, inp.today) <= DELOAD_AHEAD) {
    out.push({ id: `deload:${monday.date}`, kind: 'soon', art: ART.rest, title: L.deloadTitle, sub: inp.deloadNote ?? L.deloadSub, to: `/m/plan/${monday.date}` })
  }
  return out
}
