import { expect, test } from '@playwright/test'

test.describe('kalendarz na telefonie', () => {
  test('siatka miesiąca, nawigacja, dzień otwiera ekran dnia', async ({ page }) => {
    await page.goto('/kalendarz?today=2026-09-16')
    await expect(page.getByRole('heading', { name: 'wrzesień 2026' })).toBeVisible()
    // nagłówek dni tygodnia od poniedziałku
    await expect(page.getByText('Pn', { exact: true })).toBeVisible()
    // podsumowanie miesiąca (jazdy, godziny, siłownia)
    await expect(page.getByText(/jazd · .*h · siłownia/)).toBeVisible()
    // dni przed startem planu są wyszarzone, nie są linkami
    await expect(page.getByLabel('2026-09-01 – poza planem')).toBeVisible()
    await page.screenshot({ path: 'test-results/mobile-calendar.png', fullPage: true })
    // miesiąc naprzód i z powrotem do dziś
    await page.getByRole('button', { name: 'Następny miesiąc' }).click()
    await expect(page.getByRole('heading', { name: 'październik 2026' })).toBeVisible()
    await expect(page).toHaveURL(/\/kalendarz\/2026-10/)
    await page.getByRole('button', { name: 'Dziś' }).click()
    await expect(page.getByRole('heading', { name: 'wrzesień 2026' })).toBeVisible()
    // kliknięcie dnia otwiera ekran dnia z planem
    await page.getByRole('link', { name: 'sobota 2026-09-26' }).click()
    await expect(page).toHaveURL(/\/dzien\/2026-09-26/)
    await expect(page.getByText('Test FTP 20 min (moc)')).toBeVisible()
  })

  test('status wykonania z logów jest widoczny w komórce', async ({ page }) => {
    await page.goto('/?today=2026-09-15')
    await page.getByRole('button', { name: '✓ Wykonane' }).click()
    await page.getByRole('button', { name: 'Zapisz' }).click()
    await expect(page.getByText('Wykonane', { exact: true })).toBeVisible()
    await page.goto('/kalendarz?today=2026-09-15')
    const cell = page.getByRole('link', { name: 'wtorek 2026-09-15' })
    // kropka istnieje w wariancie na komputer (ukryta) i na telefon – liczymy tylko widoczną
    await expect(cell.locator('[aria-label="wykonane"]:visible')).toHaveCount(1)
  })

  test('Kalendarz jest w „Więcej”', async ({ page }) => {
    await page.goto('/wiecej')
    await page.getByRole('link', { name: /Kalendarz/ }).click()
    await expect(page).toHaveURL(/\/kalendarz/)
  })
})

test.describe('kalendarz na komputerze', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false })

  test('nazwy treningów, znaczniki i pasek tygodnia w siatce', async ({ page }) => {
    await page.goto('/kalendarz/2027-05?today=2027-05-12')
    await expect(page.getByRole('heading', { name: 'maj 2027' })).toBeVisible()
    // pełne nazwy dni tygodnia na szerokim ekranie
    await expect(page.getByText('poniedziałek', { exact: true })).toBeVisible()
    // weekend w górach: nazwa jazdy i znacznik tekstem
    await expect(page.getByText('Góry', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Sesja C', { exact: true }).first()).toBeVisible()
    // pasek tygodnia prowadzi do widoku tygodnia
    const rail = page.getByRole('link', { name: /^Tydzień 35 · / })
    await expect(rail).toBeVisible()
    // siedem kolumn dni w jednym wierszu
    const mon = await page.getByText('poniedziałek', { exact: true }).boundingBox()
    const sun = await page.getByText('niedziela', { exact: true }).boundingBox()
    expect(mon && sun && Math.abs(mon.y - sun.y) < 5 && sun.x > mon.x + 700).toBe(true)
    await page.screenshot({ path: 'test-results/desktop-calendar.png', fullPage: true })
    await rail.click()
    await expect(page.getByRole('heading', { name: 'Tydzień 35' })).toBeVisible()
  })

  test('przeciągnięcie jazdy na dzień wolny i cofnięcie', async ({ page }) => {
    await page.goto('/kalendarz/2026-10?today=2026-10-05')
    const src = page.getByRole('link', { name: /środa 2026-10-07/ })
    const dst = page.getByRole('link', { name: /czwartek 2026-10-08/ })
    await expect(src).toContainText('Sweet spot')
    const a = (await src.boundingBox())!
    const b = (await dst.boundingBox())!
    // przytrzymanie „podnosi” trening, dopiero wtedy przeciągamy
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(450)
    await expect(page.getByText(/Przenoszę:/)).toBeVisible()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect(dst).toContainText('Sweet spot')
    await expect(src).not.toContainText('Sweet spot')
    await page.screenshot({ path: 'test-results/calendar-move.png', fullPage: true })
    // cofnięcie przywraca plan
    await page.getByRole('button', { name: /7\.10 → 8\.10/ }).click()
    await expect(src).toContainText('Sweet spot')
    await expect(dst).not.toContainText('Sweet spot')
  })

  test('sobota (zajęta) nie jest celem przeniesienia', async ({ page }) => {
    await page.goto('/kalendarz/2026-10?today=2026-10-05')
    const src = page.getByRole('link', { name: /środa 2026-10-07/ })
    const busy = page.getByRole('link', { name: /sobota 2026-10-10/ })
    const a = (await src.boundingBox())!
    const b = (await busy.boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(450)
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect(src).toContainText('Sweet spot')
    await expect(page.getByText(/Przenoszę:/)).toHaveCount(0)
  })
})
