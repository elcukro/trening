import { expect, test, type Page } from '@playwright/test'

/**
 * Dietetyk Beta 1 (docs/25): karta Jedzenie w `/m` tylko z `diet_enabled`, budżet po uzupełnieniu wzrostu i roku urodzenia,
 * etykieta produktu → ilość → zapis z „Cofnij”. Odpowiedź `meal-parse` podstawiona – test nie woła modelu.
 */

test.use({ viewport: { width: 390, height: 780 }, isMobile: false, hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('trening:no-account', '1'))
})

/** Ustawienia konta wprost w Dexie (przełącznika `diet_enabled` nie ma w UI – włącza go SQL na koncie). */
async function patchSettings(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    (p) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('trening')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('settings', 'readwrite')
          const store = tx.objectStore('settings')
          const get = store.get('user')
          get.onsuccess = () => {
            const row = get.result ?? { key: 'user', value: {} }
            store.put({ ...row, value: { ...row.value, ...p }, updated_at: new Date().toISOString() })
          }
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    patch,
  )
}

// 1×1 px PNG wystarczy – podgląd i tak przychodzi z podstawionej odpowiedzi
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test('Jedzenie: karta tylko po włączeniu, etykieta → ilość → zapis i Cofnij', async ({ page }) => {
  await page.goto('/m?today=2026-09-23&hour=12')
  await expect(page.getByRole('heading', { name: 'Dziś' })).toBeVisible()
  await expect(page.getByText('Jedzenie', { exact: true })).toHaveCount(0)

  await patchSettings(page, { diet_enabled: true, height_cm: null, birth_year: null })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Jedzenie' })).toBeVisible()
  await expect(page.getByText('zjedzone 0 kcal')).toBeVisible()
  await expect(page.getByRole('button', { name: /Uzupełnij wzrost i datę urodzenia/ })).toBeVisible()

  await patchSettings(page, { height_cm: 180, birth_year: 1990 })
  await page.reload()
  await expect(page.getByText(/^0 z ~[\d\s ]+ kcal · zostało ~/)).toBeVisible()

  await page.route('**/functions/v1/meal-parse', (route) =>
    route.fulfill({
      json: {
        meal: {
          kind: 'label',
          name: 'Haribo Złote Misie',
          items: [],
          total: { kcal: 686, protein_g: 14, carbs_g: 154, fat_g: 1 },
          confidence: 0.95,
          question: null,
          label: { unit: 'g', per_100: { kcal: 343, protein_g: 6.9, carbs_g: 77, fat_g: 0.5 }, package: 200, serving: 25 },
          warnings: [],
        },
      },
    }),
  )
  await page.getByRole('button', { name: 'Dodaj posiłek' }).click()
  await page.getByLabel('Zdjęcie z galerii').setInputFiles({ name: 'etykieta.png', mimeType: 'image/png', buffer: PIXEL })
  await expect(page.getByAltText('Zdjęcie 1')).toBeVisible()
  // build bez VITE_SUPABASE_* (CI): rozpoznawanie wymaga konta – przycisk wyłączony z wyjaśnieniem, dalej nie ma czego sprawdzać
  if (await page.getByText('Rozpoznawanie zdjęć wymaga konta.').isVisible()) {
    await expect(page.getByRole('button', { name: 'Rozpoznaj' })).toBeDisabled()
    return
  }
  await page.getByRole('button', { name: 'Rozpoznaj' }).click()

  const sheet = page.getByRole('dialog', { name: 'Dodaj posiłek' })
  await expect(sheet.getByLabel('Nazwa posiłku')).toHaveValue('Haribo Złote Misie')
  await expect(sheet.getByText('686 kcal', { exact: true })).toBeVisible()
  await sheet.getByRole('radio', { name: 'Połowa' }).click()
  await expect(sheet.getByText('343 kcal', { exact: true })).toBeVisible()
  await sheet.getByLabel('Zjedzona ilość w g').fill('50')
  await expect(sheet.getByText('172 kcal', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Zapisz' }).last().click()

  await expect(page.getByText('Zapisane: 172 kcal · białko 3 g')).toBeVisible()
  await expect(page.getByText(/^172 z ~/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Haribo Złote Misie/ })).toBeVisible()

  await page.getByRole('button', { name: 'Cofnij' }).click()
  await expect(page.getByRole('button', { name: /Haribo Złote Misie/ })).toHaveCount(0)
  await expect(page.getByText(/^0 z ~/)).toBeVisible()
})
