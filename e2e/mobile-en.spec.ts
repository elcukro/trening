import { expect, test, type Page } from '@playwright/test'

/**
 * Mobilny v2 (`/m`) po angielsku (docs/34): główne ścieżki z `?lang=en` (wymusza język) i telefonem w en-GB.
 * Daty i godzina z adresu jak w `mobile.spec.ts`. Sprawdzamy angielskie nagłówki i brak polskich liter w tekstach ekranu.
 */

test.use({ viewport: { width: 390, height: 780 }, isMobile: false, hasTouch: true, locale: 'en-GB' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('trening:no-account', '1'))
})

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g

/** Tekst bieżącego ekranu (bez sąsiednich tygodni w Planie) nie ma polskich liter. */
async function expectNoPolish(page: Page, selector = '.m-screen') {
  const root = page.locator(selector).first()
  await expect(root).toBeVisible()
  const text = await root.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement
    // panele poprzedniego i następnego tygodnia są poza ekranem
    clone.querySelectorAll('.m-pager > div:not(:nth-child(2))').forEach((p) => p.remove())
    return clone.textContent ?? ''
  })
  expect(text.match(POLISH) ?? [], text).toEqual([])
}

test('Today: morning check-in, then the workout card; “Show steps” opens the workout screen', async ({ page }) => {
  await page.goto('/m?lang=en&today=2026-09-23&hour=8')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByText('How are you feeling?')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Coach', exact: true })).toBeVisible()
  await expectNoPolish(page)

  await page.getByRole('button', { name: 'Enter manually' }).click()
  const sheet = page.getByRole('dialog', { name: 'Check-in' })
  await expect(sheet).toBeVisible()
  await expectNoPolish(page, '.m-sheet')
  await sheet.getByRole('radiogroup', { name: 'Legs' }).getByRole('radio', { name: '3' }).click()
  await sheet.getByRole('button', { name: 'Save' }).last().click()
  await expect(sheet).toBeHidden()

  await expect(page.getByText('How are you feeling?')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Show steps' })).toBeVisible()
  await expect(page.getByText('check-in · Bolt · workout · RPE')).toBeVisible()
  await expect(page.getByText('This week', { exact: true })).toBeVisible()
  await expectNoPolish(page)

  await page.getByRole('button', { name: 'Show steps' }).click()
  await expect(page).toHaveURL(/\/m\/jazda\/2026-09-23/)
  await expect(page.getByText('Steps', { exact: true })).toBeVisible()
  await expectNoPolish(page)
})

test('Workout and summary screens of another day', async ({ page }) => {
  await page.goto('/m/jazda/2026-09-26?lang=en&today=2026-09-23')
  await expect(page.getByText('Steps', { exact: true })).toBeVisible()
  await expect(page.getByText('The briefing (weather, clothing, food) is on the day card.')).toBeVisible()
  await expectNoPolish(page)

  await page.goto('/m/dzien/2026-09-26?lang=en&today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Saturday' })).toBeVisible()
  await expectNoPolish(page)

  await page.goto('/m/podsumowanie/2026-09-23?lang=en&today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
  await expect(page.getByText('No Strava ride yet')).toBeVisible()
  await expectNoPolish(page)
})

test('Plan: week summary, arrows change the week, press and hold opens the day menu', async ({ page }) => {
  await page.goto('/m/plan?lang=en&today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible()
  await expect(page.getByText('Week so far').nth(1)).toBeVisible()
  await expect(page.getByText('Week 2 · 21 Sep–27 Sep', { exact: false })).toBeVisible()
  await expectNoPolish(page)
  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(page).toHaveURL(/\/m\/plan\/2026-09-28/)
  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(page).toHaveURL(/\/m\/plan\/2026-09-21/)

  const row = page.locator('.m-pager > div').nth(1).locator('.m-hold').filter({ hasText: 'Fr' })
  await row.hover()
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()
  const menu = page.getByRole('dialog')
  await expect(menu).toBeVisible()
  await expectNoPolish(page, '.m-sheet')
  await menu.getByText('Move to another day').click()
  await expect(page.getByRole('dialog', { name: 'Move to…' })).toBeVisible()
  const target = page.getByRole('dialog').getByRole('button', { name: /24 Sep/ })
  await expect(target).toBeEnabled()
  await target.click()
  await expect(page.getByText(/Moved to/)).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Plan restored')).toBeVisible()
})

test('Me: tiles, FTP test, thresholds sheet', async ({ page }) => {
  await page.goto('/m/ja?lang=en&today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
  await expect(page.getByText('FTP test', { exact: true })).toBeVisible()
  await expect(page.getByText(/Next: Sat 26 Sep/)).toBeVisible()
  await expect(page.getByText(/^Bicycle Coach /)).toBeVisible()
  await expectNoPolish(page)
  await page.getByText('Thresholds & power meter', { exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Thresholds & power meter' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel('FTP in watts')).toBeVisible()
  await expectNoPolish(page, '.m-sheet')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByText('Switch to the previous look')).toBeVisible()
})

test('Me → Language: system language by default, switching to Polish and back', async ({ page }) => {
  // bez `?lang` – język wynika z ustawienia (domyślnie systemowy, tu en-GB)
  await page.goto('/m/ja?today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Language/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Language' })
  await expect(sheet.getByRole('radio', { name: 'System language (English)' })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('radio', { name: 'Polski' }).click()
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible()

  await page.getByRole('button', { name: /^Język/ }).click()
  const pl = page.getByRole('dialog', { name: 'Język' })
  await expect(pl.getByRole('radio', { name: 'Polski' })).toHaveAttribute('aria-checked', 'true')
  await pl.getByRole('radio', { name: 'English', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
})

test('Coach: the button opens the full-screen chat', async ({ page }) => {
  await page.goto('/m?lang=en&today=2026-09-23&hour=8')
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  const chat = page.getByRole('dialog', { name: 'Coach' })
  await expect(chat).toBeVisible()
  await expect(chat.getByText(/Chat needs an account|I can see your plan/)).toBeVisible()
  await expectNoPolish(page, '.m-chat')
  await chat.getByRole('button', { name: 'Close' }).click()
  await expect(chat).toBeHidden()
})
