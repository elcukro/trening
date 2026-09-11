/** Kolory stref – spójne w osi czasu, tabeli stref i bibliotece. */
export const ZONE_COLORS: Record<string, string> = {
  Z1: 'bg-slate-400',
  Z2: 'bg-sky-500',
  Z3: 'bg-emerald-500',
  SS: 'bg-yellow-400',
  Z4: 'bg-orange-500',
  THR: 'bg-red-500',
  Z5a: 'bg-rose-600',
  Z5b: 'bg-fuchsia-600',
  Z5c: 'bg-purple-700',
}

export const ZONE_TEXT: Record<string, string> = {
  Z1: 'text-slate-500',
  Z2: 'text-sky-600 dark:text-sky-400',
  Z3: 'text-emerald-600 dark:text-emerald-400',
  SS: 'text-yellow-600 dark:text-yellow-300',
  Z4: 'text-orange-600 dark:text-orange-400',
  THR: 'text-red-600 dark:text-red-400',
  Z5a: 'text-rose-600 dark:text-rose-400',
  Z5b: 'text-fuchsia-600 dark:text-fuchsia-400',
  Z5c: 'text-purple-700 dark:text-purple-400',
}

export function zoneColor(zone: string): string {
  return ZONE_COLORS[zone] ?? 'bg-slate-300'
}

export function zoneText(zone: string): string {
  return ZONE_TEXT[zone] ?? 'text-slate-500'
}
