import { describe, expect, it } from 'vitest'
import { avatarView, googleAvatarUrl, initialsOf } from '../avatar'

const OWN = 'data:image/jpeg;base64,AAAA'
const G = 'https://lh3.googleusercontent.com/a/xyz=s240-c'

describe('zdjęcie profilowe', () => {
  it('kolejność: własne → Google → inicjały; „none” wyłącza zdjęcie z Google', () => {
    expect(avatarView(OWN, G, 'Łukasz', 'a@b.pl')).toEqual({ kind: 'photo', src: OWN, source: 'own' })
    expect(avatarView(null, G, 'Łukasz', 'a@b.pl')).toEqual({ kind: 'photo', src: G, source: 'google' })
    expect(avatarView('none', G, 'Łukasz', 'a@b.pl')).toEqual({ kind: 'initials', text: 'Ł' })
    expect(avatarView(undefined, null, '', 'elcukro@gmail.com')).toEqual({ kind: 'initials', text: 'E' })
  })

  it('inicjały z dwóch pierwszych słów imienia, inaczej z e-maila', () => {
    expect(initialsOf('jan maria kowalski', null)).toBe('JM')
    expect(initialsOf('  ', '')).toBe('?')
  })

  it('adres Google w większym rozmiarze, tylko https', () => {
    expect(googleAvatarUrl({ avatar_url: 'https://lh3.googleusercontent.com/a/xyz=s96-c' })).toBe(G)
    expect(googleAvatarUrl({ picture: 'https://example.com/p.png' })).toBe('https://example.com/p.png')
    expect(googleAvatarUrl({ avatar_url: 'http://x' })).toBeNull()
    expect(googleAvatarUrl(undefined)).toBeNull()
  })
})
