import { getLang, type Lang } from './core'
import { en, pl, type Messages } from './dict'

export * from './core'
export type { Messages }

const DICTS: Record<Lang, Messages> = { pl, en }

/** Teksty w bieżącym języku – w kodzie bez React (silnik, synchronizacja, formatery). W komponentach `useT()`. */
export function t(lang: Lang = getLang()): Messages {
  return DICTS[lang]
}
