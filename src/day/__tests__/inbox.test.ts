import { describe, expect, it } from 'vitest'
import { buildInbox, type InboxInput } from '../inbox'

const base: InboxInput = {
  today: '2026-10-27',
  hour: 9,
  sessionExpired: false,
  syncError: null,
  checkedIn: true,
  weighDue: false,
  bolt: { kind: 'ok' },
  rides: [],
  ratedDates: new Set(),
  ftpSuggestion: null,
  hasLocation: true,
  tests: [],
  seen: new Set(),
  upcoming: [],
  todayDeload: false,
  tomorrowWeather: null,
  deloadNote: null,
}

const ride = (date: string, key: string, note: string | null = null) => ({ key, date, name: 'Z2', note, note_source: note ? ('ai' as const) : null })
const ids = (inp: Partial<InboxInput>) => {
  const b = buildInbox({ ...base, ...inp })
  return { todo: b.todo.map((i) => i.id), fresh: b.fresh.map((i) => i.id), badge: b.badge, dot: b.dot }
}
const WD = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
/** tydzień od środy 28.10 (dziś wt 27.10) do wt 3.11 */
const week = (over: Record<string, Partial<InboxInput['upcoming'][number]>> = {}) =>
  Array.from({ length: 7 }, (_, i) => {
    const date = `2026-${i < 4 ? '10' : '11'}-${String(i < 4 ? 28 + i : i - 3).padStart(2, '0')}`
    return { date, weekday: WD[(i + 2) % 7]!, ride: { name: 'Z2', minutes: 90 }, test: false, deload: false, ...over[date] }
  })
const soon = (inp: Partial<InboxInput>) => buildInbox({ ...base, ...inp }).soon

describe('skrzynka', () => {
  it('nic do zrobienia i nic nowego → pusto, bez plakietki', () => {
    expect(ids({})).toEqual({ todo: [], fresh: [], badge: 0, dot: false })
  })

  it('RPE: jedna prośba na dzień z jazdą bez oceny, tylko z ostatnich trzech dni', () => {
    const r = ids({ rides: [ride('2026-10-27', 'a'), ride('2026-10-27', 'b'), ride('2026-10-26', 'c'), ride('2026-10-24', 'old')], ratedDates: new Set(['2026-10-26']) })
    expect(r.todo).toEqual(['rpe:2026-10-27'])
    expect(r.badge).toBe(1)
  })

  it('check-in dopiero od rana, z wagą w dzień ważenia; otwiera arkusz na Dziś', () => {
    expect(ids({ checkedIn: false, hour: 4 }).todo).toEqual([])
    const b = buildInbox({ ...base, checkedIn: false, weighDue: true })
    expect(b.todo[0]).toMatchObject({ id: 'checkin:2026-10-27', art: '/m/art/scale.png', to: '/m', state: { open: 'checkin' } })
  })

  it('Bolt tylko przy nieaktualnym planie albo błędzie; brak wysyłki to sprawa automatu', () => {
    expect(ids({ bolt: { kind: 'missing' } }).todo).toEqual([])
    expect(ids({ bolt: { kind: 'stale' } }).todo).toEqual(['bolt:2026-10-27'])
    expect(buildInbox({ ...base, bolt: { kind: 'error', error: 'HTTP 500' } }).todo[0]?.sub).toBe('HTTP 500')
  })

  it('wygasła sesja zastępuje błąd synchronizacji', () => {
    expect(ids({ sessionExpired: true, syncError: 'x' }).todo).toEqual(['session'])
    expect(ids({ syncError: 'x' }).todo).toEqual(['sync'])
  })

  it('propozycja FTP i brak miejscowości (nie gdy jeszcze nie wiadomo)', () => {
    expect(ids({ ftpSuggestion: { ftp: 250, ride_id: 'w1', ride_date: '2026-10-25' }, hasLocation: false }).todo).toEqual(['ftp:w1:250', 'weather'])
    expect(ids({ hasLocation: undefined }).todo).toEqual([])
  })

  it('notatki i testy jako „Nowe”: znikają po przeczytaniu; same nowe dają kropkę, nie liczbę', () => {
    const inp = {
      rides: [ride('2026-10-27', 'a', 'Spokojna jazda w strefie. '.repeat(10))],
      ratedDates: new Set(['2026-10-27']),
      tests: [{ id: 't1', date: '2026-10-22', ftp_w: 250, lthr_bpm: 165 }, { id: 't0', date: '2026-10-01', ftp_w: 240, lthr_bpm: 160 }],
    }
    const r = ids(inp)
    expect(r).toEqual({ todo: [], fresh: ['note:a', 'test:t1'], badge: 0, dot: true })
    const note = buildInbox({ ...base, ...inp }).fresh[0]!
    expect(note.sub!.length).toBeLessThanOrEqual(91 + 12)
    expect(note.sub).toContain('27.10 · ')
    expect(note.sub!.endsWith('…')).toBe(true)
    expect(ids({ ...inp, seen: new Set(['note:a', 'test:t1']) }).fresh).toEqual([])
  })

  it('jutrzejsza jazda dopiero wieczorem, z pogodą na godzinę startu', () => {
    expect(soon({ upcoming: week(), hour: 16 })).toEqual([])
    const [item] = soon({ upcoming: week(), hour: 19, tomorrowWeather: { label: 'Deszcz', temp_min_c: 7.6, temp_max_c: 10.2, precip_prob: 60, wind_kmh: 31, start: '18:00' } })
    expect(item).toMatchObject({ id: 'tomorrow:2026-10-28', to: '/m/dzien/2026-10-28' })
    expect(item!.title).toContain('Z2')
    expect(item!.sub).toMatch(/^1 h 30 min · Deszcz, 8–10 °C · .*60.* · .*31.* · .*18:00/)
    expect(soon({ upcoming: week({ '2026-10-28': { ride: null } }), hour: 19 })).toEqual([])
  })

  it('test FTP zapowiadany 2–3 dni wcześniej, nie tydzień przed', () => {
    expect(soon({ upcoming: week({ '2026-10-30': { test: true } }) }).map((i) => i.id)).toEqual(['soon-test:2026-10-30'])
    expect(soon({ upcoming: week({ '2026-11-02': { test: true } }) })).toEqual([])
  })

  it('rozładowanie od poniedziałku: od piątku, z tekstem programu; nie gdy już trwa', () => {
    const today = '2026-10-30' // piątek, poniedziałek 2.11 za 3 dni
    const days = week({ '2026-11-02': { deload: true } })
    expect(soon({ today, upcoming: days, deloadNote: 'Lżej.' })).toMatchObject([{ id: 'deload:2026-11-02', sub: 'Lżej.', to: '/m/plan/2026-11-02' }])
    expect(soon({ today: '2026-10-29', upcoming: days })).toEqual([])
    expect(soon({ today, upcoming: days, todayDeload: true })).toEqual([])
  })

  it('nieotwarta zapowiedź daje kropkę, otwarta już nie; zapowiedzi nie liczą się na plakietce', () => {
    const inp = { upcoming: week({ '2026-10-30': { test: true } }) }
    expect(ids(inp)).toMatchObject({ badge: 0, dot: true })
    expect(ids({ ...inp, seen: new Set(['soon-test:2026-10-30']) })).toMatchObject({ badge: 0, dot: false })
  })
})
