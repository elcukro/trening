import { addDays, type ISODate } from './dates'

/**
 * Punkt wyjścia (pkt 0 planu usprawnień, docs/14): zestaw mierników z datą pierwszego pomiaru i bieżącą wartością.
 * Wartości bieżące liczymy z danych aplikacji (testy, check-iny, jazdy ze Stravy); użytkownik „zamraża” je jako
 * punkt wyjścia jednym dotknięciem, a jazdę odniesienia (30 km/h) wpisuje ręcznie.
 */

export type BaselineMetric = 'ftp_w' | 'lthr_bpm' | 'hr_max_bpm' | 'weight_kg' | 'resting_hr' | 'best20_kmh' | 'best60_kmh' | 'mmp20_w' | 'mmp60_w' | 'ref_speed_kmh' | 'ref_power_w' | 'decoupling_pct' | 'cadence_rpm'

export interface BaselineDef {
  id: BaselineMetric
  label: string
  unit: string
  decimals: number
  /** true = wzrost to postęp; false = spadek to postęp; null = bez oceny */
  higherIsBetter: boolean | null
  /** skąd bierze się wartość bieżąca */
  hint: string
  /** cel liczbowy (jeśli jest) */
  goal?: number
}

export const BASELINE_DEFS: BaselineDef[] = [
  { id: 'ftp_w', label: 'FTP', unit: 'W', decimals: 0, higherIsBetter: true, hint: 'ostatni test (albo szacunek z ustawień)', goal: 240 },
  { id: 'mmp20_w', label: 'Najlepsze 20 min (moc)', unit: 'W', decimals: 0, higherIsBetter: true, hint: 'z jazd z miernikiem, ostatnie 28 dni' },
  { id: 'mmp60_w', label: 'Najlepsze 60 min (moc)', unit: 'W', decimals: 0, higherIsBetter: true, hint: 'z jazd z miernikiem, ostatnie 28 dni' },
  { id: 'best20_kmh', label: 'Najlepsze 20 min (prędkość)', unit: 'km/h', decimals: 1, higherIsBetter: true, hint: 'z jazd ze Stravy, ostatnie 28 dni', goal: 30 },
  { id: 'best60_kmh', label: 'Najlepsze 60 min (prędkość)', unit: 'km/h', decimals: 1, higherIsBetter: true, hint: 'z jazd ze Stravy, ostatnie 28 dni', goal: 30 },
  { id: 'ref_speed_kmh', label: 'Jazda odniesienia – prędkość', unit: 'km/h', decimals: 1, higherIsBetter: true, hint: '20 min płasko, równo, na chwytach – wpisz ręcznie' },
  { id: 'ref_power_w', label: 'Jazda odniesienia – moc', unit: 'W', decimals: 0, higherIsBetter: null, hint: 'średnia moc tej samej jazdy (do estymacji CdA)' },
  { id: 'lthr_bpm', label: 'LTHR', unit: 'bpm', decimals: 0, higherIsBetter: null, hint: 'ostatni test (albo ustawienia)' },
  { id: 'hr_max_bpm', label: 'HRmax', unit: 'bpm', decimals: 0, higherIsBetter: null, hint: 'najwyższe tętno z jazd (albo ustawienia)' },
  { id: 'decoupling_pct', label: 'Rozprzężenie Pw:HR (Z2)', unit: '%', decimals: 1, higherIsBetter: false, hint: 'ostatnia jazda ≥ 40 min z mocą i tętnem; < 5 % = dobra baza' },
  { id: 'cadence_rpm', label: 'Kadencja', unit: 'rpm', decimals: 0, higherIsBetter: true, hint: 'średnia w ruchu, ostatnie 28 dni', goal: 78 },
  { id: 'resting_hr', label: 'Tętno spoczynkowe', unit: 'bpm', decimals: 0, higherIsBetter: false, hint: 'średnia z 7 dni check-inu' },
  { id: 'weight_kg', label: 'Masa', unit: 'kg', decimals: 1, higherIsBetter: false, hint: 'średnia z 7 dni check-inu', goal: 102 },
]

export interface BaselineEntryLike {
  metric: string
  date: ISODate
  value: number
  deleted_at?: string | null
}

export interface CurrentInputs {
  today: ISODate
  ftp: number | null
  lthr: number | null
  hrMaxSetting: number | null
  checkins: { date: ISODate; weight_kg: number | null; resting_hr: number | null }[]
  rides: { date: ISODate; moving_time_s: number; max_hr?: number | null; avg_cadence?: number | null; device_watts?: boolean | null; mmp_w?: Record<string, number | null> | null; best_speed_kmh?: Record<string, number | null> | null; decoupling_pct?: number | null }[]
  /** ile dni wstecz liczyć „najlepsze” (domyślnie 28) */
  windowDays?: number
}

function avgOf(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

/** Bieżące wartości mierników z danych aplikacji (null = brak danych). */
export function currentValues(inp: CurrentInputs): Partial<Record<BaselineMetric, number>> {
  const out: Partial<Record<BaselineMetric, number>> = {}
  const from = addDays(inp.today, -(inp.windowDays ?? 28))
  if (inp.ftp) out.ftp_w = inp.ftp
  if (inp.lthr) out.lthr_bpm = inp.lthr
  const recent = inp.rides.filter((r) => r.date >= from && r.date <= inp.today)
  const maxHr = Math.max(0, ...recent.map((r) => r.max_hr ?? 0))
  if (maxHr > 0 || inp.hrMaxSetting) out.hr_max_bpm = Math.max(maxHr, inp.hrMaxSetting ?? 0)
  const best = (pick: (r: CurrentInputs['rides'][number]) => number | null | undefined) => {
    const vals = recent.map(pick).filter((v): v is number => v != null && v > 0)
    return vals.length ? Math.max(...vals) : null
  }
  const mmp20 = best((r) => (r.device_watts ? r.mmp_w?.['1200'] : null))
  const mmp60 = best((r) => (r.device_watts ? r.mmp_w?.['3600'] : null))
  const s20 = best((r) => r.best_speed_kmh?.['1200'])
  const s60 = best((r) => r.best_speed_kmh?.['3600'])
  if (mmp20) out.mmp20_w = mmp20
  if (mmp60) out.mmp60_w = mmp60
  if (s20) out.best20_kmh = s20
  if (s60) out.best60_kmh = s60
  const dec = recent.filter((r) => r.decoupling_pct != null && r.moving_time_s >= 2400).toSorted((a, b) => (a.date < b.date ? 1 : -1))[0]
  if (dec) out.decoupling_pct = dec.decoupling_pct as number
  const cadRides = recent.filter((r) => r.avg_cadence && r.avg_cadence > 0)
  if (cadRides.length) {
    const t = cadRides.reduce((a, r) => a + r.moving_time_s, 0)
    if (t > 0) out.cadence_rpm = Math.round(cadRides.reduce((a, r) => a + (r.avg_cadence as number) * r.moving_time_s, 0) / t)
  }
  const week = inp.checkins.filter((c) => c.date > addDays(inp.today, -7) && c.date <= inp.today)
  const w = avgOf(week.map((c) => c.weight_kg).filter((v): v is number => v != null))
  const rhr = avgOf(week.map((c) => c.resting_hr).filter((v): v is number => v != null))
  if (w != null) out.weight_kg = Math.round(w * 10) / 10
  if (rhr != null) out.resting_hr = Math.round(rhr)
  return out
}

export interface BaselineRow {
  def: BaselineDef
  baseline: { value: number; date: ISODate } | null
  current: number | null
  /** różnica teraz − punkt wyjścia (w jednostce miernika) */
  delta: number | null
  /** czy zmiana jest na plus (null gdy bez oceny albo bez danych) */
  improved: boolean | null
}

/** Tabela „Punkt wyjścia”: pierwszy (najstarszy) zapis każdego miernika vs wartość bieżąca. */
export function baselineTable(entries: BaselineEntryLike[], current: Partial<Record<BaselineMetric, number>>): BaselineRow[] {
  const live = entries.filter((e) => !e.deleted_at).toSorted((a, b) => (a.date < b.date ? -1 : 1))
  return BASELINE_DEFS.map((def) => {
    const first = live.find((e) => e.metric === def.id)
    // wartości wpisywane ręcznie (jazda odniesienia) nie mają automatycznej „bieżącej” – bierzemy ostatni zapis
    const manualCurrent = def.id === 'ref_speed_kmh' || def.id === 'ref_power_w' ? live.filter((e) => e.metric === def.id).at(-1) : undefined
    const cur = current[def.id] ?? (manualCurrent && manualCurrent !== first ? manualCurrent.value : null)
    const baseline = first ? { value: first.value, date: first.date } : null
    const delta = baseline && cur != null ? Math.round((cur - baseline.value) * 10 ** def.decimals) / 10 ** def.decimals : null
    const improved = delta == null || def.higherIsBetter == null || delta === 0 ? null : def.higherIsBetter ? delta > 0 : delta < 0
    return { def, baseline, current: cur, delta, improved }
  })
}

/** Moc potrzebna na stałą prędkość (płasko, bez wiatru): opór toczenia + aerodynamika, z drivetrainem 3 %. */
export function powerForSpeed(kmh: number, totalMassKg: number, cda = 0.42, crr = 0.005, rho = 1.2): number {
  const v = kmh / 3.6
  const roll = crr * totalMassKg * 9.81 * v
  const aero = 0.5 * rho * cda * v ** 3
  return Math.round((roll + aero) / 0.97)
}

/** CdA z jazdy odniesienia (prędkość + moc + masa), przy założonym Crr. */
export function cdaFromRide(kmh: number, watts: number, totalMassKg: number, crr = 0.005, rho = 1.2): number | null {
  const v = kmh / 3.6
  if (v <= 0 || watts <= 0) return null
  const roll = crr * totalMassKg * 9.81 * v
  const aero = watts * 0.97 - roll
  if (aero <= 0) return null
  return Math.round((aero / (0.5 * rho * v ** 3)) * 1000) / 1000
}

/** Cel 30 km/h: moc potrzebna i FTP wymagane (2–3 h ≈ 85 % FTP), z CdA z jazdy odniesienia albo domyślnego. */
export function goalPower(totalMassKg: number, targetKmh = 30, cda: number | null = null): { watts: number; ftp: number; cda: number } {
  const c = cda ?? 0.42
  const watts = powerForSpeed(targetKmh, totalMassKg, c)
  return { watts, ftp: Math.round(watts / 0.85), cda: c }
}
