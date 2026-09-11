import { expect, test, type Page } from '@playwright/test'

async function fillNumber(page: Page, label: string, value: string) {
  await page.getByLabel(label).fill(value)
}

test('check-in zapisuje się i przetrwa przeładowanie', async ({ page }) => {
  await page.goto('/?today=2026-09-15')
  await page.getByRole('button', { name: /Poranny check-in/ }).click()
  await fillNumber(page, 'Waga (kg)', '104,8')
  await fillNumber(page, 'Tętno spoczynkowe', '54')
  await page.getByRole('radiogroup', { name: 'Sen' }).getByRole('radio', { name: '4' }).click()
  await page.getByRole('radiogroup', { name: 'Nogi' }).getByRole('radio', { name: '3' }).click()
  await page.getByRole('radiogroup', { name: 'Motywacja' }).getByRole('radio', { name: '5' }).click()
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('104,8 kg')).toBeVisible()
  await page.reload()
  await expect(page.getByText('104,8 kg')).toBeVisible()
  await expect(page.getByText('4/3/5')).toBeVisible()
})

test('oznaczenie jazdy jako wykonanej z danymi', async ({ page }) => {
  await page.goto('/?today=2026-09-15')
  await page.getByRole('button', { name: '✓ Wykonane' }).click()
  await fillNumber(page, 'RPE 1–10', '4')
  await fillNumber(page, 'Dystans (km)', '28,5')
  await fillNumber(page, 'Śr. tętno', '132')
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('Wykonane', { exact: true })).toBeVisible()
  await expect(page.getByText('28,5 km')).toBeVisible()
  await expect(page.getByText('132 bpm')).toBeVisible()
})

test('wynik testu LTHR: strefy od następnego dnia (R11)', async ({ page }) => {
  await page.goto('/?today=2026-09-16')
  await expect(page.getByRole('heading', { name: 'Wynik testu' })).toBeVisible()
  await fillNumber(page, 'Śr. tętno z minut 10–30', '160')
  await fillNumber(page, 'Śr. prędkość (km/h)', '31,2')
  await expect(page.getByText('LTHR = 160 bpm')).toBeVisible()
  await page.getByRole('button', { name: 'Zapisz wynik testu' }).click()
  await expect(page.getByText(/LTHR 160 bpm/)).toBeVisible()
  // ten sam dzień – jeszcze RPE
  await expect(page.getByText(/Zrób test i wpisz LTHR/)).toBeVisible()
  // następny akcent – bpm
  await page.goto('/?today=2026-09-23')
  await expect(page.getByText('147–154 bpm').first()).toBeVisible()
  await page.goto('/postep?today=2026-09-23')
  await expect(page.getByText('LTHR bpm')).toBeVisible()
  await expect(page.getByText('160', { exact: true }).first()).toBeVisible()
})

test('tryb siłowni: serie, timer przerwy, podsumowanie, status', async ({ page }) => {
  await page.goto('/?today=2026-09-16')
  await page.getByRole('link', { name: 'Start sesji' }).click()
  await expect(page.getByRole('heading', { name: 'Sesja A – Siła nóg (ciężka)' })).toBeVisible()
  await page.getByRole('button', { name: '▶ Start sesji' }).click()
  // rozgrzewka: 2 serie do odhaczenia
  await expect(page.getByRole('heading', { name: 'Obwód mobilności' })).toBeVisible()
  await page.getByRole('button', { name: /Zalicz serię/ }).click()
  await page.getByRole('button', { name: /Zalicz serię/ }).click()
  // przysiad: seria 1
  await expect(page.getByRole('heading', { name: 'Przysiad ze sztangą na plecach' })).toBeVisible()
  await expect(page.getByText('Seria 1 z 2')).toBeVisible()
  await expect(page.getByText(/ustal ciężar startowy/)).toBeVisible()
  await page.getByLabel('kg').fill('60')
  await page.getByLabel('powt.').fill('10')
  await page.getByLabel('RIR').fill('4')
  await page.getByRole('button', { name: /Zalicz serię/ }).click()
  await expect(page.getByRole('dialog', { name: 'Przerwa' })).toBeVisible()
  await expect(page.getByText(/^1:5\d$/)).toBeVisible()
  await page.getByRole('button', { name: 'Pomiń' }).click()
  await expect(page.getByText('Seria 2 z 2')).toBeVisible()
  await expect(page.getByLabel('kg')).toHaveValue('60')
  await page.getByRole('button', { name: /Zalicz serię/ }).click()
  await page.getByRole('button', { name: 'Pomiń' }).click()
  await page.screenshot({ path: 'test-results/gym-mode.png', fullPage: true })
  // przeładowanie – sesja trwa, serie zapisane
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Martwy ciąg rumuński (RDL)' })).toBeVisible()
  await page.getByRole('button', { name: 'Podsumuj' }).click()
  await expect(page.getByRole('heading', { name: 'Podsumowanie' })).toBeVisible()
  await expect(page.getByText('60×10, 60×10')).toBeVisible()
  await expect(page.getByText(/e1RM ≈ 80 kg/)).toBeVisible()
  await page.getByRole('button', { name: '✓ Zakończ: wykonane' }).click()
  await expect(page.getByText('Wykonane', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Otwórz sesję' })).toBeVisible()
  // Postęp: siła
  await page.goto('/postep?today=2026-09-16')
  await expect(page.getByText('Przysiad', { exact: true })).toBeVisible()
  await expect(page.getByText(/80 kg/).first()).toBeVisible()
})

test('kalkulator podjazdu i konto bez konfiguracji', async ({ page }) => {
  await page.goto('/postep')
  await expect(page.getByRole('heading', { name: 'Kalkulator podjazdu' })).toBeVisible()
  await expect(page.getByText(/^\d+ min$/).first()).toBeVisible()
  await page.goto('/wiecej/ustawienia')
  // bez env: komunikat o braku konfiguracji; z env (.env.local): formularz magic link
  await expect(page.getByText(/Brak konfiguracji Supabase/).or(page.getByRole('button', { name: 'Wyślij link logowania' }))).toBeVisible()
  await expect(page.getByRole('button', { name: 'Eksport JSON' })).toBeVisible()
})
