import { describe, expect, it } from 'vitest'
import { en, pl } from '../dict'
import { enWord, plWord } from '../core'

/** Drzewo kluczy z liczbą argumentów funkcji – obie wersje muszą mieć dokładnie ten sam kształt (docs/34 § 2). */
function shape(v: unknown, path = ''): string[] {
  if (typeof v === 'function') return [`${path}()${v.length}`]
  if (typeof v === 'string') return [path]
  if (Array.isArray(v)) return [`${path}[${v.length}]`, ...v.flatMap((x, i) => shape(x, `${path}[${i}]`))]
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => shape(x, path ? `${path}.${k}` : k))
  return [`${path}:${typeof v}`]
}

/** Wszystkie teksty (z funkcji wywołanych przykładowymi argumentami) – do wykrycia pustych i nieprzetłumaczonych. */
function strings(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]]
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k))
  return []
}

describe('słowniki PL/EN', () => {
  it('mają te same klucze i sygnatury funkcji', () => {
    const a = shape(pl)
    const b = shape(en)
    expect(b.filter((k) => !a.includes(k))).toEqual([])
    expect(a.filter((k) => !b.includes(k))).toEqual([])
  })

  it('nie mają pustych tekstów', () => {
    expect(strings(pl).filter(([, s]) => s.trim() === '' ).map(([p]) => p)).toEqual([])
    expect(strings(en).filter(([, s]) => s.trim() === '').map(([p]) => p)).toEqual([])
  })

  it('angielski nie zawiera polskich liter', () => {
    const polish = strings(en).filter(([p, s]) => /[ąćęłńóśźż]/i.test(s) && !p.endsWith('language.pl'))
    expect(polish.map(([p]) => p)).toEqual([])
  })
})

describe('liczba mnoga', () => {
  it('polska: 1 / 2–4 / 5+ / 12–14 / 22 / ułamki', () => {
    const w = (n: number) => plWord(n, 'dzień', 'dni-few', 'dni-many')
    expect([1, 2, 4, 5, 12, 14, 22, 25, 1.5].map(w)).toEqual(['dzień', 'dni-few', 'dni-few', 'dni-many', 'dni-many', 'dni-many', 'dni-few', 'dni-many', 'dni-few'])
  })
  it('angielska: 1 / reszta', () => {
    expect([0, 1, 2, 1.5].map((n) => enWord(n, 'day', 'days'))).toEqual(['days', 'day', 'days', 'days'])
  })
})
