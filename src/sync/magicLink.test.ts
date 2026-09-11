import { describe, expect, it } from 'vitest'
import { authErrorFromLocation, parseMagicLink } from './magicLink'

describe('magic link', () => {
  it('parsuje link weryfikacyjny (także wklejony z tekstem dookoła)', () => {
    const r = parseMagicLink('Zaloguj: https://kgll.supabase.co/auth/v1/verify?token=pkce_abc123&type=magiclink&redirect_to=https%3A%2F%2Ftrening-inky.vercel.app%2Fwiecej%2Fustawienia ok')
    expect(r).toEqual({ token_hash: 'pkce_abc123', type: 'magiclink' })
    expect(parseMagicLink('https://x.y/verify?type=magiclink')).toBeNull()
    expect(parseMagicLink('nie link')).toBeNull()
  })
  it('błąd z hasha URL', () => {
    expect(authErrorFromLocation({ hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', search: '' })).toContain('wygasł')
    expect(authErrorFromLocation({ hash: '', search: '' })).toBeNull()
  })
})
