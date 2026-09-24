import { expect, test } from '@playwright/test'

/** Uproszczony interfejs iOS: przepływ dnia, szczegóły treningu, tydzień, postęp i powrót do pełnej aplikacji. */

// Emulacja telefonu w Chromium rezerwuje miejsce na pasek adresu (innerHeight > visualViewport),
// przez co dolny pasek zakładek wypada poza obszar klikalny. Aplikacja działa jako PWA na pełnym ekranie,
// więc testujemy bez tej rezerwy – sam viewport zostaje telefonowy.
test.use({ viewport: { width: 390, height: 780 }, isMobile: false, hasTouch: true })

// Uproszczony interfejs bez konta prosi o zalogowanie (dane biorą się z konta). Testy przepływu dnia
// pracują na danych lokalnych, więc pomijają ten ekran tak samo jak przycisk „Zobacz tylko plan, bez konta”.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('trening:no-account', '1'))
})

test('Dziś: karta treningu, kroki dnia i check-in', async ({ page }) => {
  await page.goto('/i?today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Dziś' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Baza tlenowa Z2' })).toBeVisible()
  await expect(page.getByText('kadencja')).toBeVisible()

  // pierwszy krok dnia to check-in i on jest wyróżniony jako działanie
  await page.getByRole('button', { name: 'Zrób check-in' }).click()
  await expect(page.getByRole('dialog', { name: 'Check-in' })).toBeVisible()
  await page.getByLabel('Waga w kilogramach').fill('106,5')
  await page.getByRole('radio', { name: '4' }).first().click()
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByRole('dialog', { name: 'Check-in' })).toBeHidden()

  // po check-inie następnym krokiem jest licznik
  await expect(page.getByRole('button', { name: 'Wyślij na Bolta' })).toBeVisible()
  await page.screenshot({ path: 'test-results/ios-today.png', fullPage: true })
})

test('Dziś → trening: kroki z celami i przełączenie na wersję pod dachem', async ({ page }) => {
  await page.goto('/i/trening/2026-09-26?today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Test FTP 20 min (moc)' })).toBeVisible()
  await expect(page.getByText('TEST 20 min – maksymalnie równo')).toBeVisible()
  await expect(page.getByText('Rozgrzewka', { exact: true })).toBeVisible()
  await expect(page.getByText('Wyślij na Bolta')).toBeVisible()
})

test('Podsumowanie jazdy zapisuje status dnia', async ({ page }) => {
  await page.goto('/i?today=2026-09-30')
  await page.getByRole('button', { name: 'Jak poszło?' }).click()
  await expect(page.getByRole('dialog', { name: 'Jak poszło?' })).toBeVisible()
  await page.getByText('Odpuszczone').click()
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('Odpuszczone', { exact: true }).first()).toBeVisible()
})

test('Tydzień i Postęp: liczby i nawigacja zakładkami', async ({ page }) => {
  await page.goto('/i?today=2026-09-23')
  await page.getByRole('link', { name: 'Tydzień' }).click()
  await expect(page.getByRole('heading', { name: 'Tydzień' })).toBeVisible()
  await expect(page.getByText('Test FTP 20 min (moc)')).toBeVisible()
  await page.getByRole('link', { name: 'Postęp' }).click()
  await expect(page.getByRole('heading', { name: 'Postęp' })).toBeVisible()
  await expect(page.getByText(/Cel: \d+ W/)).toBeVisible()
  await expect(page.getByText('FTP', { exact: true })).toBeVisible()
})

test('Na telefonie start otwiera prosty widok; da się przejść do pełnej aplikacji i wrócić', async ({ page }) => {
  // domyślnie (bez żadnego ustawienia) telefon startuje w uproszczonym widoku
  await page.goto('/?today=2026-09-23')
  await expect(page).toHaveURL(/\/i\?/)

  await page.getByRole('link', { name: 'Więcej' }).click()
  await expect(page.getByRole('button', { name: 'Nie otwieraj domyślnie' })).toBeVisible()
  await page.getByText('Otwórz pełną aplikację').click()
  await expect(page.getByRole('heading', { name: 'Tydzień 2' })).toBeVisible()

  // z pełnej aplikacji da się wrócić do prostego widoku
  await page.getByRole('link', { name: 'Więcej' }).click()
  await page.getByText("Prosty widok na iPhone'a").click()
  await expect(page.getByRole('heading', { name: 'Dziś' })).toBeVisible()
})

test('Wyłączenie domyślnego widoku zostawia start w pełnej aplikacji', async ({ page }) => {
  await page.goto('/i/wiecej?today=2026-09-23')
  await page.getByRole('button', { name: 'Nie otwieraj domyślnie' }).click()
  await expect(page.getByRole('button', { name: 'Otwieraj ten widok domyślnie' })).toBeVisible()
  await page.goto('/?today=2026-09-23')
  await expect(page.getByRole('heading', { name: 'Tydzień 2' })).toBeVisible()
})

test.describe('bez konta', () => {
  test.use({ viewport: { width: 390, height: 780 }, isMobile: false, hasTouch: true })

  test('prosi o zalogowanie zamiast pokazywać puste ekrany', async ({ page }) => {
    // ten blok celowo nie ustawia znacznika „bez konta”
    await page.addInitScript(() => sessionStorage.removeItem('trening:no-account'))
    await page.goto('/i?today=2026-09-23')
    await expect(page.getByRole('heading', { name: 'Trening' })).toBeVisible()
    await expect(page.getByText(/Zaloguj się, żeby zobaczyć swoje jazdy/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Wyślij kod na maila' })).toBeDisabled()
    await page.getByLabel('Adres e-mail').fill('ktos@example.com')
    await expect(page.getByRole('button', { name: 'Wyślij kod na maila' })).toBeEnabled()

    // da się obejrzeć sam plan bez konta
    await page.getByRole('button', { name: /Zobacz tylko plan, bez konta/ }).click()
    await expect(page.getByRole('heading', { name: 'Dziś' })).toBeVisible()
  })
})

test('Żaden panel nie wychodzi za krawędź ekranu', async ({ page }) => {
  // regresja: przycisk-karta z `width: 100%` i marginesem `.ios-card` wystawał 32 px za prawą krawędź
  const overflowing = async () =>
    page.evaluate(() => {
      const w = window.innerWidth
      const bad: string[] = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (r.right > w + 0.6 || r.left < -0.6) bad.push(`${el.tagName}.${String(el.className).slice(0, 40)} [${Math.round(r.left)}–${Math.round(r.right)}]`)
      }
      return { bad, scrollWidth: document.documentElement.scrollWidth, innerWidth: w }
    })

  for (const path of ['/i?today=2026-09-23', '/i/trening/2026-09-26?today=2026-09-23', '/i/tydzien?today=2026-09-23', '/i/postep?today=2026-09-23', '/i/wiecej?today=2026-09-23']) {
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: 'Nawigacja główna' })).toBeVisible()
    const r = await overflowing()
    expect(r.bad, `${path}: ${r.bad.join(', ')}`).toEqual([])
    expect(r.scrollWidth, path).toBeLessThanOrEqual(r.innerWidth)
  }

  // arkusze też
  await page.goto('/i?today=2026-09-23')
  for (const name of [/Poranny check-in/, /Podsumowanie/, /Odprawa/]) {
    await page.getByRole('button', { name }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const r = await overflowing()
    expect(r.bad, `arkusz ${name}: ${r.bad.join(', ')}`).toEqual([])
    await page.getByRole('button', { name: 'Zamknij' }).click()
  }
})
