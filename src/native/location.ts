import { Geolocation } from '@capacitor/geolocation'

/**
 * Bieżąca pozycja do prognozy pogody (docs/27 § 1 pkt 12) – jednorazowo, „przy używaniu aplikacji”, bez śledzenia.
 * W aplikacji iOS przez Core Location (opis uprawnienia w Info.plist), na webie przez `navigator.geolocation`
 * (implementacja webowa wtyczki). Dokładność do ~1 km wystarcza – współrzędne zaokrąglamy jak przy wyszukiwaniu.
 */
export async function currentPosition(): Promise<{ lat: number; lon: number }> {
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60 * 1000 })
    return { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/denied|permission|not authorized|User denied/i.test(msg)) {
      throw new Error('Brak zgody na lokalizację. Włączysz ją w Ustawieniach iPhone’a → Trening → Lokalizacja („Podczas używania aplikacji”).', { cause: e })
    }
    throw new Error('Nie udało się ustalić lokalizacji. Spróbuj na zewnątrz albo wpisz miejscowość.', { cause: e })
  }
}
