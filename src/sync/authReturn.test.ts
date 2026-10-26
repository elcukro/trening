import { describe, expect, it } from 'vitest'
import { authErrorMessage, parseAuthReturn, splitUrl, withoutAuthParams } from './authReturn'

describe('powrót z logowania Google/Strava', () => {
  it('bilet Stravy z fragmentu (przeglądarka i trening://auth)', () => {
    expect(parseAuthReturn({ search: '?today=2026-10-26', hash: '#strava_ticket=abc%2B.def%3D' })).toEqual({ kind: 'strava_ticket', ticket: 'abc+.def=' })
    expect(parseAuthReturn(splitUrl('trening://auth#strava_ticket=t1'))).toEqual({ kind: 'strava_ticket', ticket: 't1' })
  })

  it('konto Stravy bez połączenia z aplikacją – czytelny komunikat', () => {
    const r = parseAuthReturn({ search: '', hash: '#strava_error=not_linked' })
    expect(r?.kind).toBe('error')
    expect(r?.kind === 'error' && r.message).toMatch(/zaloguj się kodem z maila.*połącz Stravę/i)
    expect(parseAuthReturn({ search: '', hash: '#strava_error=cos_nowego' })).toEqual({ kind: 'error', message: expect.stringMatching(/spróbuj jeszcze raz/) })
  })

  it('kod PKCE w aplikacji iOS i błędy Supabase w zapytaniu', () => {
    expect(parseAuthReturn(splitUrl('trening://auth?code=xyz'))).toEqual({ kind: 'code', code: 'xyz' })
    const denied = parseAuthReturn(splitUrl('trening://auth?error=access_denied&error_description=User+cancelled'))
    expect(denied).toEqual({ kind: 'error', message: 'Logowanie zostało przerwane.' })
  })

  it('Google z adresu spoza listy dozwolonych – komunikat zamiast pustej aplikacji', () => {
    for (const desc of ['Signups not allowed for this instance', 'Database error saving new user']) {
      const r = parseAuthReturn({ search: `?error=server_error&error_description=${encodeURIComponent(desc)}`, hash: '' })
      expect(r?.kind === 'error' && r.message).toMatch(/nie ma dostępu/)
    }
    expect(authErrorMessage('Unsupported provider: provider is not enabled')).toMatch(/Google nie jest jeszcze włączone/)
  })

  it('zwykły adres to nie powrót z logowania', () => {
    expect(parseAuthReturn({ search: '?today=2026-10-26', hash: '' })).toBeNull()
    expect(parseAuthReturn(splitUrl('https://trening.felsztukier.pl/m'))).toBeNull()
  })

  it('czyści parametry logowania, zostawia resztę', () => {
    expect(withoutAuthParams('https://t.pl/m?today=2026-10-26#strava_ticket=abc')).toBe('https://t.pl/m?today=2026-10-26')
    expect(withoutAuthParams('https://t.pl/m?error=x&error_description=y&today=1')).toBe('https://t.pl/m?today=1')
    expect(withoutAuthParams('https://t.pl/m?today=1')).toBeNull()
  })
})
