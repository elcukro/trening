import { registerPlugin } from '@capacitor/core'
import type { HealthDay } from '@/day/health'
import { isNative } from './platform'

/** Wtyczka Swift `native/trening-health` (HealthKit) – metody jak w `TreningHealthPlugin.swift`. */
interface TreningHealthPlugin {
  isAvailable(): Promise<{ available: boolean }>
  requestAuthorization(): Promise<{ granted: boolean }>
  readDay(options: { date: string }): Promise<HealthDay>
}

const plugin = registerPlugin<TreningHealthPlugin>('TreningHealth')

/**
 * Apple Health (docs/27 § 2). Na webie i bez HealthKitu (iPad bez Zdrowia) wszystko zwraca „brak” – reszta aplikacji
 * działa jak bez Zdrowia. Odczyt nie rzuca: brak uprawnień wygląda jak brak danych (iOS nie mówi, czy odmówiono).
 */
export const health = {
  async available(): Promise<boolean> {
    if (!isNative()) return false
    try {
      return (await plugin.isAvailable()).available
    } catch {
      return false
    }
  },
  /** Systemowe okno uprawnień – iOS pokazuje je tylko raz; zmiana później w Ustawieniach → Zdrowie → Dostęp do danych. */
  async authorize(): Promise<boolean> {
    if (!isNative()) return false
    try {
      return (await plugin.requestAuthorization()).granted
    } catch {
      return false
    }
  },
  async readDay(date: string): Promise<HealthDay | null> {
    if (!isNative()) return null
    try {
      return await plugin.readDay({ date })
    } catch {
      return null
    }
  },
}
