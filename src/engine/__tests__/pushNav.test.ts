import { describe, expect, it } from 'vitest'
import { iosPathFor, mobilePathFor } from '../../app/pushNav'

describe('mapowanie ścieżek na widoki mobilne', () => {
  it('/i: Dziś, dzień, tydzień, postęp; raporty zostają w pełnej aplikacji', () => {
    expect(iosPathFor('/')).toBe('/i')
    expect(iosPathFor('/dzien/2026-10-18')).toBe('/i/dzien/2026-10-18')
    expect(iosPathFor('/postep/tydzien/2026-10-12')).toBeNull()
    expect(iosPathFor('/i/tydzien')).toBeNull()
  })
  it('/m: Dziś, dzień (także z /i i z treningu), Plan, Ja', () => {
    expect(mobilePathFor('/')).toBe('/m')
    expect(mobilePathFor('/i')).toBe('/m')
    expect(mobilePathFor('/dzien/2026-10-18')).toBe('/m/dzien/2026-10-18')
    expect(mobilePathFor('/i/trening/2026-10-18')).toBe('/m/jazda/2026-10-18')
    expect(mobilePathFor('/tydzien/2026-10-12')).toBe('/m/plan/2026-10-12')
    expect(mobilePathFor('/i/postep')).toBe('/m/ja')
    expect(mobilePathFor('/i/wiecej')).toBe('/m/ja')
    expect(mobilePathFor('/postep/tydzien/2026-10-12')).toBeNull()
    expect(mobilePathFor('/m/plan')).toBeNull()
    expect(mobilePathFor('/silownia/2026-10-18')).toBeNull()
  })
})
