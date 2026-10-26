/**
 * Ikony PWA z jednego obrazu źródłowego `public/icon-src.png` (1024 px, pełne tło – iOS sam zaokrągla rogi).
 * Źródło powstaje w `scripts/fal-art.mjs` (`icon-bike` / `icon-coach`, styl 3D jak reszta /m) i jest wybierane ręcznie.
 * Skalowanie przez `sips` (macOS) – bez zależności.
 *
 * Aplikacja iOS (docs/26): ta sama ikona 1024 px (bez kanału alfa – wymóg App Store) i ekran startowy w kolorze tła `/m`
 * (#f2f2f7) bez logo – HIG: ekran startowy ma wyglądać jak pierwszy ekran, nie jak plansza.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

for (const [name, size] of [['pwa-192.png', 192], ['pwa-512.png', 512], ['apple-touch-icon.png', 180]]) {
  execFileSync('sips', ['-Z', String(size), 'public/icon-src.png', '--out', `public/${name}`], { stdio: 'ignore' })
}

/** PNG jednolitego koloru (RGB, bez alfy). */
function solidPng(size, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.alloc(1 + size * 3)
  for (let i = 0; i < size; i++) row.set([r, g, b], 1 + i * 3)
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const assets = 'ios/App/App/Assets.xcassets'
if (existsSync(assets)) {
  execFileSync('sips', ['-Z', '1024', '-s', 'format', 'png', 'public/icon-src.png', '--out', `${assets}/AppIcon.appiconset/AppIcon-512@2x.png`], { stdio: 'ignore' })
  const splash = solidPng(2732, [0xf2, 0xf2, 0xf7])
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) writeFileSync(`${assets}/Splash.imageset/${name}`, splash)
}
console.log('icons ok')
