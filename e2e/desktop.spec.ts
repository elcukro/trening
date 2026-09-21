import { expect, test } from '@playwright/test'

test.describe('wersja na komputer (≥ 1024 px)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false })

  test('boczna nawigacja zamiast dolnego paska, Dziś w dwóch kolumnach', async ({ page }) => {
    // faza III: dzień z jazdą i siłownią naraz (w fazach I–II akcent i siłownia są w różne dni)
    await page.goto('/?today=2027-03-03')
    const side = page.getByRole('navigation', { name: 'Nawigacja główna' }).filter({ has: page.getByText('Alpy 2027') })
    await expect(side).toBeVisible()
    await expect(side.getByRole('link', { name: /Ustawienia/ })).toBeVisible()
    await expect(side.getByRole('link', { name: /Kalendarz/ })).toBeVisible()
    // pasek sezonu z odliczaniem
    await expect(side.getByText('za 192 dni')).toBeVisible()
    // dolny pasek jest ukryty na szerokim ekranie
    const bottom = page.locator('nav.fixed.inset-x-0.bottom-0')
    await expect(bottom).toBeHidden()
    // treść wykorzystuje szerokość ekranu (ponad 1024 px razem z nawigacją)
    const main = await page.getByRole('main').boundingBox()
    expect(main && main.width > 1000).toBe(true)
    // rower i siłownia obok siebie: karta siłowni nie jest pod kartą roweru
    const bike = await page.getByRole('heading', { name: 'Próg pod górę 4×6 min' }).boundingBox()
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
    // profil po lewej, konto po prawej – na tej samej wysokości
    const profile = await page.getByRole('heading', { name: 'Profil' }).boundingBox()
    const account = await page.getByRole('heading', { name: /^Konto/ }).boundingBox()
    expect(profile && account && account.x > profile.x + 300 && Math.abs(profile.y - account.y) < 40).toBe(true)
    await page.screenshot({ path: 'test-results/desktop-settings.png', fullPage: true })
  })

  test('postęp i biblioteka w kolumnach', async ({ page }) => {
    await page.goto('/postep?today=2026-09-16')
    // punkt wyjścia i obciążenie (pkt 0 i 1 planu usprawnień) – karty z celem 30 km/h
    await expect(page.getByRole('heading', { name: 'Punkt wyjścia' })).toBeVisible()
    await expect(page.getByText('FTP na 30 km/h (2–3 h)')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Obciążenie (TSS)' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Moc', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Forma i zmęczenie' })).toBeVisible()
    const mass = await page.getByRole('heading', { name: 'Masa' }).boundingBox()
    const vol = await page.getByRole('heading', { name: /Objętość/ }).boundingBox()
    expect(mass && vol && vol.x > mass.x + 300).toBe(true)
    await page.screenshot({ path: 'test-results/desktop-progress.png', fullPage: true })
    await page.goto('/biblioteka')
    const a = await page.getByText('Sweet spot 2×20 min').boundingBox()
    expect(a && a.width < 500).toBe(true)
  })
})
