// Wspólny dla testów dekodera FIT i jazd z wgranego pliku (docs/33 § 7, § 7a).
/** Minimalny plik FIT: definicja `record` (20), opcjonalnie pola deweloperskie i skompresowane znaczniki czasu. */
export function buildFit(opts: { seconds: number; power: (i: number) => number; dev?: boolean; compressedEvery?: number; bigEndian?: boolean; altitude?: (i: number) => number; speed?: (i: number) => number; hr?: (i: number) => number; t0?: number }): Uint8Array {
  const out: number[] = []
  const le = !opts.bigEndian
  const u16 = (v: number) => (le ? [v & 0xff, (v >> 8) & 0xff] : [(v >> 8) & 0xff, v & 0xff])
  const u32 = (v: number) => (le ? [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff] : [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff])
  // definicja: lokalny typ 0; pola: 253 timestamp u32, 7 power u16, 3 hr u8, 4 cadence u8, 6 speed u16, 5 distance u32
  const fields = [
    [253, 4, 0x86],
    [7, 2, 0x84],
    [3, 1, 0x02],
    [4, 1, 0x02],
    [6, 2, 0x84],
    [5, 4, 0x86],
    ...(opts.altitude ? [[2, 2, 0x84]] : []),
  ]
  out.push(0x40 | (opts.dev ? 0x20 : 0), 0, le ? 0 : 1, ...u16(20), fields.length, ...fields.flat())
  if (opts.dev) out.push(1, 0, 2, 0) // jedno pole deweloperskie, 2 bajty
  // definicja bez znacznika czasu (lokalny typ 1) do skompresowanych nagłówków
  const fieldsC = fields.slice(1)
  out.push(0x40 | 1, 0, le ? 0 : 1, ...u16(20), fieldsC.length, ...fieldsC.flat())
  const t0 = opts.t0 ?? 1_100_000_000 // sekundy od epoki FIT
  let dist = 0
  for (let i = 0; i < opts.seconds; i++) {
    const p = opts.power(i)
    const v = opts.speed ? opts.speed(i) : 8.5
    const speed = Math.round(v * 1000)
    dist += v * 100
    const alt = opts.altitude ? u16(Math.round((opts.altitude(i) + 500) * 5)) : []
    const body = [...u16(p), opts.hr ? opts.hr(i) : 140, i % 7 === 0 ? 0xff : 88, ...u16(speed), ...u32(Math.round(dist - v * 100)), ...alt]
    if (opts.compressedEvery && i % opts.compressedEvery !== 0) {
      out.push(0x80 | (1 << 5) | ((t0 + i) & 0x1f), ...body)
    } else {
      out.push(0x00, ...u32(t0 + i), ...body)
      if (opts.dev) out.push(0xaa, 0xbb)
    }
  }
  const header = [14, 0x20, 0x08, 0x08, out.length & 0xff, (out.length >> 8) & 0xff, (out.length >> 16) & 0xff, (out.length >> 24) & 0xff, 0x2e, 0x46, 0x49, 0x54, 0, 0]
  return new Uint8Array([...header, ...out, 0, 0])
}
