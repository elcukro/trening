import { expect, test, type Page } from '@playwright/test'

/**
 * Decoupling v1 (docs/18): konto z programem FTP 300 nie może zobaczyć niczego z programu alpejskiego –
 * ani słów, ani ekranów. Program przełączamy tak jak użytkownik: w Ustawieniach.
 */

// słowa i liczby, które należą wyłącznie do programu alpejskiego
const LEAKS = [/Alpy/, /Alpach/, /przełęcz/i, /Łódź/, /Checkpoint/, /Dogma/, /30 km\/h/, /Sesja B/, /do wyjazdu/, /Data wyjazdu/, /53 tygodni/]

async function expectNoLeaks(page: Page, where: string) {
  // bez list wyboru – przełącznik programu w Ustawieniach słusznie wymienia oba programy
  const text = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement
    clone.querySelectorAll('select').forEach((el) => el.remove())
    document.body.appendChild(clone)
    const t = clone.innerText
    clone.remove()
    return t
  })
  for (const re of LEAKS) expect(text, `${where}: ${re}`).not.toMatch(re)
}

async function switchToFtp300(page: Page) {
  await page.goto('/wiecej/ustawienia?today=2026-11-04')
  await page.getByRole('combobox', { name: 'Program' }).selectOption('ftp300')
  await expect(page.getByText('Program przełączony')).toBeVisible()
}

test.describe('pełna aplikacja na komputerze', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false })
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('trening:full-ui', '1'))
    await switchToFtp300(page)
  })

  test('żadnych literałów programu alpejskiego, bez Sprzętu i Wyjazdu', async ({ page }) => {
    const pages = ['/', '/tydzien', '/kalendarz', '/wiecej', '/wiecej/sezon', '/wiecej/ustawienia', '/biblioteka/zasady', '/biblioteka/strefy']
    for (const path of pages) {
      await page.goto(`${path}?today=2026-11-04`)
      await expect(page.getByRole('main')).toBeVisible()
      await page.waitForTimeout(300)
      await expectNoLeaks(page, path)
    }
    const side = page.getByRole('navigation', { name: 'Nawigacja główna' }).filter({ has: page.getByText('FTP 300').first() })
    await expect(side).toBeVisible()
    await expect(side.getByText(/^za \d+ dni/)).toBeVisible()
    await expect(side.getByRole('link', { name: 'Sprzęt' })).toHaveCount(0)
    await expect(side.getByRole('link', { name: 'Wyjazd' })).toHaveCount(0)
    // bezpośredni adres ekranu wyłączonego w programie wraca do „Więcej”
    await page.goto('/wiecej/wyjazd?today=2026-11-04')
    await expect(page).toHaveURL(/\/wiecej(\?|$)/)
    await page.goto('/wiecej/ustawienia?today=2026-11-04')
    await expect(page.getByText('Koniec programu', { exact: true })).toBeVisible()
    await expect(page.getByText('Dni siłowni')).toHaveCount(0)
  })
})

test.describe('uproszczony interfejs', () => {
  test.use({ viewport: { width: 390, height: 780 }, isMobile: false, hasTouch: true })
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('trening:full-ui', '1')
      sessionStorage.setItem('trening:no-account', '1')
    })
    await switchToFtp300(page)
  })

  test('Dziś, Tydzień, Postęp i Więcej bez literałów programu alpejskiego', async ({ page }) => {
    for (const path of ['/i', '/i/tydzien', '/i/postep', '/i/wiecej']) {
      await page.goto(`${path}?today=2026-11-04`)
      await page.waitForTimeout(500)
      await expectNoLeaks(page, path)
    }
    await expect(page.getByText('Ustaw miejscowość prognozy')).toBeVisible()
  })
})
