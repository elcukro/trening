import { addDays, type ISODate } from '@/engine/dates'
import { fmtShort } from '@/lib/dates'
import { t } from '@/i18n'

/**
 * Skrzynka pod dzwonkiem (Dziś i Plan w `/m`): co czeka na zawodnika i co nowego przyszło. Wpisy liczone na bieżąco
 * z danych w aplikacji, nie zapisywane – „Do zrobienia” znika sam, gdy rzecz jest załatwiona, „Nowe” po otwarciu
 * (identyfikatory w kv `inbox_seen`). Zapowiedzi (jutrzejsza jazda, test za 2–3 dni) – następny krok.
 * Czysta funkcja – testy w `__tests__/inbox.test.ts`.
 */

export type InboxKind = 'todo' | 'new'

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
}

export interface Inbox {
  todo: InboxItem[]
  fresh: InboxItem[]
  /** liczba na plakietce – tylko „Do zrobienia” */
  badge: number
  /** kropka, gdy nie ma nic do zrobienia, ale przyszło coś nowego */
  dot: boolean
}

export const RIDE_DAYS = 3
const TEST_DAYS = 7
const CHECKIN_FROM_HOUR = 5
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

  return { todo, fresh, badge: todo.length, dot: todo.length === 0 && fresh.length > 0 }
}
