import { expect, type Page } from '@playwright/test'

/**
 * Od 30.09.2026 program alpejski ma siłownię domyślnie wyłączoną (`gym_enabled`, przełącznik w Ustawieniach).
 * Testy sesji siłowych włączają ją tak jak użytkownik – przełącznikiem i zapisem ustawień.
 */
export async function enableGym(page: Page, today: string): Promise<void> {
  await page.goto(`/wiecej/ustawienia?today=${today}`)
  const box = page.getByRole('checkbox', { name: 'Siłownia w planie' })
  await expect(box).not.toBeChecked()
  await box.check()
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByRole('button', { name: 'Zapisano ✓' })).toBeVisible()
}
