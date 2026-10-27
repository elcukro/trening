import templatesJson from '../../data/gear_templates.json'
import packingJson from '../../data/packing_list.json'
import { z } from 'zod'
import type { GearTemplate } from '@/engine/gear'
import { getLang, type Lang } from '@/i18n/core'

/** Szablon serwisu cyklicznego – wspólny dla wszystkich; zadania powstają z rowerów użytkownika. */
const GearTemplateSchema = z.object({
  id: z.string(),
  every_days: z.number().int().positive(),
  title: z.string(),
  details: z.string(),
  title_en: z.string(),
  details_en: z.string(),
  kinds: z.array(z.enum(['road', 'gravel', 'mtb', 'tt', 'other'])).optional(),
  brakes: z.enum(['disc', 'rim']).optional(),
})

const PackingSchema = z.object({
  system: z.string(),
  system_en: z.string(),
  bags: z.array(z.object({ id: z.string(), name: z.string(), content: z.string(), name_en: z.string(), content_en: z.string() })),
  items: z.array(
    z.object({
      cat: z.string(),
      cat_en: z.string(),
      name: z.string(),
      name_en: z.string(),
      price_pln: z.number().nullable().optional(),
      url: z.string().nullable().optional(),
      /** „biwak” = pozycja tylko dla wariantu biwakowego */
      only: z.string().nullable().optional(),
    }),
  ),
})

type PackingFile = z.infer<typeof PackingSchema>

/** Lista pakowania w jednym języku. `key_name` = nazwa polska – z niej powstaje klucz zapisu (`itemKey`). */
export interface PackingList {
  system: string
  bags: { id: string; name: string; content: string }[]
  items: { cat: string; name: string; key_name: string; price_pln?: number | null; url?: string | null; only?: string | null }[]
}
export type PackingItem = PackingList['items'][number]

let templatesFile: z.infer<typeof GearTemplateSchema>[] | null = null
let packingFile: PackingFile | null = null
const templates = new Map<Lang, GearTemplate[]>()
const packing = new Map<Lang, PackingList>()

/** Szablony serwisu cyklicznego w danym języku (pola `*_en` w `data/gear_templates.json`, docs/34 § 5). */
export function loadGearTemplates(lang: Lang = getLang()): GearTemplate[] {
  templatesFile ??= z.array(GearTemplateSchema).parse(templatesJson)
  let out = templates.get(lang)
  if (!out) {
    out = templatesFile.map(({ title_en, details_en, ...t }) => (lang === 'en' ? { ...t, title: title_en, details: details_en } : t))
    templates.set(lang, out)
  }
  return out
}

/** Lista pakowania w danym języku (pola `*_en` w `data/packing_list.json`). */
export function loadPackingList(lang: Lang = getLang()): PackingList {
  packingFile ??= PackingSchema.parse(packingJson)
  let out = packing.get(lang)
  if (!out) {
    const en = lang === 'en'
    const f = packingFile
    out = {
      system: en ? f.system_en : f.system,
      bags: f.bags.map((b) => ({ id: b.id, name: en ? b.name_en : b.name, content: en ? b.content_en : b.content })),
      items: f.items.map(({ cat, cat_en, name, name_en, ...rest }) => ({ ...rest, cat: en ? cat_en : cat, name: en ? name_en : name, key_name: name })),
    }
    packing.set(lang, out)
  }
  return out
}

/** Stabilny klucz pozycji checklisty (z polskiej nazwy – bywa długa, ale jest unikalna w pliku; ten sam w każdym języku). */
export function itemKey(item: PackingItem, index: number): string {
  return `${index}-${item.key_name.slice(0, 40).replace(/[^\w]+/g, '_')}`
}
