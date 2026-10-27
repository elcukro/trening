import { expect, test } from '@playwright/test'

/**
 * Samonaprawa z `index.html` (docs/35 W1): plik kodu, który się nie wczytał (z pamięci SW przyszedł HTML zamiast JS),
 * raz na kartę wyrejestrowuje service workera, czyści pamięć i przeładowuje stronę – bez pętli przeładowań.
 */

const DAY = '/m?today=2026-10-26'

async function brokenScript(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const s = document.createElement('script')
    s.type = 'module'
    s.src = `/assets/brak-pliku-${Date.now()}.js`
    document.head.append(s)
  })
}

test('nieudany plik kodu → jedno przeładowanie z czystą pamięcią, drugi błąd już nie przeładowuje', async ({ page }) => {
  await page.goto(DAY)
  await expect(page.locator('#root')).not.toBeEmpty()
  expect(await page.evaluate(() => sessionStorage.getItem('trening:heal'))).toBeNull()

  const reload = page.waitForEvent('framenavigated')
  await brokenScript(page)
  await reload
  await expect(page.locator('#root')).not.toBeEmpty()
  expect(await page.evaluate(() => sessionStorage.getItem('trening:heal'))).toBe('1')

  let navigated = false
  page.on('framenavigated', () => (navigated = true))
  await brokenScript(page)
  await page.waitForTimeout(1500)
  expect(navigated).toBe(false)
})
