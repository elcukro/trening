import { describe, expect, it } from 'vitest'
import { changedKeys, mergeProfile, withFieldStamps, type LocalProfile, type RemoteProfile } from '../profileMerge'

const MAP = [
  ['athlete_name', 'name'],
  ['lthr_bpm', 'lthr_bpm'],
  ['ftp_w_estimate', 'ftp_w'],
  ['body_weight_start_kg', 'weight_start_kg'],
  ['program_start', 'program_start'],
  ['program_id', 'program_id'],
] as const
const TEXT = new Set(['program_start'])

const T0 = '2026-09-24T08:00:00.000Z'
const T1 = '2026-09-24T09:00:00.000Z'
const T2 = '2026-09-24T10:00:00.000Z'
const T3 = '2026-09-24T11:00:00.000Z'

describe('scalanie profilu per pole', () => {
  it('scenariusz z 24.09: stary klient zrównał znaczniki wiersza, nowe pole i tak dochodzi', () => {
    // serwer: program_id ustawiony SQL-em; stary build pobrał profil bez tego pola i przyjął jego updated_at
    const remote: RemoteProfile = { updated_at: T1, name: 'Ferdynand', ftp_w: 235, program_id: 'ftp300' }
    const local: LocalProfile = { value: { athlete_name: 'Ferdynand', ftp_w_estimate: 235 }, updated_at: T1 }
    const m = mergeProfile(local, remote, MAP, TEXT)
    expect(m.push).toBeNull()
    expect(m.pull?.value.program_id).toBe('ftp300')
    expect(m.pull?.updated_at).toBe(T1)
  })

  it('zmiana pola na serwerze (SQL, trigger) nie przegrywa z niezwiązaną zmianą na telefonie', () => {
    const remote: RemoteProfile = { updated_at: T2, field_updated_at: { program_id: T2 }, program_id: 'ftp300', ftp_w: 235 }
    // telefon: stary program z T0, potem edycja FTP w T3
    const local: LocalProfile = { value: { program_id: 'alps2027', ftp_w_estimate: 250 }, updated_at: T3, field_updated_at: { program_id: T0, ftp_w_estimate: T3 } }
    const m = mergeProfile(local, remote, MAP, TEXT)
    expect(m.push?.row).toEqual({ ftp_w: 250 })
    expect(m.push?.field_updated_at).toEqual({ ftp_w: T3 })
    expect(m.pull?.value).toMatchObject({ program_id: 'ftp300', ftp_w_estimate: 250 })
    expect(m.pull?.field_updated_at?.program_id).toBe(T2)
  })

  it('bez znaczników pól działa jak dotąd: nowszy wiersz wygrywa', () => {
    const remote: RemoteProfile = { updated_at: T1, lthr_bpm: 165 }
    expect(mergeProfile({ value: { lthr_bpm: 170 }, updated_at: T2 }, remote, MAP).push?.row).toEqual({ lthr_bpm: 170 })
    expect(mergeProfile({ value: { lthr_bpm: 170 }, updated_at: T0 }, remote, MAP).pull?.value.lthr_bpm).toBe(165)
    expect(mergeProfile({ value: { lthr_bpm: 170 }, updated_at: T1 }, { ...remote, lthr_bpm: 170 }, MAP)).toEqual({ push: null, pull: null })
  })

  it('pierwsza synchronizacja: brak profilu na serwerze wysyła wszystko, brak lokalnego pobiera wszystko', () => {
    const local: LocalProfile = { value: { athlete_name: 'Łukasz', program_start: '2026-09-11' }, updated_at: T1 }
    expect(mergeProfile(local, null, MAP, TEXT).push?.row).toEqual({ name: 'Łukasz', program_start: '2026-09-11' })
    const pulled = mergeProfile(undefined, { updated_at: T1, name: 'Łukasz', weight_start_kg: '110.0', program_start: '2026-09-11' }, MAP, TEXT).pull!
    expect(pulled.value).toEqual({ athlete_name: 'Łukasz', body_weight_start_kg: 110, program_start: '2026-09-11' })
  })

  it('pole wyczyszczone na innym urządzeniu dochodzi jako null', () => {
    const remote: RemoteProfile = { updated_at: T2, field_updated_at: { lthr_bpm: T2 }, lthr_bpm: null }
    const m = mergeProfile({ value: { lthr_bpm: 170 }, updated_at: T1 }, remote, MAP)
    expect(m.pull?.value.lthr_bpm).toBeNull()
  })

  it('uzupełnienie znaczników: stare pola zachowują znacznik wiersza', () => {
    expect(withFieldStamps({ value: { a: 1, b: 2 }, updated_at: T0, field_updated_at: { b: T2 } })).toEqual({ a: T0, b: T2 })
  })

  it('zapis formularza stempluje tylko pola, które naprawdę się zmieniły', () => {
    const stored = { ftp_w_estimate: 235 }
    const effective = { ftp_w_estimate: 235, lthr_bpm: 170, program_id: 'ftp300' }
    expect(changedKeys(stored, effective, { ftp_w_estimate: 235, lthr_bpm: 170, program_id: 'ftp300' })).toEqual([])
    expect(changedKeys(stored, effective, { ftp_w_estimate: 240, lthr_bpm: 170 })).toEqual(['ftp_w_estimate'])
    expect(changedKeys(stored, effective, { lthr_bpm: null })).toEqual(['lthr_bpm'])
  })
})
