import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const svg = readFileSync('public/icon.svg', 'utf8')
const browser = await chromium.launch()
for (const [name, size] of [['pwa-192.png', 192], ['pwa-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<html><body style="margin:0;background:#0f172a">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false })
  writeFileSync(`public/${name}`, buf)
  await page.close()
}
await browser.close()
console.log('icons ok')
