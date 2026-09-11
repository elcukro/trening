import gearJson from '../../data/gear_tasks.json'
import packingJson from '../../data/packing_list.json'
import { z } from 'zod'

const GearTaskSchema = z.object({
  id: z.string(),
  week: z.number().int().nullable().optional(),
  due: z.string().nullable().optional(),
  bike: z.enum(['checkpoint', 'dogma', 'both']).nullable().optional(),
  title: z.string(),
  details: z.string(),
  cost_pln: z.number().optional(),
  recurring: z.string().optional(),
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

export type GearTask = z.infer<typeof GearTaskSchema>
export type PackingList = z.infer<typeof PackingSchema>
export type PackingItem = PackingList['items'][number]

let gear: GearTask[] | null = null
let packing: PackingList | null = null

export function loadGearTasks(): GearTask[] {
  gear ??= z.array(GearTaskSchema).parse(gearJson)
  return gear
}

export function loadPackingList(): PackingList {
  packing ??= PackingSchema.parse(packingJson)
  return packing
}

export const BIKE_LABEL: Record<string, string> = { checkpoint: 'Checkpoint', dogma: 'Dogma', both: 'Oba rowery' }

/** Stabilny klucz pozycji checklisty (nazwa bywa długa, ale jest unikalna w pliku). */
export function itemKey(item: PackingItem, index: number): string {
  return `${index}-${item.name.slice(0, 40).replace(/[^\w]+/g, '_')}`
}
