import { expect, test } from '@playwright/test'

test('Dziś 01.10.2026: tydzień 3, akcent sweet spot w czwartek; 30.09 Sesja A', async ({ page }) => {
  await page.goto('/?today=2026-10-01')
  await expect(page.getByRole('heading', { name: 'Tydzień 3' })).toBeVisible()
  await expect(page.getByText('Sweet spot 2×12 min')).toBeVisible()
  await expect(page.getByText('Dzień ciężki: bez deficytu, paliwo na trening')).toBeVisible()
  await expect(page.getByText('345 dni do wyjazdu')).toBeVisible()
  await expect(page.getByText(/Zrób test i wpisz LTHR/)).toBeVisible()
  await page.screenshot({ path: 'test-results/today-2026-10-01.png', fullPage: true })
  await page.goto('/?today=2026-09-30')
  await expect(page.getByText('Sesja A – Siła nóg (ciężka)')).toBeVisible()
  await expect(page.getByText('Przysiad ze sztangą na plecach')).toBeVisible()
  await expect(page.getByText('3×10 · RIR 3 · 120 s').first()).toBeVisible()
  await expect(page.getByText('Dzień lekki: deficyt ok. 500 kcal')).toBeVisible()
})

test('Dziś 15.05.2027: weekend w górach', async ({ page }) => {
  await page.goto('/?today=2027-05-15')
  await expect(page.getByRole('heading', { name: 'Dzień w górach' })).toBeVisible()
  await expect(page.getByText(/Karkonosze/)).toBeVisible()
  await expect(page.getByText('4 h').first()).toBeVisible()
})

test('Tydzień: nawigacja i suma godzin', async ({ page }) => {
  await page.goto('/tydzien/2026-09-16?today=2026-09-16')
  await expect(page.getByRole('heading', { name: 'Tydzień 1' })).toBeVisible()
  await expect(page.getByText(/5,3\s*h/)).toBeVisible()
  await expect(page.getByText(/siłownia 0\/2/)).toBeVisible()
  await page.getByRole('button', { name: '›' }).click()
  await expect(page.getByRole('heading', { name: 'Tydzień 2' })).toBeVisible()
  await page.screenshot({ path: 'test-results/week.png', fullPage: true })
})

test('Ustawienia: LTHR 160 daje bpm na ekranie Dziś', async ({ page }) => {
  await page.goto('/wiecej/ustawienia?today=2026-10-01')
  await page.getByLabel('LTHR (bpm)').fill('160')
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByRole('button', { name: 'Zapisano ✓' })).toBeVisible()
  await page.goto('/?today=2026-10-01')
  await expect(page.getByText('Sweet spot 2×12 min')).toBeVisible()
  await expect(page.getByText('147–154 bpm').first()).toBeVisible()
  await expect(page.getByText(/Zrób test i wpisz LTHR/)).toHaveCount(0)
})

test('Ustawienia: zmiana daty wyjazdu pokazuje podgląd R14', async ({ page }) => {
  await page.goto('/wiecej/ustawienia')
  await page.getByLabel('Data wyjazdu').fill('2027-09-25')
  await expect(page.getByText('Podgląd zmian (R14): 55 tygodni')).toBeVisible()
  await expect(page.getByText('14 tyg. od 26.04.2027')).toBeVisible()
  await page.getByLabel('Data wyjazdu').fill('2027-05-01')
  await expect(page.getByText(/za wcześnie/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zapisz' })).toBeDisabled()
})

test('Biblioteka, strefy, zasady, sezon', async ({ page }) => {
  await page.goto('/biblioteka')
  await expect(page.getByText('Sweet spot 2×20 min')).toBeVisible()
  await page.getByRole('button', { name: 'Ćwiczenia' }).click()
  await page.getByText('Przysiad ze sztangą na plecach').click()
  await expect(page.getByRole('heading', { name: 'Technika' })).toBeVisible()
  await page.goto('/biblioteka/strefy')
  await expect(page.getByText('Sweet spot').first()).toBeVisible()
  // kolumna W: Z2 z FTP 220 W (szacunek) = 56–75 % → 123–165
  await expect(page.getByRole('cell', { name: '123–165' })).toBeVisible()
  await page.goto('/biblioteka/zasady')
  await expect(page.getByText('Zmiana daty wyjazdu')).toBeVisible()
  await page.goto('/wiecej/sezon?today=2026-09-16')
  await expect(page.getByText('Weekend w górach #1').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/season.png', fullPage: true })
})

test('PWA: manifest i service worker', async ({ page }) => {
  await page.goto('/')
  const manifest = page.locator('link[rel="manifest"]')
  await expect(manifest).toHaveAttribute('href', /manifest/)
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  const res = await page.request.get('/sw.js')
  expect(res.ok()).toBeTruthy()
})

test('przełącznik motywu: ciemny i z powrotem jak system', async ({ page }) => {
  await page.goto('/wiecej/ustawienia')
  await page.getByRole('radio', { name: 'Ciemny' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/) // zapamiętane
  await page.getByRole('radio', { name: 'Jasny' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})
