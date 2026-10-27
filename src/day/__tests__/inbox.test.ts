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
}

const ride = (date: string, key: string, note: string | null = null) => ({ key, date, name: 'Z2', note, note_source: note ? ('ai' as const) : null })
const ids = (inp: Partial<InboxInput>) => {
  const b = buildInbox({ ...base, ...inp })
  return { todo: b.todo.map((i) => i.id), fresh: b.fresh.map((i) => i.id), badge: b.badge, dot: b.dot }
}

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
})
