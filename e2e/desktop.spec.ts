import { expect, test } from '@playwright/test'

test.describe('wersja na komputer (≥ 1024 px)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false })

  test('boczna nawigacja zamiast dolnego paska, Dziś w dwóch kolumnach', async ({ page }) => {
    await page.goto('/?today=2026-09-16')
    const side = page.getByRole('navigation', { name: 'Nawigacja główna' }).filter({ has: page.getByText('Alpy 2027') })
    await expect(side).toBeVisible()
    await expect(side.getByRole('link', { name: /Ustawienia/ })).toBeVisible()
    // dolny pasek jest ukryty na szerokim ekranie
    const bottom = page.locator('nav.fixed.inset-x-0.bottom-0')
    await expect(bottom).toBeHidden()
    // rower i siłownia obok siebie: karta siłowni nie jest pod kartą roweru
    const bike = await page.getByRole('heading', { name: 'Test progowy 30 min (LTHR)' }).boundingBox()
    const gym = await page.getByRole('heading', { name: 'Sesja A – Siła nóg (ciężka)' }).boundingBox()
    expect(bike && gym && gym.x > bike.x + 200).toBe(true)
    await page.screenshot({ path: 'test-results/desktop-today.png', fullPage: true })
  })

  test('tydzień jako siatka siedmiu kolumn', async ({ page }) => {
    await page.goto('/tydzien/2026-09-16?today=2026-09-16')
    const mon = await page.getByText('Pn', { exact: true }).boundingBox()
    const sun = await page.getByText('Nd', { exact: true }).boundingBox()
    expect(mon && sun && Math.abs(mon.y - sun.y) < 5 && sun.x > mon.x + 600).toBe(true)
    await page.screenshot({ path: 'test-results/desktop-week.png', fullPage: true })
  })

  test('ustawienia w dwóch kolumnach z przełącznikiem miernika', async ({ page }) => {
    await page.goto('/wiecej/ustawienia')
    await expect(page.getByText('Mam miernik mocy')).toBeVisible()
    await page.screenshot({ path: 'test-results/desktop-settings.png', fullPage: true })
  })
})
