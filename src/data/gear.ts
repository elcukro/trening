import templatesJson from '../../data/gear_templates.json'
import packingJson from '../../data/packing_list.json'
import { z } from 'zod'
import type { GearTemplate } from '@/engine/gear'

/** Szablon serwisu cyklicznego – wspólny dla wszystkich; zadania powstają z rowerów użytkownika. */
const GearTemplateSchema = z.object({
  id: z.string(),
  every_days: z.number().int().positive(),
  title: z.string(),
  details: z.string(),
  kinds: z.array(z.enum(['road', 'gravel', 'mtb', 'tt', 'other'])).optional(),
  brakes: z.enum(['disc', 'rim']).optional(),
})

const PackingSchema = z.object({
  system: z.string(),
  bags: z.array(z.object({ id: z.string(), name: z.string(), content: z.string() })),
  items: z.array(
    z.object({
      cat: z.string(),
      name: z.string(),
      price_pln: z.number().nullable().optional(),
      url: z.string().nullable().optional(),
      /** „biwak” = pozycja tylko dla wariantu biwakowego */
      only: z.string().nullable().optional(),
    }),
  ),
})

export type PackingList = z.infer<typeof PackingSchema>
export type PackingItem = PackingList['items'][number]

let templates: GearTemplate[] | null = null
let packing: PackingList | null = null

export function loadGearTemplates(): GearTemplate[] {
  templates ??= z.array(GearTemplateSchema).parse(templatesJson)
  return templates
}

export function loadPackingList(): PackingList {
  packing ??= PackingSchema.parse(packingJson)
  return packing
}


/** Stabilny klucz pozycji checklisty (nazwa bywa długa, ale jest unikalna w pliku). */
export function itemKey(item: PackingItem, index: number): string {
  return `${index}-${item.name.slice(0, 40).replace(/[^\w]+/g, '_')}`
}
