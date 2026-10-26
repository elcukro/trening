import { describe, expect, it } from 'vitest'
import {
  allowedReturn,
  APP_RETURN,
  challengeFor,
  parseState,
  parseTicket,
  returnOrigins,
  returnWith,
  validChallenge,
  verifierMatches,
} from '../../../supabase/functions/_shared/strava_login'

const origins = returnOrigins('https://trening.felsztukier.pl', 'https://podglad.example.com, ')
const VERIFIER = 'a'.repeat(43)

describe('allowedReturn', () => {
  it('przepuszcza aplikację iOS, domeny produkcyjne i localhost', () => {
    expect(allowedReturn(APP_RETURN, origins)).toBe(APP_RETURN)
    expect(allowedReturn('https://trening.felsztukier.pl/m', origins)).toBe('https://trening.felsztukier.pl/m')
    expect(allowedReturn('https://trening-inky.vercel.app/wiecej/ustawienia', origins)).toBe('https://trening-inky.vercel.app/wiecej/ustawienia')
    expect(allowedReturn('https://podglad.example.com/i', origins)).toBe('https://podglad.example.com/i')
    expect(allowedReturn('http://localhost:4273/m', origins)).toBe('http://localhost:4273/m')
    expect(allowedReturn('http://127.0.0.1:5173/', origins)).toBe('http://127.0.0.1:5173/')
  })

  it('obcina fragment – miejsce na bilet ustawia serwer', () => {
    expect(allowedReturn('https://trening.felsztukier.pl/m#stary', origins)).toBe('https://trening.felsztukier.pl/m')
  })

  it('odrzuca obce adresy, podszywanie się pod domenę i inne schematy', () => {
    for (const bad of [
      null,
      '',
      'https://evil.example.com/m',
      'https://trening.felsztukier.pl.evil.com/m',
      'https://evil.com@trening.felsztukier.pl/m',
      'http://trening.felsztukier.pl/m',
      'https://localhost/m',
      'http://localhost.evil.com/m',
      'trening://inny',
      'javascript:alert(1)',
      'nie-adres',
    ]) {
      expect(allowedReturn(bad, origins), String(bad)).toBeNull()
    }
  })
})

describe('stan i bilet', () => {
  const ch = 'b'.repeat(43)

  it('stan: poprawny, przeterminowany, cudzy', () => {
    const state = { p: 'strava-login', ret: APP_RETURN, ch, exp: 1000 }
    expect(parseState(JSON.stringify(state), 999)).toEqual(state)
    expect(parseState(JSON.stringify(state), 1001)).toBe('expired')
    // stan integracji Stravy (strava-oauth) i bilet nie są stanem logowania
    expect(parseState(JSON.stringify({ uid: 'u1', exp: 1000 }), 0)).toBe('bad_state')
    expect(parseState(JSON.stringify({ p: 'strava-ticket', uid: 'u1', ch, exp: 1000 }), 0)).toBe('bad_state')
    expect(parseState(null, 0)).toBe('bad_state')
    expect(parseState('nie json', 0)).toBe('bad_state')
  })

  it('bilet: poprawny, przeterminowany, stan zamiast biletu', () => {
    const t = { p: 'strava-ticket', uid: 'u1', ch, exp: 1000 }
    expect(parseTicket(JSON.stringify(t), 1000)).toEqual(t)
    expect(parseTicket(JSON.stringify(t), 1001)).toBe('expired')
    expect(parseTicket(JSON.stringify({ p: 'strava-login', ret: APP_RETURN, ch, exp: 1000 }), 0)).toBe('bad_state')
    expect(parseTicket(JSON.stringify({ ...t, ch: 'krótkie' }), 0)).toBe('bad_state')
  })

  it('parametry powrotu idą we fragmencie i są zakodowane', () => {
    expect(returnWith(APP_RETURN, { strava_ticket: 'ab+c/d=.e=' })).toBe('trening://auth#strava_ticket=ab%2Bc%2Fd%3D.e%3D')
    expect(returnWith('https://trening.felsztukier.pl/m', { strava_error: 'not_linked' })).toBe('https://trening.felsztukier.pl/m#strava_error=not_linked')
  })
})

describe('PKCE', () => {
  it('wyzwanie to base64url SHA-256 (wektor z RFC 7636)', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(validChallenge(await challengeFor(VERIFIER))).toBe(true)
  })

  it('weryfikator musi pasować do wyzwania z biletu', async () => {
    const ch = await challengeFor(VERIFIER)
    expect(await verifierMatches(VERIFIER, ch)).toBe(true)
    expect(await verifierMatches('b'.repeat(43), ch)).toBe(false)
    expect(await verifierMatches('krótki', await challengeFor('krótki'))).toBe(false)
    expect(await verifierMatches(undefined, ch)).toBe(false)
  })
})
