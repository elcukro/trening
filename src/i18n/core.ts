/**
 * Języki aplikacji (docs/34): polski i angielski. Czysty TS bez React – używają go silnik, formatery i UI.
 *
 * Bieżący język to stan modułu (`getLang`), bo formatery (`num`, `fmtShort`) i etykiety silnika nie dostają kontekstu.
 * Zmiana języka przemontowuje drzewo React (`key` w `LangProvider`), więc nic nie zostaje w starym języku.
 * Wybór zawodnika: `settings.language` = `system` | `pl` | `en`; `system` → `navigator.language` (w aplikacji iOS
 * to język telefonu, bo Info.plist deklaruje obie lokalizacje).
 */

export const LANGS = ['pl', 'en'] as const
export type Lang = (typeof LANGS)[number]
/** Wybór w ustawieniach: konkretny język albo język systemu. */
export type LangChoice = Lang | 'system'

const STORAGE_KEY = 'bc:lang'

export function isLang(v: unknown): v is Lang {
  return v === 'pl' || v === 'en'
}

/** Język systemu: polski dla `pl*`, angielski dla każdego innego (najszerzej zrozumiały). */
export function systemLang(): Lang {
  if (typeof navigator === 'undefined') return 'pl'
  const list = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const l of list) {
    const code = (l ?? '').toLowerCase()
    if (code.startsWith('pl')) return 'pl'
    if (code.startsWith('en')) return 'en'
  }
  return 'en'
}

export function resolveLang(choice: string | null | undefined): Lang {
  return isLang(choice) ? choice : systemLang()
}

function stored(): Lang | null {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : null
  } catch {
    return null
  }
}

/** `?lang=en` w URL (testy, podgląd) wygrywa z ustawieniem. */
function urlLang(): Lang | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('lang')
  return isLang(v) ? v : null
}

// Testy (Node) zawsze startują po polsku – złote wyniki silnika są po polsku.
let current: Lang = typeof window === 'undefined' ? 'pl' : (urlLang() ?? stored() ?? systemLang())
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.documentElement.lang = current

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  const next = urlLang() ?? lang
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* tryb prywatny – język i tak jest w profilu */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  if (next === current) return
  current = next
  for (const l of listeners) l()
}

export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Locale dla `Intl` i `toLocaleString`: angielski brytyjski – tydzień od poniedziałku, daty dzień-miesiąc. */
export function intlLocale(lang: Lang = current): string {
  return lang === 'pl' ? 'pl-PL' : 'en-GB'
}

const rules = new Map<Lang, Intl.PluralRules>()
function pluralRule(lang: Lang): Intl.PluralRules {
  let r = rules.get(lang)
  if (!r) rules.set(lang, (r = new Intl.PluralRules(intlLocale(lang))))
  return r
}

/** Polska odmiana: 1 dzień, 2 dni, 5 dni, 22 dni; ułamki → `few` („1,5 godziny”). Zwraca samo słowo. */
export function plWord(n: number, one: string, few: string, many: string): string {
  const c = pluralRule('pl').select(n)
  return c === 'one' ? one : c === 'few' ? few : c === 'other' ? few : many
}

/** Angielska odmiana: 1 day, 2 days. Zwraca samo słowo. */
export function enWord(n: number, one: string, other: string): string {
  return pluralRule('en').select(n) === 'one' ? one : other
}

/** „5 dni” – liczba sformatowana wg języka + słowo. */
export function plCount(n: number, one: string, few: string, many: string): string {
  return `${n.toLocaleString('pl-PL')} ${plWord(n, one, few, many)}`
}

export function enCount(n: number, one: string, other: string): string {
  return `${n.toLocaleString('en-GB')} ${enWord(n, one, other)}`
}

/**
 * Mapa etykiet zależna od języka, czytana w chwili dostępu – stare wywołania `LABEL[key]` działają bez zmian.
 * Obie wersje muszą mieć te same klucze (sprawdza to typ `Record<K, string>`).
 */
export function localized<K extends string>(byLang: Record<Lang, Record<K, string>>): Record<K, string> {
  return new Proxy({} as Record<K, string>, {
    get: (_t, key) => (typeof key === 'string' ? byLang[current][key as K] : undefined),
    has: (_t, key) => typeof key === 'string' && key in byLang[current],
    ownKeys: () => Reflect.ownKeys(byLang[current]),
    getOwnPropertyDescriptor: (_t, key) =>
      typeof key === 'string' && key in byLang[current]
        ? { enumerable: true, configurable: true, value: byLang[current][key as K] }
        : undefined,
  })
}

/** Wybór wartości dla bieżącego języka (krótkie wstawki w kodzie nie-UI). */
export function pick<T>(byLang: Record<Lang, T>, lang: Lang = current): T {
  return byLang[lang]
}

/**
 * Błąd z naszego kodu, którego treść jest już zdaniem dla zawodnika w jego języku – `friendlyError` pokazuje go wprost.
 * Rzucaj go zamiast `Error`, gdy komunikat ma trafić na ekran.
 */
export class UserError extends Error {
  readonly user = true
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'UserError'
  }
}
