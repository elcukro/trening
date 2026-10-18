/**
 * Ikony PWA z jednego obrazu źródłowego `public/icon-src.png` (1024 px, pełne tło – iOS sam zaokrągla rogi).
 * Źródło powstaje w `scripts/fal-art.mjs` (`icon-bike` / `icon-coach`, styl 3D jak reszta /m) i jest wybierane ręcznie.
 * Skalowanie przez `sips` (macOS) – bez zależności.
 */
import { execFileSync } from 'node:child_process'
for (const [name, size] of [['pwa-192.png', 192], ['pwa-512.png', 512], ['apple-touch-icon.png', 180]]) {
  execFileSync('sips', ['-Z', String(size), 'public/icon-src.png', '--out', `public/${name}`], { stdio: 'ignore' })
}
console.log('icons ok')
