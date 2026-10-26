import { describe, expect, it } from 'vitest'
import alpsJson from '../../../data/program.json'
import ftp300Json from '../../../data/program-ftp300.json'
import tableJson from '../../../data/i18n/program_en.json'
import { parseProgram } from '@/engine/schema'
import { loadProgram } from '../program'
import { localizeProgram } from '../localize'
import { loadClothing } from '../clothing'
import { itemKey, loadGearTemplates, loadPackingList } from '../gear'

// Ta sama reguła wyboru tekstów co `human_texts` w data/reference_generator.py (docs/34 § 5).
const SKIP_KEYS = new Set(['id', 'version', 'program_id', 'language', 'kind', 'phase', 'type', 'intensity', 'day_type', 'workout', 'translations'])
const WORD_KEYS = new Set(['name', 'title', 'short', 'default', 'label', 'until', 'today', 'after'])
const PL_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/
/** Nazwy własne, które po angielsku zostają z polskimi literami. */
const PROPER_NAMES = /Łódź|Koniaków/g

function isHumanText(key: string | undefined, s: string): boolean {
  if (!/[a-ząćęłńóśźż]{2,}/.test(s)) return false
  return s.trim().includes(' ') || PL_LETTERS.test(s) || (key !== undefined && WORD_KEYS.has(key))
}

/** Teksty programu (pola poza SKIP_KEYS) z kluczem pola; element listy dziedziczy klucz rodzica. */
function texts(value: unknown, key?: string, out: { key?: string; text: string }[] = []): { key?: string; text: string }[] {
  if (key && SKIP_KEYS.has(key)) return out
  if (typeof value === 'string') out.push({ key, text: value })
  else if (Array.isArray(value)) for (const v of value) texts(v, key, out)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) texts(v, k, out)
  return out
}

/** Porównuje strukturę: te same klucze i długości list, te same liczby i wartości pól z SKIP_KEYS. */
function sameShape(a: unknown, b: unknown, path: string, key?: string): void {
  if (typeof a === 'string') {
    expect(typeof b, path).toBe('string')
    if (key && SKIP_KEYS.has(key)) expect(b, path).toBe(a)
    return
  }
  if (Array.isArray(a)) {
    expect(Array.isArray(b) && b.length, path).toBe(a.length)
    a.forEach((v, i) => sameShape(v, (b as unknown[])[i], `${path}[${i}]`, key))
    return
  }
  if (a && typeof a === 'object') {
    if (key && SKIP_KEYS.has(key)) return expect(b, path).toEqual(a)
    expect(Object.keys(b as object), path).toEqual(Object.keys(a))
    for (const [k, v] of Object.entries(a)) sameShape(v, (b as Record<string, unknown>)[k], `${path}.${k}`, k)
    return
  }
  expect(b, path).toBe(a)
}

const table = tableJson as Record<string, string>
const noPolish = (list: string[]) => list.filter((s) => PL_LETTERS.test(s))
const nums = (s: string) => (s.match(/\d+/g) ?? []).toSorted()
const PROGRAMS = [
  { id: 'alps2027', json: alpsJson as unknown },
  { id: 'ftp300', json: ftp300Json as unknown },
]

describe.each(PROGRAMS)('program $id po angielsku', ({ id, json }) => {
  const program = parseProgram(json)
  const en = program.translations?.en ?? {}

  it('każdy tekst dla ludzi ma tłumaczenie', () => {
    const missing = [...new Set(texts(program).filter((t) => isHumanText(t.key, t.text)).map((t) => t.text))].filter((t) => !(t in en))
    expect(missing).toEqual([])
  })

  it('tłumaczenia w programie pochodzą z tabeli data/i18n/program_en.json', () => {
    for (const [pl, eng] of Object.entries(en)) expect(eng, pl).toBe(table[pl])
  })

  it('po lokalizacji nie zostaje tekst z polskimi literami', () => {
    const left = texts(localizeProgram(program, 'en')).filter((t) => PL_LETTERS.test(t.text.replace(PROPER_NAMES, '')))
    expect(left.map((t) => t.text)).toEqual([])
  })

  it('struktura, liczby i identyfikatory bez zmian', () => {
    sameShape(program, localizeProgram(program, 'en'), id)
  })

  it('loadProgram(id, "en") przechodzi walidację', () => {
    const loaded = loadProgram(id, 'en')
    expect(() => parseProgram(loaded)).not.toThrow()
    expect(loaded.version).toBe(program.version)
    expect(loadProgram(id, 'pl').meta.name).toBe(program.meta.name)
  })
})

describe('tabela data/i18n/program_en.json', () => {
  it('każdy wpis jest użyty w którymś programie', () => {
    const used = new Set(PROGRAMS.flatMap((p) => Object.keys(parseProgram(p.json).translations?.en ?? {})))
    expect(Object.keys(table).filter((k) => !used.has(k))).toEqual([])
  })

  it('tłumaczenie zachowuje liczby i skrajne spacje', () => {
    for (const [pl, eng] of Object.entries(table)) {
      expect(nums(eng), pl).toEqual(nums(pl))
      expect(/^\s/.test(eng), pl).toBe(/^\s/.test(pl))
      expect(eng.trim(), pl).not.toBe('')
      expect(eng, pl).not.toMatch(/\d,\d/) // przecinek dziesiętny tylko po polsku
    }
  })
})

describe('pliki pomocnicze po angielsku', () => {
  it('ubiór wg temperatury', () => {
    const pl = loadClothing('pl')
    const en = loadClothing('en')
    expect(en.bands.map((b) => [b.max_c, b.items.length])).toEqual(pl.bands.map((b) => [b.max_c, b.items.length]))
    expect(noPolish([...en.bands.flatMap((b) => [b.label, ...b.items]), ...Object.values(en.extras).flat()])).toEqual([])
    expect(pl.bands[0]?.label).toBe('Mróz')
  })

  it('szablony serwisu', () => {
    const pl = loadGearTemplates('pl')
    const en = loadGearTemplates('en')
    expect(en.map((t) => t.id)).toEqual(pl.map((t) => t.id))
    expect(noPolish(en.flatMap((t) => [t.title, t.details]))).toEqual([])
    expect(pl[0]).not.toHaveProperty('title_en')
  })

  it('lista pakowania – klucze zapisu niezależne od języka', () => {
    const pl = loadPackingList('pl')
    const en = loadPackingList('en')
    expect(en.items.map(itemKey)).toEqual(pl.items.map(itemKey))
    expect(en.items.map((i) => i.only ?? null)).toEqual(pl.items.map((i) => i.only ?? null))
    expect(noPolish([en.system, ...en.bags.flatMap((b) => [b.name, b.content]), ...en.items.flatMap((i) => [i.cat, i.name])])).toEqual([])
  })
})
