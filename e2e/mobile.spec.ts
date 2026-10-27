import { expect, test } from '@playwright/test'

/** Mobilny v2 (`/m`, docs/24): karta stanu dnia, jazda, plan z menu dnia, Ja, Trener. Data i godzina z adresu (`?today=`, `?hour=`). */

test.use({ viewport: { width: 390, height: 780 }, isMobile: false, hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('trening:no-account', '1'))
})

test('Dziś: rano prosi o check-in, po check-inie pokazuje jazdę z celami; „Pokaż kroki” otwiera ekran jazdy', async ({ page }) => {
  await page.goto('/m?today=2026-09-23&hour=8')
  await expect(page.getByRole('heading', { name: 'Dziś' })).toBeVisible()
  await expect(page.getByText('Jak się czujesz?')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Nawigacja główna' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trener', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Wpisz ręcznie' }).click()
  const sheet = page.getByRole('dialog', { name: 'Check-in' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('radiogroup', { name: 'Nogi' }).getByRole('radio', { name: '3' }).click()
  await sheet.getByRole('button', { name: 'Zapisz' }).last().click()
  await expect(sheet).toBeHidden()

  // karta stanu: odprawa z nazwą jazdy i celami
  await expect(page.getByText('Baza tlenowa Z2')).toBeVisible()
  await expect(page.getByText('Jak się czujesz?')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Pokaż kroki' })).toBeVisible()
  await expect(page.getByText('check-in · Bolt · trening · RPE')).toBeVisible()
  await expect(page.getByText('Ten tydzień')).toBeVisible()

  await page.getByRole('button', { name: 'Pokaż kroki' }).click()
  await expect(page).toHaveURL(/\/m\/jazda\/2026-09-23/)
  await expect(page.getByRole('heading', { name: 'Baza tlenowa Z2' })).toBeVisible()
  await expect(page.getByText('Kroki')).toBeVisible()
})

test('Dzień wolny i dzień testu mają własne karty', async ({ page }) => {
  await page.goto('/m/dzien/2026-09-24?today=2026-09-24&hour=12')
  await expect(page.getByText('Jak się czujesz?')).toBeVisible()
  await expect(page.getByText('Dziś wolne')).toBeVisible()
  await page.goto('/m/dzien/2026-09-26?today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Sobota' })).toBeVisible()
  await expect(page.getByText('Test FTP 20 min (moc)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pokaż kroki' })).toBeVisible()
})

test('Plan: bilans tygodnia, siedem dni, strzałki zmieniają tydzień, przytrzymanie otwiera menu dnia z przenoszeniem', async ({ page }) => {
  await page.goto('/m/plan?today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible()
  await expect(page.getByText('Bilans tygodnia').nth(1)).toBeVisible()
  await expect(page.getByText('Tydzień 2 · 21.09–27.09', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Następny tydzień' }).click()
  await expect(page).toHaveURL(/\/m\/plan\/2026-09-28/)
  await page.getByRole('button', { name: 'Poprzedni tydzień' }).click()
  await expect(page).toHaveURL(/\/m\/plan\/2026-09-21/)

  // przytrzymanie piątkowej jazdy (25.09) → menu → lista dni wolnych (24.09 jest w przeszłości? nie – dziś 23.09)
  const row = page.locator('.m-pager > div').nth(1).locator('.m-hold').filter({ hasText: 'Pt' })
  await row.hover()
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()
  const menu = page.getByRole('dialog')
  await expect(menu).toBeVisible()
  await menu.getByText('Przenieś na inny dzień').click()
  await expect(page.getByRole('dialog', { name: 'Przenieś na…' })).toBeVisible()
  const target = page.getByRole('dialog').getByRole('button', { name: /24\.09/ })
  await expect(target).toBeEnabled()
  await target.click()
  await expect(page.getByText(/Przeniesione na/)).toBeVisible()
  // po przeniesieniu piątek jest wolny, czwartek ma jazdę; „Cofnij” przywraca
  await page.getByRole('button', { name: 'Cofnij' }).click()
  await expect(page.getByText('Przywrócono plan')).toBeVisible()
})

test('Ja: kafelki, test FTP, ustawienia z arkuszem progów', async ({ page }) => {
  await page.goto('/m/ja?today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible()
  await expect(page.getByText('Test FTP', { exact: true })).toBeVisible()
  await expect(page.getByText(/Następny: sob 26\.09/)).toBeVisible()
  await page.getByText('Progi i miernik', { exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Progi i miernik' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel('FTP w watach')).toBeVisible()
  await sheet.getByRole('button', { name: 'Zamknij' }).click()
  await expect(page.getByText('Wróć do poprzedniego wyglądu')).toBeVisible()
})

test('Trener: przycisk otwiera pełnoekranową rozmowę', async ({ page }) => {
  await page.goto('/m?today=2026-09-23&hour=8')
  await page.getByRole('button', { name: 'Trener', exact: true }).click()
  const chat = page.getByRole('dialog', { name: 'Trener' })
  await expect(chat).toBeVisible()
  // bez konfiguracji Supabase (CI) czat mówi, że wymaga konta; z konfiguracją są podpowiedzi
  await expect(chat.getByText(/Czat wymaga konta|Widzę Twój plan/)).toBeVisible()
  await chat.getByRole('button', { name: 'Zamknij' }).click()
  await expect(chat).toBeHidden()
})

test('Nic nie wystaje poza szerokość ekranu (bez paneli sąsiednich tygodni)', async ({ page }) => {
  const overflowing = async () =>
    page.evaluate(() => {
      const w = window.innerWidth
      const bad: string[] = []
      for (const el of document.querySelectorAll('body *')) {
        const panel = el.closest('.m-pager > div')
        if (panel && panel !== panel.parentElement?.children[1]) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (r.right > w + 0.6 || r.left < -0.6) bad.push(`${el.tagName}.${String(el.className).slice(0, 40)} [${Math.round(r.left)}–${Math.round(r.right)}]`)
      }
      return { bad, scrollWidth: document.documentElement.scrollWidth, innerWidth: w }
    })
  for (const path of ['/m?today=2026-09-23&hour=8', '/m/jazda/2026-09-26?today=2026-09-23', '/m/plan?today=2026-09-23', '/m/ja?today=2026-09-23', '/m/podsumowanie/2026-09-23?today=2026-09-23']) {
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: 'Nawigacja główna' })).toBeVisible()
    const r = await overflowing()
    expect(r.bad, `${path}: ${r.bad.join(', ')}`).toEqual([])
    expect(r.scrollWidth, path).toBeLessThanOrEqual(r.innerWidth)
  }
})

test('Intro (podgląd `?intro=`): scena pory roku i dnia, dotknięcie odsłania Dziś; bez parametru intro nie ma', async ({ page }) => {
  await page.goto('/m?today=2026-09-23&hour=8&intro=winter-night')
  const intro = page.getByTestId('intro')
  await expect(intro).toHaveAttribute('data-season', 'winter')
  await expect(intro).toHaveAttribute('data-time', 'night')
  await expect(intro).toHaveAttribute('data-phase', 'play')
  await expect(intro.locator('.intro-beam')).toHaveCount(1)
  await intro.click()
  await expect(intro).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Dziś' })).toBeVisible()

  await page.goto('/m?today=2026-09-23&hour=8')
  await expect(page.getByRole('heading', { name: 'Dziś' })).toBeVisible()
  await expect(page.getByTestId('intro')).toHaveCount(0)
})
