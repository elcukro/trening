import clothingJson from '../../data/clothing.json'
import type { ClothingTable } from '@/engine/weather'
import { getLang, type Lang } from '@/i18n/core'

/** `data/clothing.json`: teksty polskie w `label`/`items`/`extras`, angielskie w polach `*_en` (docs/34 § 5). */
interface ClothingFile {
  bands: (ClothingTable['bands'][number] & { label_en: string; items_en: string[] })[]
  extras: ClothingTable['extras']
  extras_en: ClothingTable['extras']
}

const FILE = clothingJson as ClothingFile
const cache = new Map<Lang, ClothingTable>()

/** Tabela ubioru wg temperatury w danym języku (domyślnie bieżącym). */
export function loadClothing(lang: Lang = getLang()): ClothingTable {
  const found = cache.get(lang)
  if (found) return found
  const table: ClothingTable =
    lang === 'en'
      ? { bands: FILE.bands.map((b) => ({ max_c: b.max_c, label: b.label_en, items: b.items_en })), extras: FILE.extras_en }
      : { bands: FILE.bands.map((b) => ({ max_c: b.max_c, label: b.label, items: b.items })), extras: FILE.extras }
  cache.set(lang, table)
  return table
}
