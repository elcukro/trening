import { describe, expect, it } from 'vitest'
import { dayTimeOf, introScene, parseScene, sceneImages, seasonOf } from '../introScene'

describe('seasonOf', () => {
  it('pory meteorologiczne', () => {
    expect(seasonOf('2026-03-01')).toBe('spring')
    expect(seasonOf('2026-05-31')).toBe('spring')
    expect(seasonOf('2026-06-01')).toBe('summer')
    expect(seasonOf('2026-08-31')).toBe('summer')
    expect(seasonOf('2026-09-01')).toBe('autumn')
    expect(seasonOf('2026-11-30')).toBe('autumn')
    expect(seasonOf('2026-12-01')).toBe('winter')
    expect(seasonOf('2027-02-28')).toBe('winter')
  })
})

describe('dayTimeOf', () => {
  it('czerwiec: długi dzień', () => {
    expect(dayTimeOf('2027-06-21', 3)).toBe('night')
    expect(dayTimeOf('2027-06-21', 4)).toBe('morning')
    expect(dayTimeOf('2027-06-21', 10)).toBe('morning')
    expect(dayTimeOf('2027-06-21', 11)).toBe('noon')
    expect(dayTimeOf('2027-06-21', 19)).toBe('noon')
    expect(dayTimeOf('2027-06-21', 20)).toBe('evening')
    expect(dayTimeOf('2027-06-21', 21)).toBe('evening')
    expect(dayTimeOf('2027-06-21', 22)).toBe('night')
  })

  it('grudzień: o 16:00 już noc, o 7:00 jeszcze noc', () => {
    expect(dayTimeOf('2026-12-15', 7)).toBe('night')
    expect(dayTimeOf('2026-12-15', 8)).toBe('morning')
    expect(dayTimeOf('2026-12-15', 13)).toBe('noon')
    expect(dayTimeOf('2026-12-15', 14)).toBe('evening')
    expect(dayTimeOf('2026-12-15', 15)).toBe('evening')
    expect(dayTimeOf('2026-12-15', 16)).toBe('night')
    expect(dayTimeOf('2026-12-15', 0)).toBe('night')
  })

  it('październik', () => {
    expect(dayTimeOf('2026-10-26', 7)).toBe('morning')
    expect(dayTimeOf('2026-10-26', 12)).toBe('noon')
    expect(dayTimeOf('2026-10-26', 16)).toBe('evening')
    expect(dayTimeOf('2026-10-26', 18)).toBe('night')
  })
})

describe('introScene i parseScene', () => {
  it('składa porę roku i dnia', () => {
    expect(introScene('2026-10-26', 7)).toMatchObject({ season: 'autumn', time: 'morning' })
    expect(introScene('2027-01-10', 22)).toMatchObject({ season: 'winter', time: 'night' })
    expect(introScene('2027-07-01', 13)).toMatchObject({ season: 'summer', time: 'noon' })
  })

  it('wariant z napisu', () => {
    expect(parseScene('winter-night')).toEqual(introScene('2027-01-10', 22))
    expect(parseScene('autumn')).toBeNull()
    expect(parseScene('lato-noon')).toBeNull()
    expect(parseScene(null)).toBeNull()
  })

  it('pliki warstw', () => {
    expect(sceneImages({ season: 'spring' })).toEqual([
      '/m/intro/intro-spring-far.webp',
      '/m/intro/intro-spring-near.webp',
      '/m/intro/intro-spring-road.webp',
      '/m/intro/intro-rider.webp',
      '/m/intro/intro-title.webp',
    ])
  })
})
