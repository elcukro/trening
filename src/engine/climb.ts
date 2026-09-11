/**
 * Kalkulator podjazdu (wzór z docs/00-kontekst-i-decyzje.md).
 * P = (m·g·v·sinθ + Crr·m·g·cosθ·v + ½·ρ·CdA·v³) / η
 */
export interface ClimbInput {
  riderKg: number
  bikeKg?: number
  watts: number
  km: number
  gradePct: number
}

export const CLIMB_CONST = { g: 9.81, crr: 0.005, rho: 1.15, cda: 0.45, eta: 0.97, bikeKg: 12 }

export function powerForSpeed(massKg: number, gradePct: number, vMs: number): number {
  const { g, crr, rho, cda, eta } = CLIMB_CONST
  const theta = Math.atan(gradePct / 100)
  const gravity = massKg * g * vMs * Math.sin(theta)
  const rolling = crr * massKg * g * Math.cos(theta) * vMs
  const aero = 0.5 * rho * cda * vMs ** 3
  return (gravity + rolling + aero) / eta
}

export function estimateClimb(input: ClimbInput): { minutes: number; kmh: number; wkg: number } {
  const mass = input.riderKg + (input.bikeKg ?? CLIMB_CONST.bikeKg)
  let lo = 0
  let hi = 30
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (powerForSpeed(mass, input.gradePct, mid) < input.watts) lo = mid
    else hi = mid
  }
  const v = (lo + hi) / 2
  const minutes = (input.km * 1000) / v / 60
  return { minutes, kmh: v * 3.6, wkg: input.watts / input.riderKg }
}

/** Moc potrzebna na zadaną prędkość (km/h) na podjeździe. */
export function powerForKmh(riderKg: number, gradePct: number, kmh: number, bikeKg = CLIMB_CONST.bikeKg): number {
  return powerForSpeed(riderKg + bikeKg, gradePct, kmh / 3.6)
}
