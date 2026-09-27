import { describe, expect, it } from 'vitest'
import { iosPathFor, isNavigateMessage } from '../pushNav'

describe('cele powiadomień w uproszczonym interfejsie', () => {
  it('ekrany codzienne mają odpowiednik w /i', () => {
    expect(iosPathFor('/')).toBe('/i')
    expect(iosPathFor('/dzien/2026-09-26')).toBe('/i/dzien/2026-09-26')
    expect(iosPathFor('/tydzien')).toBe('/i/tydzien')
    expect(iosPathFor('/tydzien/2026-09-21')).toBe('/i/tydzien/2026-09-21')
    expect(iosPathFor('/postep')).toBe('/i/postep')
  })
  it('raporty i ekrany tylko pełnej aplikacji zostają w pełnej aplikacji', () => {
    expect(iosPathFor('/postep/tydzien/2026-09-21')).toBeNull()
    expect(iosPathFor('/postep/miesiac/2026-09')).toBeNull()
    expect(iosPathFor('/wiecej/ustawienia')).toBeNull()
    expect(iosPathFor('/i/dzien/2026-09-26')).toBeNull()
  })
  it('rozpoznaje wiadomość nawigacyjną z service workera', () => {
    expect(isNavigateMessage({ type: 'navigate', url: '/dzien/2026-09-26' })).toBe(true)
    expect(isNavigateMessage({ type: 'other' })).toBe(false)
    expect(isNavigateMessage(null)).toBe(false)
  })
})
